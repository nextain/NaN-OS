// domain/orchestration — #500 이슈 리더와 코딩 작업자의 순수 규칙 (FR-ORCHESTRATION.1~10).
// 계약: docs/progress/issue-497-universal-agent.md. FR-HERDR.4 의 P4 를 구체화한다.
// 순수. 프로세스도 GitHub 도 여기 없다 — 전부 ports/orchestration.ts 뒤.
// 핵심 불변식: 작업자는 자기 권한을 넓히지 못하고 이슈 완료를 선언하지 못한다.
import { requiresHumanDecision, type CapabilityTier } from "./capability.js";

/** 요청을 대화로 끝낼 것인가 이슈로 만들 것인가 (FR-ORCHESTRATION.1). */
export type TaskClass = "conversational" | "issue-worthy";

export interface ClassificationSignals {
  /** 저장소 파일을 바꿔야 하는가. */
  readonly mutatesRepository: boolean;
  /** 여러 단계로 나뉘는가. */
  readonly multiStep: boolean;
  /** 검증이 필요한가. */
  readonly needsVerification: boolean;
}

export interface Classification {
  readonly taskClass: TaskClass;
  readonly reasons: readonly string[];
  /** 사용자가 뒤집었는가. 뒤집힌 판단은 근거와 함께 남는다. */
  readonly overridden: boolean;
}

export function classify(signals: ClassificationSignals): Classification {
  const reasons: string[] = [];
  if (signals.mutatesRepository) reasons.push("저장소를 바꾼다");
  if (signals.multiStep) reasons.push("여러 단계로 나뉜다");
  if (signals.needsVerification) reasons.push("독립 검증이 필요하다");
  return { taskClass: reasons.length > 0 ? "issue-worthy" : "conversational", reasons, overridden: false };
}

/** 사용자가 뒤집으면 그대로 따른다 — 근거는 남긴다 (FR-ORCHESTRATION.1). */
export function overrideClassification(previous: Classification, taskClass: TaskClass, reason: string): Classification {
  return { taskClass, reasons: [...previous.reasons, `사용자 지정: ${reason}`], overridden: true };
}

/** 이슈와 Herdr space 의 결속 (FR-ORCHESTRATION.2). 이슈 하나에 space 하나다. */
export interface IssueBinding {
  readonly issue: string;
  readonly spaceId: string;
}

export type BindingRejection = "issue-already-bound" | "space-already-bound";

export function bindIssue(existing: readonly IssueBinding[], binding: IssueBinding): readonly BindingRejection[] {
  const rejections: BindingRejection[] = [];
  if (existing.some((b) => b.issue === binding.issue && b.spaceId !== binding.spaceId)) rejections.push("issue-already-bound");
  if (existing.some((b) => b.spaceId === binding.spaceId && b.issue !== binding.issue)) rejections.push("space-already-bound");
  return rejections;
}

export type WorkerRole = "implementer" | "tester" | "reviewer" | "researcher";
export type WorkerProvider = "codex" | "claude" | "opencode" | "shell";

export interface WorkerAssignment {
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly provider: WorkerProvider;
  /** 이 작업자가 바꿔도 되는 경로. 워크스페이스 루트 기준 상대. */
  readonly ownedPaths: readonly string[];
}

/** 리더는 이슈마다 하나다 (FR-ORCHESTRATION.3). */
export interface IssueLeader {
  readonly issue: string;
  readonly leaderId: string;
}

export function leaderConflict(existing: readonly IssueLeader[], candidate: IssueLeader): boolean {
  return existing.some((l) => l.issue === candidate.issue && l.leaderId !== candidate.leaderId);
}

function normalize(path: string): string {
  return path.replace(/\\+/g, "/").replace(/\/+$/, "");
}

/** 두 경로가 겹치는가. 같은 경로이거나 한쪽이 다른 쪽의 상위다. */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export interface OwnershipConflict {
  readonly a: string;
  readonly b: string;
  readonly path: string;
  readonly otherPath: string;
}

/** 소유 경로 중첩 (FR-ORCHESTRATION.5). 겹치면 배치하지 않거나 직렬화한다. */
export function ownershipConflicts(assignments: readonly WorkerAssignment[]): readonly OwnershipConflict[] {
  const conflicts: OwnershipConflict[] = [];
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      const left = assignments[i] as WorkerAssignment;
      const right = assignments[j] as WorkerAssignment;
      for (const p of left.ownedPaths) {
        for (const q of right.ownedPaths) {
          if (pathsOverlap(p, q)) conflicts.push({ a: left.workerId, b: right.workerId, path: p, otherPath: q });
        }
      }
    }
  }
  return conflicts;
}

/** 구현자가 자기 결과의 독립 검증자가 될 수 없다 (FR-ORCHESTRATION.4). */
export function hasIndependentVerifier(assignments: readonly WorkerAssignment[]): boolean {
  const implementers = assignments.filter((a) => a.role === "implementer").map((a) => a.workerId);
  const verifiers = assignments.filter((a) => a.role === "tester" || a.role === "reviewer");
  return implementers.length > 0 && verifiers.some((v) => !implementers.includes(v.workerId));
}

