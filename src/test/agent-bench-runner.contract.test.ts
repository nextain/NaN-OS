// #498 하네스 계약 테스트 (P02) — NFR-AGENT-BENCH.1·5.
// 게이트 분리와 추적성, 그리고 조립부가 판정 규칙을 스스로 갖지 않음을 확인한다.
import { describe, it, expect } from "vitest";
import { evaluateGate, evaluateTrace, judge, type BenchScenario, type EvidenceReceipt, type TraceRecord } from "../main/domain/agent-bench.js";
import { BenchHarness } from "../main/app/control/agent-bench.js";
import type { BenchExecutionPort, BenchReportSinkPort, BenchScenarioSourcePort, ScenarioRun } from "../main/ports/agent-bench.js";

const FULL_TRACE: TraceRecord = {
  intent: "워크스페이스 규칙을 읽는다",
  contextRevision: "rev-1",
  operations: ["discover"],
  artifacts: ["manifest.json"],
  tests: ["src/test/workspace-context-discover.contract.test.ts"],
  completionEvidence: ["receipt-1"],
};

function scenario(over: Partial<BenchScenario> = {}): BenchScenario {
  return { id: "s1", uc: "UC-WORKSPACE-CONTEXT-DISCOVER", gate: "protocol", requiredEvidence: ["mock"], ...over };
}

describe("게이트 분리 (NFR-AGENT-BENCH.1)", () => {
  it("요구한 증거가 전부 있으면 사유가 없다", () => {
    const r: EvidenceReceipt[] = [{ scenarioId: "s1", kind: "mock", ref: "log:1" }];
    expect(evaluateGate(scenario(), r)).toEqual([]);
  });

  it("증거가 하나도 없으면 no-evidence", () => {
    expect(evaluateGate(scenario(), [])).toEqual(["no-evidence"]);
  });

  it("다른 시나리오의 증거는 내 증거가 아니다", () => {
    const r: EvidenceReceipt[] = [{ scenarioId: "다른시나리오", kind: "mock", ref: "log:1" }];
    expect(evaluateGate(scenario(), r)).toEqual(["no-evidence"]);
  });

  it("native 를 요구하는 게이트에 mock 만 있으면 mock-only — 앞 게이트가 뒤 게이트를 대신하지 못한다", () => {
    const s = scenario({ gate: "native", requiredEvidence: ["native"] });
    const r: EvidenceReceipt[] = [{ scenarioId: "s1", kind: "mock", ref: "log:1" }];
    expect(evaluateGate(s, r)).toEqual(["mock-only"]);
  });

  it("실제 증거가 일부만 있으면 missing-required-evidence — mock-only 로 뭉뚱그리지 않는다", () => {
    const s = scenario({ gate: "native", requiredEvidence: ["native", "browser"] });
    const r: EvidenceReceipt[] = [{ scenarioId: "s1", kind: "native", ref: "log:1" }];
    expect(evaluateGate(s, r)).toEqual(["missing-required-evidence"]);
  });
});

describe("추적성 (NFR-AGENT-BENCH.5)", () => {
  it("여섯 축이 모두 차 있으면 통과", () => {
    expect(evaluateTrace(FULL_TRACE)).toEqual([]);
  });

  it("기록 자체가 없으면 incomplete-trace", () => {
    expect(evaluateTrace(undefined)).toEqual(["incomplete-trace"]);
  });

  it.each([
    ["intent", { intent: "" }],
    ["contextRevision", { contextRevision: "" }],
    ["operations", { operations: [] }],
    ["artifacts", { artifacts: [] }],
    ["tests", { tests: [] }],
    ["completionEvidence", { completionEvidence: [] }],
  ])("%s 축이 비면 거절한다", (_label, patch) => {
    expect(evaluateTrace({ ...FULL_TRACE, ...(patch as Partial<TraceRecord>) })).toEqual(["incomplete-trace"]);
  });
});

