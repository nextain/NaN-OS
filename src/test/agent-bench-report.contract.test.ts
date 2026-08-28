// #498 보고 형태 계약 테스트 (P02) — NFR-AGENT-BENCH.6·7.
// 통과 여부만이 아니라 중앙값과 꼬리 지연, 비용, 개입 횟수를 내는가.
// 같은 입력에서 같은 결과가 나오는가. 임계 위반을 전부 드러내는가.
import { describe, it, expect } from "vitest";
import { checkThresholds, summarize, type RunSample, type Verdict } from "../main/domain/agent-bench.js";

function samples(latencies: readonly number[]): RunSample[] {
  return latencies.map((latencyMs, i) => ({ scenarioId: `s${i}`, latencyMs, tokenCost: 10, interventions: i % 2 }));
}
function verdicts(accepted: readonly boolean[]): Verdict[] {
  return accepted.map((a, i) => ({ scenarioId: `s${i}`, accepted: a, reasons: a ? [] : ["no-evidence"] }));
}

describe("요약 보고 (NFR-AGENT-BENCH.6) [UC-AGENT-BENCH-REPORT]", () => {
  it("중앙값과 꼬리 지연을 함께 낸다 — 통과 여부만 내지 않는다", () => {
    const s = summarize(samples([10, 20, 30, 40, 1_000]), verdicts([true, true, true, true, true]));
    expect(s.medianLatencyMs).toBe(30);
    expect(s.tailLatencyMs).toBe(1_000);
    expect(s.medianLatencyMs).not.toBe(s.tailLatencyMs);
  });

  it("입력 순서가 달라도 같은 분포면 같은 지연을 낸다", () => {
    const a = summarize(samples([40, 10, 1_000, 20, 30]), verdicts([true, true, true, true, true]));
    const b = summarize(samples([10, 20, 30, 40, 1_000]), verdicts([true, true, true, true, true]));
    expect(a.medianLatencyMs).toBe(b.medianLatencyMs);
    expect(a.tailLatencyMs).toBe(b.tailLatencyMs);
  });

  it("같은 입력을 두 번 요약하면 같은 결과가 나온다 — 시계나 난수를 쓰지 않는다", () => {
    const args = [samples([5, 15, 25]), verdicts([true, false, true])] as const;
    expect(summarize(...args)).toEqual(summarize(...args));
  });

  it("비용과 개입 횟수를 합산한다", () => {
    const s = summarize(samples([1, 2, 3, 4]), verdicts([true, true, true, true]));
    expect(s.totalTokenCost).toBe(40);
    expect(s.totalInterventions).toBe(2);
  });

  it("성공률은 판정 결과에서 나온다 — 표본 수가 아니라 수용 수 기준", () => {
    const s = summarize(samples([1, 2, 3, 4]), verdicts([true, false, true, false]));
    expect(s.runs).toBe(4);
    expect(s.accepted).toBe(2);
    expect(s.successRate).toBe(0.5);
  });

  it("표본이 없으면 0 을 내고 터지지 않는다", () => {
    const s = summarize([], []);
    expect(s).toEqual({ runs: 0, accepted: 0, successRate: 0, medianLatencyMs: 0, tailLatencyMs: 0, totalTokenCost: 0, totalInterventions: 0 });
  });

  it("표본이 하나뿐이어도 꼬리 지연이 정의된다", () => {
    const s = summarize(samples([77]), verdicts([true]));
    expect(s.medianLatencyMs).toBe(77);
    expect(s.tailLatencyMs).toBe(77);
  });
});

describe("회귀 임계 (NFR-AGENT-BENCH.7)", () => {
  const t = { minSuccessRate: 0.9, maxMedianLatencyMs: 100, maxTailLatencyMs: 500, maxTokenCost: 100 };
  const clean = { runs: 4, accepted: 4, successRate: 1, medianLatencyMs: 50, tailLatencyMs: 200, totalTokenCost: 40, totalInterventions: 0 };

  it("기준선 안이면 위반이 없다", () => {
    expect(checkThresholds(clean, t)).toEqual([]);
  });

  it("경계값은 위반이 아니다", () => {
    expect(checkThresholds({ ...clean, successRate: 0.9, medianLatencyMs: 100, tailLatencyMs: 500, totalTokenCost: 100 }, t)).toEqual([]);
  });

  it.each([
    ["success-rate", { successRate: 0.5 }],
    ["median-latency", { medianLatencyMs: 101 }],
    ["tail-latency", { tailLatencyMs: 501 }],
    ["token-cost", { totalTokenCost: 101 }],
  ])("%s 축을 넘기면 그 축을 드러낸다", (code, patch) => {
    expect(checkThresholds({ ...clean, ...patch }, t)).toEqual([code]);
  });

  it("여러 축을 넘기면 전부 드러낸다 — 첫 위반에서 멈추지 않는다", () => {
    const breaches = checkThresholds({ ...clean, successRate: 0.1, medianLatencyMs: 999, tailLatencyMs: 9_999, totalTokenCost: 9_999 }, t);
    expect(breaches).toEqual(["success-rate", "median-latency", "tail-latency", "token-cost"]);
  });
});
