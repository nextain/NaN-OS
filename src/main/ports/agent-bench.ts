// ports/agent-bench — #498 하네스의 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// substrate-agnostic — Tauri/OS 어휘를 누출하지 않는다.
// 계약: docs/progress/issue-497-universal-agent.md.
import type {
  BenchScenario,
  BenchSummary,
  CompletionClaim,
  EvidenceReceipt,
  RunSample,
  SafetyObservation,
  TraceRecord,
  Verdict,
} from "../domain/agent-bench.js";

/** 실행할 시나리오 목록의 출처. 형제 이슈의 UC 에서 도출된다. */
export interface BenchScenarioSourcePort {
  list(): Promise<readonly BenchScenario[]>;
}

/** 한 시나리오를 실제로 밟은 결과. 판정은 하지 않는다 — 판정은 domain 의 몫. */
export interface ScenarioRun {
  readonly receipts: readonly EvidenceReceipt[];
  readonly sample: RunSample;
  readonly safety: SafetyObservation;
  readonly claim?: CompletionClaim;
  readonly trace?: TraceRecord;
  /** 실행 시점의 테스트 개수. 기준선과 비교해 축소 suite 를 잡는다. */
  readonly testCount: number;
}

export interface BenchExecutionPort {
  run(scenario: BenchScenario): Promise<ScenarioRun>;
}

/**
 * 중첩 진입점과 여러 프로젝트를 가진 임시 워크스페이스 픽스처 (NFR-AGENT-BENCH.2).
 * 만든 쪽이 반드시 dispose 한다.
 */
export interface WorkspaceFixtureSpec {
  readonly rootEntrypoint: string;
  readonly mandatoryIndexes: readonly string[];
  readonly projects: readonly { readonly name: string; readonly entrypoint: string }[];
}

export interface WorkspaceFixture {
  readonly root: string;
  dispose(): Promise<void>;
}

export interface WorkspaceFixturePort {
  create(spec: WorkspaceFixtureSpec): Promise<WorkspaceFixture>;
}

/** 판정과 요약의 보관. 재현 가능해야 한다 (NFR-AGENT-BENCH.5·7). */
export interface BenchReportSinkPort {
  publish(summary: BenchSummary, verdicts: readonly Verdict[]): Promise<void>;
}
