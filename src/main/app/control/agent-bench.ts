// app/control/agent-bench — #498 하네스 조립 (NFR-AGENT-BENCH.1~7). 포트만 사용. 판정 규칙 0.
// 판정은 전부 domain/agent-bench 의 순수 함수가 한다. 여기서는 순서와 수집만 담당한다.
import type { BenchExecutionPort, BenchReportSinkPort, BenchScenarioSourcePort } from "../../ports/agent-bench.js";
import {
  checkThresholds,
  judge,
  summarize,
  type BenchSummary,
  type RegressionThresholds,
  type RunSample,
  type SuiteBaseline,
  type ThresholdBreach,
  type Verdict,
} from "../../domain/agent-bench.js";

export interface BenchOutcome {
  readonly verdicts: readonly Verdict[];
  readonly summary: BenchSummary;
  readonly breaches: readonly ThresholdBreach[];
  /** 하나라도 거절되었거나 임계를 넘으면 false. 하네스는 fail-closed 다. */
  readonly accepted: boolean;
}

export class BenchHarness {
  constructor(
    private readonly source: BenchScenarioSourcePort,
    private readonly execution: BenchExecutionPort,
    private readonly sink: BenchReportSinkPort,
  ) {}

  /**
   * 모든 시나리오를 밟고 판정한다.
   * 실행 순서는 목록 순서를 그대로 따른다 — 같은 입력이면 같은 결과가 나온다.
   */
  async run(baseline: SuiteBaseline, thresholds: RegressionThresholds): Promise<BenchOutcome> {
    const scenarios = await this.source.list();
    const verdicts: Verdict[] = [];
    const samples: RunSample[] = [];
    for (const scenario of scenarios) {
      const r = await this.execution.run(scenario);
      samples.push(r.sample);
      verdicts.push(
        judge({
          scenario,
          receipts: r.receipts,
          claim: r.claim,
          baseline,
          currentTestCount: r.testCount,
          safety: r.safety,
          trace: r.trace,
        }),
      );
    }
    const summary = summarize(samples, verdicts);
    const breaches = checkThresholds(summary, thresholds);
    await this.sink.publish(summary, verdicts);
    return { verdicts, summary, breaches, accepted: verdicts.every((v) => v.accepted) && breaches.length === 0 };
  }
}
