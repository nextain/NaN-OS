// ports/orchestration — #500 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// 작업자 실행 자체는 Herdr 가 소유한다 — 여기서는 배치와 수집만 한다.
import type { DelegationBrief, IssueBinding, WorkerAssignment, WorkerReport, WorkerState } from "../domain/orchestration.js";

export interface IssueTrackerPort {
  /** 이슈를 만들거나 기존 이슈를 찾는다. */
  ensureIssue(title: string): Promise<string>;
}

export interface SpaceBindingPort {
  bind(binding: IssueBinding): Promise<void>;
  list(): Promise<readonly IssueBinding[]>;
}

/** 코딩 작업자 어댑터. codex·claude·opencode·shell 이 같은 의미를 노출한다. */
export interface WorkerAdapterPort {
  start(assignment: WorkerAssignment, brief: DelegationBrief): Promise<WorkerState>;
  observe(workerId: string): Promise<WorkerState>;
  interrupt(workerId: string): Promise<WorkerState>;
  collect(workerId: string): Promise<WorkerReport>;
}
