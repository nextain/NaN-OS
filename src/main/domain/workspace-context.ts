// domain/workspace-context — #501 워크스페이스 컨텍스트 해석의 순수 규칙 (FR-WORKSPACE-CONTEXT.1~9).
// 계약: docs/progress/issue-497-universal-agent.md.
// 순수. 파일 I/O 0 — 읽기는 전부 ports/workspace-context.ts 뒤.
// 핵심 불변식: 컨텍스트는 권한이 아니다. 어떤 문서를 읽었다는 사실이 그 경로에 대한 변경 권한이 되지 않는다.
import type { CanonicalRoot } from "./workspace.js";

/** 컨텍스트가 루트 범위인지 특정 프로젝트 범위인지. */
export type ContextScope = { readonly kind: "root" } | { readonly kind: "project"; readonly name: string };

export function rootScope(): ContextScope {
  return { kind: "root" };
}
export function projectScope(name: string): ContextScope {
  return { kind: "project", name };
}

/** 진입점이 선언한 문서 하나. 선언되지 않은 문서는 발견 대상이 아니다 (FR.1). */
export interface DeclaredDocument {
  readonly id: string;
  /** 워크스페이스 루트 기준 상대 경로. */
  readonly path: string;
  /** 이 문서가 어떤 주제에 필요한지. 빈 배열 = 항상 필요(필수 인덱스). */
  readonly topics: readonly string[];
  readonly bytes: number;
  /** 이 문서를 선언한 진입점. 병합을 거쳐도 근거가 바뀌지 않도록 문서에 붙여 둔다. */
  readonly declaredBy?: string;
}

export interface ProjectDeclaration {
  readonly name: string;
  readonly entrypoint: string;
  readonly documents: readonly DeclaredDocument[];
}

/** 진입점 하나가 선언한 전체. 이름을 코드에 박지 않고 여기서만 읽는다 (FR.1). */
export interface ContextDeclaration {
  readonly entrypoint: string;
  readonly documents: readonly DeclaredDocument[];
  readonly projects: readonly ProjectDeclaration[];
  readonly skills: readonly string[];
  readonly governance: readonly string[];
}

/** 현재 사용자 의도. 무엇을 로드할지는 이것이 정한다 (FR.2). */
export interface LoadIntent {
  readonly topics: readonly string[];
}

/** 로드 상한. 넘으면 조용히 자르지 않고 무엇을 못 실었는지 남긴다 (FR.2). */
export interface LoadLimits {
  readonly maxDocuments: number;
  readonly maxBytes: number;
}

/** 왜 이 문서를 읽었는가. 사용자가 물으면 답할 수 있어야 한다 (FR.2). */
export type LoadReason = "mandatory" | "intent-topic";

export interface LoadedDocument {
  readonly ref: DeclaredDocument;
  readonly reason: LoadReason;
  /** 어느 선언이 이 문서를 요구했는지 — 루트 진입점 또는 프로젝트 진입점. */
  readonly declaredBy: string;
  readonly scope: ContextScope;
}

export interface Selection {
  readonly loaded: readonly LoadedDocument[];
  /** 상한 때문에 싣지 못한 문서. 비어 있지 않으면 컨텍스트는 불완전하다. */
  readonly dropped: readonly DeclaredDocument[];
  readonly totalBytes: number;
}

function matchesIntent(doc: DeclaredDocument, intent: LoadIntent): boolean {
  return doc.topics.some((t) => intent.topics.includes(t));
}

/**
 * 선택 로딩 (FR.2). 필수 문서를 먼저 싣고, 그다음 의도에 걸리는 문서를 싣는다.
 * 상한을 넘는 문서는 dropped 로 남긴다 — 조용한 절단은 없다.
 * 같은 입력이면 같은 순서로 나온다.
 */
export function selectDocuments(
  declaration: ContextDeclaration,
  intent: LoadIntent,
  limits: LoadLimits,
  scope: ContextScope = rootScope(),
): Selection {
  const mandatory = declaration.documents.filter((d) => d.topics.length === 0);
  const optional = declaration.documents.filter((d) => d.topics.length > 0 && matchesIntent(d, intent));
  const loaded: LoadedDocument[] = [];
  const dropped: DeclaredDocument[] = [];
  let bytes = 0;
  for (const [docs, reason] of [
    [mandatory, "mandatory"],
    [optional, "intent-topic"],
  ] as const) {
    for (const doc of docs) {
      if (loaded.length >= limits.maxDocuments || bytes + doc.bytes > limits.maxBytes) {
        dropped.push(doc);
        continue;
      }
      bytes += doc.bytes;
      loaded.push({ ref: doc, reason, declaredBy: doc.declaredBy ?? declaration.entrypoint, scope });
    }
  }
  return { loaded, dropped, totalBytes: bytes };
}

/** 컨텍스트 개정 (FR.6). 단조 증가하며 구성 문서를 함께 들고 다닌다. */
export interface ContextRevision {
  readonly value: number;
}

export interface ContextManifest {
  readonly schemaVersion: 1;
  readonly root: CanonicalRoot;
  readonly scope: ContextScope;
  readonly revision: ContextRevision;
  readonly intent: LoadIntent;
  readonly selection: Selection;
}

