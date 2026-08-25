// #500 리더 계약 테스트 (P02) — FR-ORCHESTRATION.3·4·7.
// 리더가 하나인가, 구현자와 독립 검증자가 함께 서는가, 브리프가 전문 복사와 비밀을 막는가.
import { describe, it, expect } from "vitest";
import { IssueOrchestrator } from "../main/app/control/orchestration.js";
import { checkBrief, hasIndependentVerifier, leaderConflict, riskOf, isDelegatable } from "../main/domain/orchestration.js";
import { assignment, brief, fakeSpaces, fakeTracker, fakeWorkers } from "./helpers/orchestration-fixture.js";

const IMPL = assignment("w1", "implementer", ["src/main/domain"]);
const TEST = assignment("w2", "tester", ["src/test"]);

describe("리더 단일성 (FR-ORCHESTRATION.3)", () => {
  it("같은 리더를 다시 세우는 것은 충돌이 아니다", () => {
    expect(leaderConflict([{ issue: "#1", leaderId: "L1" }], { issue: "#1", leaderId: "L1" })).toBe(false);
  });

  it("같은 이슈에 다른 리더를 세우면 충돌이다", () => {
    expect(leaderConflict([{ issue: "#1", leaderId: "L1" }], { issue: "#1", leaderId: "L2" })).toBe(true);
  });

  it("다른 이슈의 리더는 상관없다", () => {
    expect(leaderConflict([{ issue: "#1", leaderId: "L1" }], { issue: "#2", leaderId: "L2" })).toBe(false);
  });
});

describe("역할 분리 (FR-ORCHESTRATION.4)", () => {
  it("구현자와 별도 검증자가 있으면 통과한다", () => {
    expect(hasIndependentVerifier([IMPL, TEST])).toBe(true);
  });

  it("구현자만 있으면 통과하지 못한다", () => {
    expect(hasIndependentVerifier([IMPL])).toBe(false);
  });

  it("같은 작업자가 구현과 검증을 겸하면 독립이 아니다", () => {
    expect(hasIndependentVerifier([IMPL, assignment("w1", "reviewer", ["docs"])])).toBe(false);
  });

  it("리뷰어도 독립 검증자로 인정한다", () => {
    expect(hasIndependentVerifier([IMPL, assignment("w3", "reviewer", ["docs"])])).toBe(true);
  });

  it("조사자만으로는 검증이 되지 않는다", () => {
    expect(hasIndependentVerifier([IMPL, assignment("w3", "researcher", ["docs"])])).toBe(false);
  });
});

describe("위임 브리프 (FR-ORCHESTRATION.7)", () => {
  it("정상 브리프는 통과한다", () => {
    expect(checkBrief(brief("w1"), "긴 대화 전문")).toEqual([]);
  });

  it("대화 전문을 그대로 넣으면 거절한다", () => {
    const transcript = "사용자: 이거 고쳐줘\n나이아: 알겠습니다";
    expect(checkBrief(brief("w1", { intent: `배경: ${transcript}` }), transcript)).toEqual(["transcript-copied"]);
  });

  it("비밀값이 섞이면 거절한다", () => {
    expect(checkBrief(brief("w1", { intent: "API_KEY 를 써서 호출한다" }), "")).toEqual(["secret-included"]);
  });

  it("성공 기준이나 예산이 없으면 거절한다", () => {
    expect(checkBrief(brief("w1", { successCriteria: [] }), "")).toEqual(["no-success-criteria"]);
    expect(checkBrief(brief("w1", { tokenBudget: 0 }), "")).toEqual(["no-budget"]);
  });

  it("고위험은 위임하지 않는다", () => {
    expect(riskOf(["observe"])).toBe("low");
    expect(riskOf(["observe", "workspace-write"])).toBe("medium");
    expect(riskOf(["destructive"])).toBe("high");
    expect(riskOf(["production"])).toBe("high");
    expect(riskOf(["external-message"])).toBe("high");
    expect(isDelegatable("high")).toBe(false);
    expect(checkBrief(brief("w1", { grantedTiers: ["destructive"] }), "")).toEqual(["high-risk"]);
  });
});

describe("배치는 전부 통과해야 시작한다", () => {
  function orchestrator() {
    const workers = fakeWorkers();
    return { o: new IssueOrchestrator(fakeTracker(), fakeSpaces(), workers), workers };
  }

  it("정상 배치는 작업자를 시작한다", async () => {
    const { o, workers } = orchestrator();
    const out = await o.start("제목", "s1", { issue: "#501", leaderId: "L1" }, [IMPL, TEST], [brief("w1"), brief("w2")]);
    expect(out.ok).toBe(true);
    expect(workers.started).toEqual(["w1", "w2"]);
  });

  it("독립 검증자가 없으면 아무도 시작하지 않는다", async () => {
    const { o, workers } = orchestrator();
    const out = await o.start("제목", "s1", { issue: "#501", leaderId: "L1" }, [IMPL], [brief("w1")]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.rejections.map((r) => r.code)).toContain("no-independent-verifier");
    expect(workers.started).toEqual([]);
  });

  it("브리프가 걸려도 아무도 시작하지 않는다", async () => {
    const { o, workers } = orchestrator();
    const out = await o.start("제목", "s1", { issue: "#501", leaderId: "L1" }, [IMPL, TEST], [brief("w1", { tokenBudget: 0 }), brief("w2")]);
    expect(out.ok).toBe(false);
    expect(workers.started).toEqual([]);
  });
});
