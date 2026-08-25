// #498 시나리오 출처 계약 테스트 (P02) — NFR-AGENT-BENCH.1·2.
// 하네스가 판정할 목록이 실제 UC 문서에서 나오는가, 계열이 빠지면 잡히는가.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { DocumentBenchScenarioSource, declaredFamilies, familyOf, parseScenarios } from "../main/adapters/agent-bench-scenarios.js";

const DOC = resolve(__dirname, "..", "..", "docs", "user-scenarios.md");

describe("문서 파싱 (NFR-AGENT-BENCH.2)", () => {
  it("에픽 UC 제목만 시나리오가 된다", () => {
    const md = ["### UC-WORKSPACE-CONTEXT-DISCOVER — 설명", "### UC-V022-THINKING-SEPARATION", "### 그냥 제목"].join("\n");
    expect(parseScenarios(md).map((s) => s.id)).toEqual(["UC-WORKSPACE-CONTEXT-DISCOVER"]);
  });

  it("같은 UC 가 두 번 나와도 시나리오는 하나다", () => {
    const md = "### UC-ENV-TOOL-BROWSE\n### UC-ENV-TOOL-BROWSE\n";
    expect(parseScenarios(md)).toHaveLength(1);
  });

  it("계열마다 요구 증거가 다르다 — 결정론으로 다 덮이지 않는다", () => {
    expect(familyOf("UC-HERDR-CONTROL-MUTATE")?.requiredEvidence).toEqual(["native"]);
    expect(familyOf("UC-ENV-TOOL-BROWSE")?.requiredEvidence).toEqual(["browser", "native"]);
    expect(familyOf("UC-ORCHESTRATION-ISSUE-LEAD")?.requiredEvidence).toEqual(["worker", "native"]);
  });

  it("에픽 밖 UC 는 계열이 없다", () => {
    expect(familyOf("UC-V022-THINKING-SEPARATION")).toBeUndefined();
  });
});

describe("실제 문서와의 결속 (NFR-AGENT-BENCH.1)", () => {
  it("여섯 계열이 모두 문서에 시나리오를 갖는다 — 하나라도 비면 실패한다", async () => {
    const scenarios = await new DocumentBenchScenarioSource(DOC).list();
    for (const prefix of declaredFamilies()) {
      expect(scenarios.filter((s) => s.id.startsWith(prefix)).length, `${prefix} 계열 시나리오 없음`).toBeGreaterThan(0);
    }
  });

  it("현재 문서의 에픽 UC 를 전부 집어 온다", async () => {
    const scenarios = await new DocumentBenchScenarioSource(DOC).list();
    expect(scenarios).toHaveLength(23);
    expect(scenarios.filter((s) => s.id.startsWith("UC-WORKSPACE-CONTEXT-"))).toHaveLength(4);
    expect(scenarios.filter((s) => s.id.startsWith("UC-AGENT-BENCH-"))).toHaveLength(3);
  });

  it("결정론만으로 통과할 수 있는 계열은 하나뿐이다 — 나머지는 실제 실행을 요구한다", async () => {
    const scenarios = await new DocumentBenchScenarioSource(DOC).list();
    const mockOnly = scenarios.filter((s) => s.requiredEvidence.every((e) => e === "mock"));
    expect(mockOnly.map((s) => s.id.startsWith("UC-AGENT-BENCH-"))).toEqual([true, true, true]);
  });

  it("같은 문서를 두 번 읽으면 같은 목록이 나온다", async () => {
    const source = new DocumentBenchScenarioSource(DOC);
    expect(await source.list()).toEqual(await source.list());
  });
});
