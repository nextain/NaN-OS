// domain/env-tool — #499 브라우저·터미널 환경 도구의 순수 규칙 (FR-ENV-TOOL.1~9).
// 계약: docs/progress/issue-497-universal-agent.md.
// 순수. 브라우저도 프로세스도 여기 없다 — 전부 ports/env-tool.ts 뒤.
// 핵심 불변식: 페이지에 적힌 문장은 자료이지 지시가 아니다. 권한은 상속되지 않는다.
import { permits, requiresApproval, type CapabilityTier } from "./capability.js";
import { isWithinBoundary } from "./workspace-context.js";

/** 공통 작업 생명주기 (FR-ENV-TOOL.1). 브라우저와 터미널이 같은 상태를 쓴다. */
export type OperationState = "accepted" | "running" | "completed" | "failed" | "cancelled";

const TRANSITIONS: Readonly<Record<OperationState, readonly OperationState[]>> = {
  accepted: ["running", "cancelled", "failed"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: OperationState, to: OperationState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(state: OperationState): boolean {
  return TRANSITIONS[state].length === 0;
}

/** 요소를 가리키는 방법 (FR-ENV-TOOL.3). 참조가 우선이고 좌표는 예외다. */
export type ElementTarget =
  | { readonly kind: "reference"; readonly ref: string }
  | { readonly kind: "coordinate"; readonly x: number; readonly y: number; readonly why: string };

/** 좌표를 쓸 수밖에 없었다면 그 사실이 결과에 남아야 한다. */
export function coordinateFallbackNote(target: ElementTarget): string | null {
  return target.kind === "coordinate" ? `좌표 조작 사용: ${target.why}` : null;
}

/** 브라우저 증거 (FR-ENV-TOOL.6). 행동 전후를 설명할 수 있어야 한다. */
export interface BrowserEvidence {
  readonly snapshotRef: string;
  readonly screenshotRef: string;
  readonly url: string;
  readonly urlRevision: number;
}

/** 터미널 증거 (FR-ENV-TOOL.6). */
export interface TerminalEvidence {
  readonly exitCode: number | null;
  readonly outputRef: string;
  readonly artifactRefs: readonly string[];
}

export type Evidence = { readonly kind: "browser"; readonly value: BrowserEvidence } | { readonly kind: "terminal"; readonly value: TerminalEvidence };

export function hasEvidence(state: OperationState, evidence: Evidence | undefined): boolean {
  if (state !== "completed") return true;
  if (!evidence) return false;
  return evidence.kind === "browser"
    ? evidence.value.snapshotRef.length > 0 && evidence.value.url.length > 0
    : evidence.value.outputRef.length > 0;
}

/**
 * 페이지 내용은 자료다 (FR-ENV-TOOL.4).
 * 어떤 문장이 실려 있든 요구 권한이 달라지지 않는다는 것을 함수로 못 박는다.
 */
export interface PageObservation {
  readonly text: string;
}

export function capabilityForOperation(declared: CapabilityTier, _page?: PageObservation): CapabilityTier {
  return declared;
}

export interface EnvOperationRequest {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly capability: CapabilityTier;
  readonly approvalRef?: string;
  readonly timeoutMs: number;
  /** 터미널 작업일 때만. 워크스페이스 루트 기준 상대 경로여야 한다. */
  readonly cwd?: string;
  readonly target?: ElementTarget;
}

export type EnvRejectionCode = "capability-denied" | "approval-missing" | "workspace-escape" | "timeout-unbounded";

export interface EnvRejection {
  readonly code: EnvRejectionCode;
  readonly detail: string;
}

export interface EnvAdmissionContext {
  readonly grantedTiers: readonly CapabilityTier[];
  readonly page?: PageObservation;
}

/**
 * 수용 판정 (FR-ENV-TOOL.7·8·9). 하나라도 걸리면 실행하지 않는다.
 * 페이지 관측은 판정에 영향을 주지 않는다 — 넘겨받되 쓰지 않는다.
 */
export function admitEnvOperation(request: EnvOperationRequest, context: EnvAdmissionContext): readonly EnvRejection[] {
  const rejections: EnvRejection[] = [];
  const required = capabilityForOperation(request.capability, context.page);
  if (!permits(context.grantedTiers, required)) {
    rejections.push({ code: "capability-denied", detail: `요구 등급 ${required} 미부여` });
  }
  if (requiresApproval(required) && !request.approvalRef) {
    rejections.push({ code: "approval-missing", detail: `등급 ${required} 는 건별 승인이 필요하다` });
  }
  if (request.cwd !== undefined && !isWithinBoundary(request.cwd)) {
    rejections.push({ code: "workspace-escape", detail: `워크스페이스 경계 밖: ${request.cwd}` });
  }
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
    rejections.push({ code: "timeout-unbounded", detail: "모든 작업에는 상한이 있어야 한다" });
  }
  return rejections;
}

/** 종료 사유 (FR-ENV-TOOL.9). 취소·타임아웃·부분 실행은 성공으로 승격되지 않는다. */
export type TerminationCause = "finished" | "cancelled" | "timed-out";

export interface Termination {
  readonly state: OperationState;
  /** 이미 일어난 일. 취소·타임아웃이어도 남긴다. */
  readonly partialEffects: readonly string[];
}

export function terminate(cause: TerminationCause, partialEffects: readonly string[]): Termination {
  const state: OperationState = cause === "finished" ? "completed" : cause === "cancelled" ? "cancelled" : "failed";
  return { state, partialEffects };
}
