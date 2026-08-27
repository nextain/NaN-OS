// adapters/workspace-context-fs — #501 driven adapter. 실제 진입점 파일에서 선언을 읽는다.
// 파일 I/O 는 여기까지만. 선택·병합·경계 판정은 domain 이 한다.
// 파싱은 domain/workspace-entrypoint 가 한다 — 어댑터가 둘이라 파서를 한쪽에 두면 다른 쪽이 끌려온다.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ReadDeclaration, WorkspaceContextSourcePort } from "../../main/ports/workspace-context.js";
import { isSafeProjectName, parseDeclaration } from "../../main/domain/workspace-entrypoint.js";
import type { CanonicalRoot } from "../../main/domain/workspace.js";
import { diagnostic, isWithinBoundary } from "../../main/domain/workspace-context.js";

export class FileSystemWorkspaceContextAdapter implements WorkspaceContextSourcePort {
  constructor(private readonly rootEntrypoint = "AGENTS.md") {}

  async readRootDeclaration(root: CanonicalRoot): Promise<ReadDeclaration> {
    return this.read(root, this.rootEntrypoint);
  }

  async readProjectDeclaration(root: CanonicalRoot, project: string): Promise<ReadDeclaration> {
    // 이름을 먼저 본다. `../x` 는 join 뒤 루트 안으로 정규화되므로 루트 기준 검사만으로는 잡히지 않는다 —
    // projects/ 하위라는 의도를 이름 단계에서 강제한다.
    if (!isSafeProjectName(project)) {
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

export { parseDeclaration, sectionLines } from "../../main/domain/workspace-entrypoint.js";