describe("최종 판정은 fail-closed 다", () => {
  const base = {
    receipts: [{ scenarioId: "s1", kind: "mock", ref: "log:1" }] as EvidenceReceipt[],
    claim: { scenarioId: "s1", claimedComplete: true },
    baseline: { testCount: 10 },
    currentTestCount: 10,
    safety: { leakedProjects: [], unauthorizedEffects: [] },
    trace: FULL_TRACE,
  };

  it("모든 축이 깨끗하면 수용한다", () => {
    const v = judge({ scenario: scenario(), ...base });
    expect(v).toEqual({ scenarioId: "s1", accepted: true, reasons: [] });
  });

  it("사유가 여럿이면 전부 남기고 중복은 제거한다", () => {
    const v = judge({
      scenario: scenario({ gate: "native", requiredEvidence: ["native"] }),
      ...base,
      currentTestCount: 9,
      safety: { leakedProjects: ["다른프로젝트"], unauthorizedEffects: ["mail:1"] },
      trace: undefined,
    });
    expect(v.accepted).toBe(false);
    expect(v.reasons).toEqual([
      "context-leak",
      "false-completion",
      "incomplete-trace",
      "mock-only",
      "suite-shrunk",
      "unauthorized-effect",
    ]);
  });
});

function harness(runs: readonly ScenarioRun[], scenarios: readonly BenchScenario[]) {
  const published: unknown[] = [];
  let i = 0;
  const source: BenchScenarioSourcePort = { list: async () => scenarios };
  const execution: BenchExecutionPort = { run: async () => runs[i++] as ScenarioRun };
  const sink: BenchReportSinkPort = {
    publish: async (summary, verdicts) => {
      published.push({ summary, verdicts });
    },
  };
  return { h: new BenchHarness(source, execution, sink), published };
}

function okRun(id: string, over: Partial<ScenarioRun> = {}): ScenarioRun {
  return {
    receipts: [{ scenarioId: id, kind: "mock", ref: "log" }],
    sample: { scenarioId: id, latencyMs: 100, tokenCost: 10, interventions: 0 },
    safety: { leakedProjects: [], unauthorizedEffects: [] },
    claim: { scenarioId: id, claimedComplete: true },
    trace: FULL_TRACE,
    testCount: 10,
    ...over,
  };
}

describe("조립부는 판정을 대신하지 않는다", () => {
  const thresholds = { minSuccessRate: 1, maxMedianLatencyMs: 1_000, maxTailLatencyMs: 1_000, maxTokenCost: 1_000 };

  it("모든 시나리오가 통과하면 수용하고 보고를 남긴다", async () => {
    const s = [scenario({ id: "a" }), scenario({ id: "b" })];
    const { h, published } = harness([okRun("a"), okRun("b")], s);
    const out = await h.run({ testCount: 10 }, thresholds);
    expect(out.accepted).toBe(true);
    expect(out.verdicts.map((v) => v.scenarioId)).toEqual(["a", "b"]);
    expect(published).toHaveLength(1);
  });

  it("하나라도 거절되면 전체가 수용되지 않는다", async () => {
    const s = [scenario({ id: "a" }), scenario({ id: "b" })];
    const { h } = harness([okRun("a"), okRun("b", { receipts: [] })], s);
    const out = await h.run({ testCount: 10 }, thresholds);
    expect(out.accepted).toBe(false);
    expect(out.verdicts[1]?.reasons).toContain("false-completion");
  });

  it("판정은 전부 통과해도 임계를 넘으면 수용하지 않는다", async () => {
    const s = [scenario({ id: "a" })];
    const { h } = harness([okRun("a", { sample: { scenarioId: "a", latencyMs: 9_999, tokenCost: 1, interventions: 0 } })], s);
    const out = await h.run({ testCount: 10 }, thresholds);
    expect(out.verdicts.every((v) => v.accepted)).toBe(true);
    expect(out.breaches).toContain("median-latency");
    expect(out.accepted).toBe(false);
  });
});
