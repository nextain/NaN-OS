// adapters/workspace-context-fs — #501 driven adapter. 실제 진입점 파일에서 선언을 읽는다.
// 파일 I/O 는 여기까지만. 선택·병합·경계 판정은 domain 이 한다.
//
// 읽는 형식: 진입점 Markdown 의 `## Mandatory Reads` 절에 백틱으로 적힌 경로가 필수 문서다.
// `## Projects` 절이 있으면 각 항목이 프로젝트 진입점이다. 선언되지 않은 문서는 보지 않는다 (FR.1).
// ⚠️ 주제가 붙은 선택 문서(FR.2)를 선언하는 절은 아직 정하지 않았다 — 실제 진입점들이 그 절을
//    갖고 있지 않다. 그래서 이 어댑터가 내놓는 optional 문서는 항상 비어 있다. 형식을 정하기 전까지
//    선택 로딩은 대역 선언으로만 검증된다(추측으로 주제를 지어내지 않는다).
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ReadDeclaration, WorkspaceContextSourcePort } from "../ports/workspace-context.js";
import type { CanonicalRoot } from "../domain/workspace.js";
import { diagnostic, isWithinBoundary, type ContextDeclaration, type DeclaredDocument, type ProjectDeclaration } from "../domain/workspace-context.js";

const HEADING = /^#{1,6}\s+(.*)$/;
const BACKTICKED = /`([^`]+)`/;

/** 지정한 제목으로 시작하는 절의 본문 줄. 다음 같은 수준 이상 제목에서 끊는다. */
export function sectionLines(markdown: string, titlePrefix: string): readonly string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let depth = 0;
  let inside = false;
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      const level = (line.match(/^#+/) ?? ["#"])[0].length;
      const title = (m[1] ?? "").trim();
      if (inside && level <= depth) break;
      if (!inside && title.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
        inside = true;
        depth = level;
      }
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

/** 목록 항목에서 첫 백틱 경로만 뽑는다. 설명 문구의 다른 백틱은 무시한다. */
function listedPaths(lines: readonly string[]): readonly string[] {
  const paths: string[] = [];
  for (const line of lines) {
    if (!/^\s*(?:[-*+]|\d+\.)\s/.test(line)) continue;
    const m = BACKTICKED.exec(line);
    const p = m?.[1]?.trim();
    if (p) paths.push(p);
  }
  return paths;
}

export function parseDeclaration(entrypoint: string, markdown: string): ContextDeclaration {
  const documents: DeclaredDocument[] = listedPaths(sectionLines(markdown, "Mandatory Reads")).map((path) => ({
    id: path,
    path,
    topics: [],
    bytes: 0,
  }));
  const projects: ProjectDeclaration[] = listedPaths(sectionLines(markdown, "Projects")).map((path) => ({
    name: path.split(/[\\/]/).filter((s) => s !== "projects")[0] ?? path,
    entrypoint: path,
    documents: [],
  }));
  return { entrypoint, documents, projects, skills: [], governance: [] };
}

export class FileSystemWorkspaceContextAdapter implements WorkspaceContextSourcePort {
  constructor(private readonly rootEntrypoint = "AGENTS.md") {}

  async readRootDeclaration(root: CanonicalRoot): Promise<ReadDeclaration> {
    return this.read(root, this.rootEntrypoint);
  }

  async readProjectDeclaration(root: CanonicalRoot, project: string): Promise<ReadDeclaration> {
    // 이름을 먼저 본다. `../x` 는 join 뒤 루트 안으로 정규화되므로 루트 기준 검사만으로는 잡히지 않는다 —
    // projects/ 하위라는 의도를 이름 단계에서 강제한다.
    if (project.length === 0 || /[\\/]/.test(project) || project === "." || project === "..") {
      return { ok: false, diagnostics: [diagnostic("outside-boundary", `projects/${project}`, root.path)] };
    }
    const relative = join("projects", project, this.rootEntrypoint);
    if (!isWithinBoundary(relative)) {
      return { ok: false, diagnostics: [diagnostic("outside-boundary", relative, root.path)] };
    }
    return this.read(root, relative);
  }

  async documentExists(root: CanonicalRoot, relativePath: string): Promise<boolean> {
    if (!isWithinBoundary(relativePath)) return false;
    try {
      await stat(join(root.path, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async readDocument(root: CanonicalRoot, relativePath: string): Promise<string> {
    if (!isWithinBoundary(relativePath)) throw new Error(`워크스페이스 경계 밖: ${relativePath}`);
    return readFile(join(root.path, relativePath), "utf8");
  }

  /** 크기와 수정 시각을 이어 붙인 지문. 파일이 바뀌면 값이 달라진다. */
  async fingerprint(root: CanonicalRoot, relativePaths: readonly string[]): Promise<string> {
    const parts: string[] = [];
    for (const relativePath of [...relativePaths].sort()) {
      try {
        const s = await stat(join(root.path, relativePath));
        parts.push(`${relativePath}:${s.size}:${s.mtimeMs}`);
      } catch {
        parts.push(`${relativePath}:없음`);
      }
    }
    return parts.join("|");
  }

  private async read(root: CanonicalRoot, relative: string): Promise<ReadDeclaration> {
    let body: string;
    try {
      body = await readFile(join(root.path, relative), "utf8");
    } catch {
      return { ok: false, diagnostics: [diagnostic("entrypoint-missing", relative, root.path)] };
    }
    const declaration = parseDeclaration(relative, body);
    if (declaration.documents.length === 0) {
      return { ok: false, diagnostics: [diagnostic("entrypoint-malformed", relative, root.path)] };
    }
    return { ok: true, declaration };
  }
}