export function firstRevision(): ContextRevision {
  return { value: 1 };
}
export function nextRevision(prev: ContextRevision): ContextRevision {
  return { value: prev.value + 1 };
}

/**
 * 프로젝트 진입 (FR.3). 루트 선언 위에 프로젝트 선언을 얹는다.
 * 같은 주제를 다루는 문서는 프로젝트 것이 이긴다 — 루트가 프로젝트를 대신하지 않는다.
 */
export function mergeProjectDeclaration(root: ContextDeclaration, project: ProjectDeclaration): ContextDeclaration {
  const projectTopics = new Set(project.documents.flatMap((d) => d.topics));
  const projectPaths = new Set(project.documents.map((d) => d.path));
  const survivingRootDocs = root.documents
    // 같은 경로를 양쪽이 선언하면 프로젝트 것 하나만 남긴다. 두 번 실으면 예산도 두 번 쓰고
    // 근거 목록에도 같은 파일이 두 줄로 나온다(2026-08-26 실 UI 에서 드러났다).
    .filter((d) => !projectPaths.has(d.path))
    .filter((d) => d.topics.length === 0 || !d.topics.some((t) => projectTopics.has(t)))
    // 루트가 선언한 문서의 근거는 루트 진입점이다. 병합했다고 프로젝트가 선언한 것처럼 보이면 안 된다.
    .map((d) => ({ ...d, declaredBy: d.declaredBy ?? root.entrypoint }));
  const projectDocs = project.documents.map((d) => ({ ...d, declaredBy: d.declaredBy ?? project.entrypoint }));
  return {
    entrypoint: project.entrypoint,
    documents: [...survivingRootDocs, ...projectDocs],
    projects: root.projects,
    skills: root.skills,
    governance: root.governance,
  };
}

/**
 * 프로젝트 전환 (FR.5). 이전 프로젝트의 지역 문서를 버리고 사용자가 명시한 의도만 남긴다.
 * 루트 범위 문서는 남는다 — 그것은 지역 컨텍스트가 아니다.
 */
export function dropProjectScoped(selection: Selection): Selection {
  const loaded = selection.loaded.filter((d) => d.scope.kind === "root");
  return { loaded, dropped: selection.dropped, totalBytes: loaded.reduce((a, d) => a + d.ref.bytes, 0) };
}

/**
 * 쓰기 권한 (FR.4). 읽은 문서를 쳐다보지도 않는다 — 명시적으로 부여된 경로만 반환한다.
 * 부모 워크스페이스, 형제 프로젝트, 직전 프로젝트의 선언은 어떤 경우에도 권한이 되지 않는다.
 */
export function resolveWriteScope(_manifest: ContextManifest, explicitGrants: readonly string[]): readonly string[] {
  return [...explicitGrants];
}

export type DiagnosticCode = "entrypoint-missing" | "entrypoint-malformed" | "declared-index-missing" | "outside-boundary";

/** 실패 보고 (FR.7). 무엇을 어디서 찾았고 사용자가 뭘 하면 되는지까지 담는다. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly target: string;
  readonly searchedIn: string;
  readonly action: string;
}

export function diagnostic(code: DiagnosticCode, target: string, searchedIn: string): Diagnostic {
  const action: Record<DiagnosticCode, string> = {
    "entrypoint-missing": `진입점 ${target} 을(를) 만들고 필수 인덱스를 선언한다.`,
    "entrypoint-malformed": `진입점 ${target} 의 형식을 고친다. 필수 인덱스 선언을 읽을 수 없다.`,
    "declared-index-missing": `진입점이 선언한 ${target} 을(를) 만들거나 선언에서 뺀다.`,
    "outside-boundary": `${target} 은(는) 워크스페이스 경계 밖을 가리킨다. 경로를 경계 안으로 바꾼다.`,
  };
  return { code, target, searchedIn, action: action[code] };
}

export type DiscoveryResult = { readonly ok: true; readonly declaration: ContextDeclaration } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * 경계 검사 (FR.8). 상위 경로 표기와 절대 경로를 모두 막는다.
 * 정규화 결과가 루트 안에 갇혀 있어야 하고, 그 전에 세그먼트 자체가 탈출을 시도하지 않아야 한다.
 */
export function isWithinBoundary(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) return false;
  const parts = relativePath.split(/[\\/]+/);
  let depth = 0;
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      depth -= 1;
      if (depth < 0) return false;
      continue;
    }
    depth += 1;
  }
  return true;
}

/** 선언 전체의 경계 검사. 위반한 경로마다 진단을 남긴다 — 조용한 무시는 없다 (FR.8). */
export function checkDeclarationBoundary(declaration: ContextDeclaration, searchedIn: string): readonly Diagnostic[] {
  const bad: Diagnostic[] = [];
  for (const doc of declaration.documents) {
    if (!isWithinBoundary(doc.path)) bad.push(diagnostic("outside-boundary", doc.path, searchedIn));
  }
  for (const project of declaration.projects) {
    if (!isWithinBoundary(project.entrypoint)) bad.push(diagnostic("outside-boundary", project.entrypoint, searchedIn));
  }
  return bad;
}