/** 위임 위험도 (FR-ORCHESTRATION.7). 워크스페이스 terminology 정의를 따른다. */
export type DelegationRisk = "low" | "medium" | "high";

export function riskOf(tiers: readonly CapabilityTier[]): DelegationRisk {
  if (tiers.some(requiresHumanDecision)) return "high";
  if (tiers.some((t) => t !== "observe" && t !== "workspace-write")) return "high";
  return tiers.includes("workspace-write") ? "medium" : "low";
}

export function isDelegatable(risk: DelegationRisk): boolean {
  return risk !== "high";
}

/** 작업자에게 내려가는 브리프. 대화 전문을 복사하지 않는다 (FR-ORCHESTRATION.7). */
export interface DelegationBrief {
  readonly workerId: string;
  readonly issue: string;
  readonly intent: string;
  readonly contextRevision: string;
  readonly grantedTiers: readonly CapabilityTier[];
  readonly ownedPaths: readonly string[];
  readonly successCriteria: readonly string[];
  readonly tokenBudget: number;
}

export type BriefRejectionCode = "transcript-copied" | "secret-included" | "no-success-criteria" | "no-budget" | "high-risk";

export function checkBrief(brief: DelegationBrief, transcript: string): readonly BriefRejectionCode[] {
  const codes: BriefRejectionCode[] = [];
  if (transcript.length > 0 && brief.intent.includes(transcript)) codes.push("transcript-copied");
  if (/(secret|token|password|api[-_]?key)/i.test(brief.intent)) codes.push("secret-included");
  if (brief.successCriteria.length === 0) codes.push("no-success-criteria");
  if (brief.tokenBudget <= 0) codes.push("no-budget");
  if (!isDelegatable(riskOf(brief.grantedTiers))) codes.push("high-risk");
  return codes;
}

/** 작업자가 돌려보낸 보고 (FR-ORCHESTRATION.6). 완료 선언과 권한 확장은 무시된다. */
export interface WorkerReport {
  readonly workerId: string;
  readonly evidence: readonly string[];
  /** 작업자가 스스로 완료라 말했는가. 판정에 쓰이지 않는다. */
  readonly claimsIssueComplete: boolean;
  /** 작업자가 추가로 달라고 한 권한. 절대 부여되지 않는다. */
  readonly requestedTiers: readonly CapabilityTier[];
}

export interface AcceptedReport {
  readonly workerId: string;
  readonly evidence: readonly string[];
  /** 항상 false. 완료 판정은 L2 가 증거를 모아 L3 에 올린다. */
  readonly issueComplete: false;
  /** 부여된 등급은 브리프의 것 그대로다. 요청은 반영되지 않는다. */
  readonly effectiveTiers: readonly CapabilityTier[];
  readonly ignoredEscalations: readonly CapabilityTier[];
}

export function acceptReport(brief: DelegationBrief, report: WorkerReport): AcceptedReport {
  const ignored = report.requestedTiers.filter((t) => !brief.grantedTiers.includes(t));
  return {
    workerId: report.workerId,
    evidence: report.evidence,
    issueComplete: false,
    effectiveTiers: brief.grantedTiers,
    ignoredEscalations: ignored,
  };
}

/** 작업자 생명주기 (FR-ORCHESTRATION.8). 제공자가 달라도 의미는 같다. */
export type WorkerState = "starting" | "running" | "stalled" | "finished" | "failed" | "replaced";

const WORKER_TRANSITIONS: Readonly<Record<WorkerState, readonly WorkerState[]>> = {
  starting: ["running", "failed"],
  running: ["finished", "failed", "stalled"],
  stalled: ["running", "replaced", "failed"],
  finished: [],
  failed: ["replaced"],
  replaced: [],
};

export function canWorkerTransition(from: WorkerState, to: WorkerState): boolean {
  return (WORKER_TRANSITIONS[from] ?? []).includes(to);
}

/** 교체 (FR-ORCHESTRATION.9). 이슈 상태와 기존 증거는 보존된다. */
export interface IssueState {
  readonly issue: string;
  readonly evidence: readonly string[];
  readonly assignments: readonly WorkerAssignment[];
}

export function replaceWorker(state: IssueState, workerId: string, replacement: WorkerAssignment): IssueState {
  return {
    issue: state.issue,
    evidence: state.evidence,
    assignments: state.assignments.map((a) => (a.workerId === workerId ? { ...replacement, ownedPaths: a.ownedPaths } : a)),
  };
}

/** 재시작 이후의 태도 (FR-ORCHESTRATION.10). 증거 없이 단정하지 않는다. */
export type ResumeStance = "resumed" | "unresumable" | "unknown-until-resynced";

export function stanceAfterRestart(found: boolean, resynced: boolean): ResumeStance {
  if (!found) return "unresumable";
  return resynced ? "resumed" : "unknown-until-resynced";
}
