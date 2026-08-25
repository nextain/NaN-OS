// domain/herdr-control — #502 제어면의 순수 규칙 (FR-HERDR-CONTROL.1~10). #434 인수 기준 승계.
// 계약: docs/progress/issue-497-universal-agent.md.
// 순수. 전송도 프로세스도 여기 없다 — 전부 ports/herdr-control.ts 뒤.
// 핵심 불변식: 실행 정본은 Herdr 하나다. raw PTY stdin 과 private socket 은 제어 프로토콜이 아니다.
import { permits as permitsTier, requiresApproval as tierRequiresApproval, type CapabilityTier as Tier } from "./capability.js";

export type ResourceKind = "space" | "issue" | "session" | "agent" | "pane" | "terminal" | "operation";

export interface ResourceId {
  readonly kind: ResourceKind;
  readonly id: string;
}

export interface Resource {
  readonly id: ResourceId;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface Revision {
  readonly value: number;
}

/** 버전이 붙은 스냅샷 (FR-HERDR-CONTROL.1·2). */
export interface Snapshot {
  readonly schemaVersion: 1;
  readonly revision: Revision;
  readonly resources: readonly Resource[];
}

export type EventKind = "created" | "updated" | "removed";

export interface EventEnvelope {
  readonly schemaVersion: 1;
  readonly revision: Revision;
  readonly kind: EventKind;
  readonly resource: Resource;
}

/**
 * 구독 누락 감지 (FR-HERDR-CONTROL.2).
 * 개정이 하나씩 오르지 않으면 그 사이를 못 본 것이다. 정상으로 가장하지 않는다.
 */
export type SubscriptionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "gap"; readonly from: number; readonly to: number }
  | { readonly ok: false; readonly reason: "regressed"; readonly from: number; readonly to: number };

export function checkContinuity(lastSeen: Revision, incoming: Revision): SubscriptionCheck {
  if (incoming.value <= lastSeen.value) return { ok: false, reason: "regressed", from: lastSeen.value, to: incoming.value };
  if (incoming.value > lastSeen.value + 1) return { ok: false, reason: "gap", from: lastSeen.value, to: incoming.value };
  return { ok: true };
}

// 권한 등급 (FR-HERDR-CONTROL.6)은 에픽 공용 정의를 쓴다 — 여기서 따로 정의하지 않는다.
export { ALL_TIERS, permits, requiresApproval, type CapabilityTier } from "./capability.js";

/** 구조화된 명령 (FR-HERDR-CONTROL.3). 셸 문자열로 조립하지 않는다. */
export interface StructuredCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

const SHELL_METACHARACTERS = /[;&|><`$(){}\n\r]/;

/**
 * 명령이 실제로 구조화되어 있는가.
 * 실행 파일 자리에 셸 한 줄을 밀어 넣는 것이 가장 흔한 우회라 그것부터 막는다.
 */
export function isStructuredCommand(command: StructuredCommand): boolean {
  if (command.executable.trim().length === 0) return false;
  if (SHELL_METACHARACTERS.test(command.executable)) return false;
  if (/\s/.test(command.executable.trim())) return false;
  return true;
}

export interface MutationRequest {
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: Revision;
  readonly capability: Tier;
  readonly approvalRef?: string;
  readonly command?: StructuredCommand;
  readonly timeoutMs: number;
}

/** 결과 종류 (FR-HERDR-CONTROL.8). 하나로 뭉뚱그리지 않는다. */
export type OutcomeKind = "completed" | "failed" | "cancelled" | "timeout" | "disconnected" | "partial";

export interface MutationResult {
  readonly requestId: string;
  readonly outcome: OutcomeKind;
  readonly affected: readonly ResourceId[];
  /** 증거 참조. 비어 있는 성공은 만들지 않는다 (FR-HERDR-CONTROL.5). */
  readonly evidence: readonly string[];
}

export type RejectionCode = "stale-revision" | "capability-denied" | "approval-missing" | "unstructured-command";

export interface MutationRejection {
  readonly code: RejectionCode;
  readonly detail: string;
}

export interface AdmissionContext {
  readonly currentRevision: Revision;
  readonly grantedTiers: readonly Tier[];
}

/**
 * 변경 요청 수용 판정 (FR-HERDR-CONTROL.3·6·7).
 * 하나라도 걸리면 상태를 바꾸지 않는다 — fail-closed. 사유는 전부 돌려준다.
 */
export function admit(request: MutationRequest, context: AdmissionContext): readonly MutationRejection[] {
  const rejections: MutationRejection[] = [];
  if (request.expectedRevision.value !== context.currentRevision.value) {
    rejections.push({
      code: "stale-revision",
      detail: `기대 개정 ${request.expectedRevision.value}, 현재 ${context.currentRevision.value}`,
    });
  }
  if (!permitsTier(context.grantedTiers, request.capability)) {
    rejections.push({ code: "capability-denied", detail: `요구 등급 ${request.capability} 미부여` });
  }
  if (tierRequiresApproval(request.capability) && !request.approvalRef) {
    rejections.push({ code: "approval-missing", detail: `등급 ${request.capability} 는 건별 승인이 필요하다` });
  }
  if (request.command && !isStructuredCommand(request.command)) {
    rejections.push({ code: "unstructured-command", detail: `명령이 구조화되지 않았다: ${request.command.executable}` });
  }
  return rejections;
}

/** 성공 응답에 증거가 실렸는가 (FR-HERDR-CONTROL.5). */
export function hasEvidence(result: MutationResult): boolean {
  if (result.outcome !== "completed" && result.outcome !== "partial") return true;
  return result.evidence.length > 0 && result.affected.length > 0;
}

/** 재접속 정책 (FR-HERDR-CONTROL.9). 상한이 있고, 상한에 닿으면 정직하게 실패한다. */
export interface ReconnectPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export function shouldRetry(attempt: number, policy: ReconnectPolicy): boolean {
  return attempt < policy.maxAttempts;
}

/** 지수 백오프. 난수를 섞지 않아 같은 입력이면 같은 값이 나온다. */
export function backoffMs(attempt: number, policy: ReconnectPolicy): number {
  const raw = policy.baseDelayMs * 2 ** Math.max(0, attempt);
  return Math.min(policy.maxDelayMs, raw);
}

/**
 * 재접속 직후의 판단 (FR-HERDR-CONTROL.9).
 * 상태를 다시 관측하기 전에는 완료도 중단도 말할 수 없다.
 */
export type PostReconnectStance = "unknown-until-resynced" | "resynced";

export function stanceAfterReconnect(resynced: boolean): PostReconnectStance {
  return resynced ? "resynced" : "unknown-until-resynced";
}

/**
 * 생명주기 소유 검사 (FR-HERDR-CONTROL.10).
 * Herdr 가 소유한 자원 종류를 다른 주체가 함께 소유하면 중복이다.
 */
export const HERDR_OWNED: readonly ResourceKind[] = ["space", "session", "agent", "pane", "terminal"];

export function duplicateOwnership(otherOwnerKinds: readonly ResourceKind[]): readonly ResourceKind[] {
  return otherOwnerKinds.filter((k) => HERDR_OWNED.includes(k));
}

/** 컨텍스트 전달에서 제외할 값 (FR-HERDR-CONTROL.10, #434 승계). */
const SECRET_HINT = /(secret|token|password|passwd|api[-_]?key|credential)/i;

export function stripSecrets(attributes: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (!SECRET_HINT.test(k)) out[k] = v;
  }
  return out;
}
