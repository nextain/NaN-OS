// ports/workspace-context — #501 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// substrate-agnostic — Tauri/OS 어휘를 누출하지 않는다.
import type { ContextDeclaration, ContextManifest, Diagnostic, ProjectDeclaration } from "../domain/workspace-context.js";
import type { CanonicalRoot } from "../domain/workspace.js";

/** 진입점을 읽어 선언을 산출한다. 없음·형식 오류는 진단으로 돌려준다 — 예외로 숨기지 않는다. */
export type ReadDeclaration =
  | { readonly ok: true; readonly declaration: ContextDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface WorkspaceContextSourcePort {
  /** 루트 진입점 선언. */
  readRootDeclaration(root: CanonicalRoot): Promise<ReadDeclaration>;
  /** 프로젝트 진입점 선언. */
  readProjectDeclaration(root: CanonicalRoot, project: string): Promise<ReadDeclaration>;
  /** 선언된 문서가 실제로 있는지. 없으면 declared-index-missing 진단의 근거가 된다. */
  documentExists(root: CanonicalRoot, relativePath: string): Promise<boolean>;
  /** 문서 본문. 선택된 문서만 읽는다. */
  readDocument(root: CanonicalRoot, relativePath: string): Promise<string>;
  /**
   * 문서 집합의 현재 지문. 디스크에서 바뀌면 값이 달라진다.
   * 개정 무효화의 근거 — 오래된 사본으로 답하지 않기 위해 쓴다 (FR-WORKSPACE-CONTEXT.6).
   */
  fingerprint(root: CanonicalRoot, relativePaths: readonly string[]): Promise<string>;
}

/** 타입이 선언된 워크스페이스 자원 (FR-WORKSPACE-CONTEXT.9). 각 자원은 스키마 버전과 개정을 함께 싣는다. */
export interface WorkspaceResources {
  current(): Promise<ContextManifest>;
  manifest(): Promise<ContextManifest>;
  documents(): Promise<readonly { readonly id: string; readonly path: string; readonly reason: string }[]>;
  projects(): Promise<readonly ProjectDeclaration[]>;
  skills(): Promise<readonly string[]>;
  governance(): Promise<readonly string[]>;
}
