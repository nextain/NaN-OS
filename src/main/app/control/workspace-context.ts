// app/control/workspace-context — #501 조립 (FR-WORKSPACE-CONTEXT.1~9). 포트만 사용. 판정 규칙 0.
// 선택·병합·경계·개정 규칙은 전부 domain/workspace-context 의 순수 함수가 한다.
import type { ReadDeclaration, WorkspaceContextSourcePort } from "../../ports/workspace-context.js";
import type { CanonicalRoot } from "../../domain/workspace.js";
import {
  checkDeclarationBoundary,
  diagnostic,
  dropProjectScoped,
  firstRevision,
  mergeProjectDeclaration,
  nextRevision,
  projectScope,
  rootScope,
  selectDocuments,
  type ContextDeclaration,
  type ContextManifest,
  type ContextRevision,
  type Diagnostic,
  type LoadIntent,
  type LoadLimits,
  type ProjectDeclaration,
  type Selection,
} from "../../domain/workspace-context.js";

export type ResolveOutcome =
  | { readonly ok: true; readonly manifest: ContextManifest }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** 오래된 개정으로 답하려 할 때의 거절 (FR-WORKSPACE-CONTEXT.6). */
export class StaleRevisionError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`오래된 컨텍스트 개정 ${expected} — 현재는 ${actual}`);
    this.name = "StaleRevisionError";
  }
}

export class WorkspaceContextService {
  private manifest: ContextManifest | null = null;
  private rootDeclaration: ContextDeclaration | null = null;
  private fingerprint = "";

  constructor(
    private readonly source: WorkspaceContextSourcePort,
    private readonly limits: LoadLimits,
  ) {}

  /** 루트 발견 (FR.1·2·7·8). 선언되지 않은 문서는 보지 않는다. */
  async discover(root: CanonicalRoot, intent: LoadIntent): Promise<ResolveOutcome> {
    const read = await this.source.readRootDeclaration(root);
    const checked = await this.validate(root, read);
    if (!checked.ok) return checked;
    this.rootDeclaration = checked.declaration;
    const selection = selectDocuments(checked.declaration, intent, this.limits, rootScope());
    return this.publish(root, rootScope(), intent, selection, firstRevision());
  }

  /** 프로젝트 진입 (FR.3·4). 작업 디렉터리 변경이 아니라 컨텍스트 전환이다. */
  async enterProject(name: string, intent: LoadIntent): Promise<ResolveOutcome> {
    const current = this.requireManifest();
    const read = await this.source.readProjectDeclaration(current.root, name);
    const checked = await this.validate(current.root, read);
    if (!checked.ok) return checked;
    // 프로젝트 진입점은 자기 문서를 스스로 선언한다. 루트의 프로젝트 목록을 되짚지 않는다 —
    // 되짚으면 프로젝트 전용 진입점이 무시되고 루트가 프로젝트를 대신하게 된다.
    const project = { name, entrypoint: checked.declaration.entrypoint, documents: checked.declaration.documents };
    const merged = mergeProjectDeclaration(this.rootDeclaration ?? checked.declaration, project);
    const selection = selectDocuments(merged, intent, this.limits, projectScope(name));
    return this.publish(current.root, projectScope(name), intent, selection, nextRevision(current.revision));
  }

  /** 프로젝트 전환 (FR.5). 이전 지역 컨텍스트를 버리고 명시된 의도는 유지한다. */
  async switchProject(name: string): Promise<ResolveOutcome> {
    const current = this.requireManifest();
    const kept = dropProjectScoped(current.selection);
    this.manifest = { ...current, selection: kept, revision: nextRevision(current.revision) };
    return this.enterProject(name, current.intent);
  }

  /** 갱신 (FR.6). 디스크에서 바뀌었으면 개정을 올리고 다시 싣는다. */
  async refresh(): Promise<ResolveOutcome> {
    const current = this.requireManifest();
    const paths = current.selection.loaded.map((d) => d.ref.path);
    const now = await this.source.fingerprint(current.root, paths);
    if (now === this.fingerprint) return { ok: true, manifest: current };
    const declaration = this.rootDeclaration;
    if (!declaration) return { ok: false, diagnostics: [diagnostic("entrypoint-missing", "root", current.root.path)] };
    const selection = selectDocuments(declaration, current.intent, this.limits, current.scope);
    return this.publish(current.root, current.scope, current.intent, selection, nextRevision(current.revision));
  }

  /** 선택된 문서만 읽는다. 오래된 개정으로는 읽지 못한다 (FR.2·6). */
  async readContext(id: string, revision: ContextRevision): Promise<string> {
    const current = this.requireManifest();
    if (revision.value !== current.revision.value) throw new StaleRevisionError(revision.value, current.revision.value);
    const doc = current.selection.loaded.find((d) => d.ref.id === id);
    if (!doc) throw new Error(`선택되지 않은 문서: ${id}`);
    return this.source.readDocument(current.root, doc.ref.path);
  }

  current(): ContextManifest | null {
    return this.manifest;
  }

  /** workspace://projects (FR-WORKSPACE-CONTEXT.9). 루트 진입점이 선언한 것만 돌려준다. */
  projects(): readonly ProjectDeclaration[] {
    return this.rootDeclaration?.projects ?? [];
  }

  /** workspace://skills (FR-WORKSPACE-CONTEXT.9). */
  skills(): readonly string[] {
    return this.rootDeclaration?.skills ?? [];
  }

  /** workspace://governance (FR-WORKSPACE-CONTEXT.9). */
  governance(): readonly string[] {
    return this.rootDeclaration?.governance ?? [];
  }

  private requireManifest(): ContextManifest {
    if (!this.manifest) throw new Error("컨텍스트가 아직 확정되지 않았다 — discover 를 먼저 부른다.");
    return this.manifest;
  }

  private async validate(root: CanonicalRoot, read: ReadDeclaration): Promise<ReadDeclaration> {
    if (!read.ok) return read;
    const boundary = checkDeclarationBoundary(read.declaration, root.path);
    if (boundary.length > 0) return { ok: false, diagnostics: boundary };
    const missing: Diagnostic[] = [];
    for (const doc of read.declaration.documents) {
      if (!(await this.source.documentExists(root, doc.path))) {
        missing.push(diagnostic("declared-index-missing", doc.path, root.path));
      }
    }
    return missing.length > 0 ? { ok: false, diagnostics: missing } : read;
  }

  private async publish(
    root: CanonicalRoot,
    scope: ContextManifest["scope"],
    intent: LoadIntent,
    selection: Selection,
    revision: ContextRevision,
  ): Promise<ResolveOutcome> {
    this.fingerprint = await this.source.fingerprint(root, selection.loaded.map((d) => d.ref.path));
    this.manifest = { schemaVersion: 1, root, scope, revision, intent, selection };
    return { ok: true, manifest: this.manifest };
  }
}
