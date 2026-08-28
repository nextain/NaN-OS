// app/control/orchestration — #500 조립 (FR-ORCHESTRATION.1~10). 포트만 사용. 판정 규칙 0.
import type { IssueTrackerPort, SpaceBindingPort, WorkerAdapterPort } from "../../ports/orchestration.js";
import {
  acceptReport,
  bindIssue,
  checkBrief,
  hasIndependentVerifier,
  leaderConflict,
  ownershipConflicts,
  replaceWorker,
  stanceAfterRestart,
  type AcceptedReport,
  type BriefRejectionCode,
  type DelegationBrief,
  type IssueLeader,
  type IssueState,
  type OwnershipConflict,
  type ResumeStance,
  type WorkerAssignment,
} from "../../domain/orchestration.js";

export type StartRejection =
  | { readonly code: "binding"; readonly detail: string }
  | { readonly code: "leader-conflict"; readonly detail: string }
  | { readonly code: "ownership"; readonly conflicts: readonly OwnershipConflict[] }
  | { readonly code: "no-independent-verifier"; readonly detail: string }
  | { readonly code: "brief"; readonly workerId: string; readonly codes: readonly BriefRejectionCode[] };

export type StartOutcome =
  | { readonly ok: true; readonly state: IssueState }
  | { readonly ok: false; readonly rejections: readonly StartRejection[] };

export class IssueOrchestrator {
  private leaders: IssueLeader[] = [];
  private states = new Map<string, IssueState>();

  constructor(
    private readonly tracker: IssueTrackerPort,
    private readonly spaces: SpaceBindingPort,
    private readonly workers: WorkerAdapterPort,
  ) {}

  /**
   * 이슈를 열고 리더를 세우고 작업자를 배치한다.
   * 하나라도 걸리면 아무 작업자도 시작하지 않는다 — fail-closed.
   */
  async start(
    title: string,
    spaceId: string,
    leader: IssueLeader,
    assignments: readonly WorkerAssignment[],
    briefs: readonly DelegationBrief[],
    transcript = "",
  ): Promise<StartOutcome> {
    const issue = await this.tracker.ensureIssue(title);
    const rejections: StartRejection[] = [];

    const bindingProblems = bindIssue(await this.spaces.list(), { issue, spaceId });
    for (const p of bindingProblems) rejections.push({ code: "binding", detail: p });
    if (leaderConflict(this.leaders, { ...leader, issue })) {
      rejections.push({ code: "leader-conflict", detail: `이슈 ${issue} 에 이미 다른 리더가 있다` });
    }
    const conflicts = ownershipConflicts(assignments);
    if (conflicts.length > 0) rejections.push({ code: "ownership", conflicts });
    if (!hasIndependentVerifier(assignments)) {
      rejections.push({ code: "no-independent-verifier", detail: "구현자와 독립 검증자가 함께 있어야 한다" });
    }
    for (const brief of briefs) {
      const codes = checkBrief(brief, transcript);
      if (codes.length > 0) rejections.push({ code: "brief", workerId: brief.workerId, codes });
    }
    if (rejections.length > 0) return { ok: false, rejections };

    await this.spaces.bind({ issue, spaceId });
    this.leaders.push({ ...leader, issue });
    for (const assignment of assignments) {
      const brief = briefs.find((b) => b.workerId === assignment.workerId);
      if (brief) await this.workers.start(assignment, brief);
    }
    const state: IssueState = { issue, evidence: [], assignments };
    this.states.set(issue, state);
    return { ok: true, state };
  }

  /** 작업자 보고 수집 (FR-ORCHESTRATION.6). 완료 선언과 권한 확장은 반영되지 않는다. */
  async collect(issue: string, brief: DelegationBrief): Promise<AcceptedReport> {
    const report = await this.workers.collect(brief.workerId);
    const accepted = acceptReport(brief, report);
    const state = this.states.get(issue);
    if (state) this.states.set(issue, { ...state, evidence: [...state.evidence, ...accepted.evidence] });
    return accepted;
  }

  /** 교체 (FR-ORCHESTRATION.9). 이슈 상태와 증거는 유지된다. */
  async replace(issue: string, workerId: string, replacement: WorkerAssignment, brief: DelegationBrief): Promise<IssueState | null> {
    const state = this.states.get(issue);
    if (!state) return null;
    await this.workers.interrupt(workerId);
    const next = replaceWorker(state, workerId, replacement);
    this.states.set(issue, next);
    await this.workers.start({ ...replacement, ownedPaths: next.assignments.find((a) => a.workerId === replacement.workerId)?.ownedPaths ?? [] }, brief);
    return next;
  }

  /** 재시작 이후 (FR-ORCHESTRATION.10). 찾지 못하면 이어받을 수 없다고 말한다. */
  async resume(issue: string): Promise<{ readonly stance: ResumeStance; readonly state: IssueState | null }> {
    const state = this.states.get(issue) ?? null;
    if (!state) return { stance: stanceAfterRestart(false, false), state: null };
    const observed = await Promise.all(state.assignments.map((a) => this.workers.observe(a.workerId)));
    const resynced = observed.every((s) => s !== "stalled");
    return { stance: stanceAfterRestart(true, resynced), state };
  }

  stateOf(issue: string): IssueState | undefined {
    return this.states.get(issue);
  }
}
