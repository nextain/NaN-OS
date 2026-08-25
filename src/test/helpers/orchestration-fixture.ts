// #500 계약 테스트용 대역 포트. 결정론 — 실제 명령줄 도구도 GitHub 도 쓰지 않는다.
import type { IssueTrackerPort, SpaceBindingPort, WorkerAdapterPort } from "../../main/ports/orchestration.js";
import type { DelegationBrief, IssueBinding, WorkerAssignment, WorkerProvider, WorkerReport, WorkerRole, WorkerState } from "../../main/domain/orchestration.js";

export function assignment(workerId: string, role: WorkerRole, ownedPaths: readonly string[], provider: WorkerProvider = "codex"): WorkerAssignment {
  return { workerId, role, provider, ownedPaths };
}

export function brief(workerId: string, over: Partial<DelegationBrief> = {}): DelegationBrief {
  return {
    workerId,
    issue: "#501",
    intent: "컨텍스트 해석기를 만든다",
    contextRevision: "rev-3",
    grantedTiers: ["observe", "workspace-write"],
    ownedPaths: ["src/main/domain"],
    successCriteria: ["계약 테스트 통과"],
    tokenBudget: 100_000,
    ...over,
  };
}

export function fakeTracker(issue = "#501"): IssueTrackerPort {
  return { async ensureIssue() { return issue; } };
}

export function fakeSpaces(initial: readonly IssueBinding[] = []): SpaceBindingPort & { readonly bound: IssueBinding[] } {
  const bound = [...initial];
  return {
    bound,
    async bind(binding) {
      bound.push(binding);
    },
    async list() {
      return bound;
    },
  };
}

export interface FakeWorkers extends WorkerAdapterPort {
  readonly started: string[];
  readonly interrupted: string[];
  states: Map<string, WorkerState>;
  report: WorkerReport;
}

export function fakeWorkers(over: Partial<WorkerReport> = {}): FakeWorkers {
  const started: string[] = [];
  const interrupted: string[] = [];
  const states = new Map<string, WorkerState>();
  const report: WorkerReport = { workerId: "w1", evidence: ["log:1"], claimsIssueComplete: false, requestedTiers: [], ...over };
  return {
    started,
    interrupted,
    states,
    report,
    async start(a) {
      started.push(a.workerId);
      states.set(a.workerId, "running");
      return "running";
    },
    async observe(workerId) {
      return states.get(workerId) ?? "running";
    },
    async interrupt(workerId) {
      interrupted.push(workerId);
      states.set(workerId, "replaced");
      return "replaced";
    },
    async collect(workerId) {
      return { ...report, workerId };
    },
  };
}
