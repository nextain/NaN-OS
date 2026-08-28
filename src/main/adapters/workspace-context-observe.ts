// adapters/workspace-context-observe — #501 driven adapter. F2 관측 포트 위에 얹는다.
// 셸은 Tauri 웹뷰라 node:fs 가 없다. 파일 접근은 이미 EnvironmentObservePort 가 Rust 명령으로
// 감싸 두었으므로 그것을 재사용한다 — 파일 접근 경로를 두 벌 만들지 않는다.
//
// ⚠️ 지문의 한계: 이 경로에서 얻을 수 있는 것은 파일 크기뿐이라(workspace_file_size),
//    크기가 같은 편집은 자동으로 감지되지 않는다. 그래서 사용자가 직접 갱신할 수 있어야 하고,
//    이 한계는 계약 테스트가 명시적으로 고정한다(모르는 척하지 않는다).
import type { EnvironmentObservePort } from "../ports/f2.js";
import { isDenied, isFailure } from "../ports/f2.js";
import type { ReadDeclaration, WorkspaceContextSourcePort } from "../ports/workspace-context.js";
import type { CanonicalRoot } from "../domain/workspace.js";
import { diagnostic, isWithinBoundary } from "../domain/workspace-context.js";
import { isSafeProjectName, parseDeclaration } from "../domain/workspace-entrypoint.js";

function join(root: string, relative: string): string {
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/${relative}`;
}

export class ObservePortWorkspaceContextAdapter implements WorkspaceContextSourcePort {
  constructor(
    private readonly env: EnvironmentObservePort,
    private readonly rootEntrypoint = "AGENTS.md",
  ) {}

  async readRootDeclaration(root: CanonicalRoot): Promise<ReadDeclaration> {
    return this.read(root, this.rootEntrypoint);
  }

  async readProjectDeclaration(root: CanonicalRoot, project: string): Promise<ReadDeclaration> {
    if (!isSafeProjectName(project)) {
      return { ok: false, diagnostics: [diagnostic("outside-boundary", `projects/${project}`, root.path)] };
    }
    return this.read(root, `projects/${project}/${this.rootEntrypoint}`);
  }

  async documentExists(root: CanonicalRoot, relativePath: string): Promise<boolean> {
    if (!isWithinBoundary(relativePath)) return false;
    const status = await this.env.fileStatus(join(root.path, relativePath));
    return !isDenied(status) && status.value !== null;
  }

  async readDocument(root: CanonicalRoot, relativePath: string): Promise<string> {
    if (!isWithinBoundary(relativePath)) throw new Error(`워크스페이스 경계 밖: ${relativePath}`);
    const result = await this.env.readFile(join(root.path, relativePath));
    if (isDenied(result)) throw new Error(`권한 거부: ${relativePath}`);
    if (isFailure(result)) throw new Error(`읽기 실패: ${relativePath} — ${result.reason}`);
    return result;
  }

  /** 크기만으로 만든 지문. 같은 크기 편집은 잡지 못한다 — 갱신은 사용자가 부를 수 있어야 한다. */
  async fingerprint(root: CanonicalRoot, relativePaths: readonly string[]): Promise<string> {
    const parts: string[] = [];
    for (const relativePath of [...relativePaths].sort()) {
      const status = await this.env.fileStatus(join(root.path, relativePath));
      parts.push(`${relativePath}:${isDenied(status) ? "거부" : (status.value ?? "없음")}`);
    }
    return parts.join("|");
  }

  private async read(root: CanonicalRoot, relative: string): Promise<ReadDeclaration> {
    const body = await this.env.readFile(join(root.path, relative));
    if (isDenied(body) || isFailure(body)) {
      return { ok: false, diagnostics: [diagnostic("entrypoint-missing", relative, root.path)] };
    }
    const declaration = parseDeclaration(relative, body);
    if (declaration.documents.length === 0) {
      return { ok: false, diagnostics: [diagnostic("entrypoint-malformed", relative, root.path)] };
    }
    return { ok: true, declaration };
  }
}
