// #500 분류 계약 테스트 (P02) — FR-ORCHESTRATION.1·2.
// 대화로 끝낼 일과 이슈로 만들 일을 가르는가, 근거가 남는가, 사용자가 뒤집을 수 있는가.
import { describe, it, expect } from "vitest";
import { bindIssue, classify, overrideClassification } from "../main/domain/orchestration.js";

describe("작업 분류 (FR-ORCHESTRATION.1)", () => {
  it("아무 신호도 없으면 대화로 끝낸다 — 사소한 질문에 이슈를 만들지 않는다", () => {
    const c = classify({ mutatesRepository: false, multiStep: false, needsVerification: false });
    expect(c.taskClass).toBe("conversational");
    expect(c.reasons).toEqual([]);
  });

  it.each([
    ["mutatesRepository", { mutatesRepository: true, multiStep: false, needsVerification: false }, "저장소를 바꾼다"],
    ["multiStep", { mutatesRepository: false, multiStep: true, needsVerification: false }, "여러 단계로 나뉜다"],
    ["needsVerification", { mutatesRepository: false, multiStep: false, needsVerification: true }, "독립 검증이 필요하다"],
  ])("%s 신호 하나로도 이슈가 된다", (_l, signals, reason) => {
    const c = classify(signals);
    expect(c.taskClass).toBe("issue-worthy");
    expect(c.reasons).toEqual([reason]);
  });

  it("근거가 여럿이면 전부 남는다 — 판단을 설명할 수 있어야 한다", () => {
    const c = classify({ mutatesRepository: true, multiStep: true, needsVerification: true });
    expect(c.reasons).toHaveLength(3);
  });
});

describe("사용자 뒤집기 (FR-ORCHESTRATION.1)", () => {
  it("이슈로 판단한 것을 대화로 되돌릴 수 있다", () => {
    const first = classify({ mutatesRepository: true, multiStep: false, needsVerification: false });
    const after = overrideClassification(first, "conversational", "그냥 물어본 것이다");
    expect(after.taskClass).toBe("conversational");
    expect(after.overridden).toBe(true);
    expect(after.reasons).toContain("사용자 지정: 그냥 물어본 것이다");
  });

  it("뒤집어도 원래 근거는 지워지지 않는다", () => {
    const first = classify({ mutatesRepository: true, multiStep: true, needsVerification: false });
    const after = overrideClassification(first, "conversational", "이유");
    expect(after.reasons).toEqual(["저장소를 바꾼다", "여러 단계로 나뉜다", "사용자 지정: 이유"]);
  });
});

describe("이슈와 space 결속 (FR-ORCHESTRATION.2)", () => {
  it("새 결속은 통과한다", () => {
    expect(bindIssue([], { issue: "#1", spaceId: "s1" })).toEqual([]);
  });

  it("같은 결속을 다시 선언해도 문제가 아니다", () => {
    expect(bindIssue([{ issue: "#1", spaceId: "s1" }], { issue: "#1", spaceId: "s1" })).toEqual([]);
  });

  it("같은 이슈에 다른 space 를 붙이면 거절한다", () => {
    expect(bindIssue([{ issue: "#1", spaceId: "s1" }], { issue: "#1", spaceId: "s2" })).toEqual(["issue-already-bound"]);
  });

  it("같은 space 에 다른 이슈를 붙이면 거절한다", () => {
    expect(bindIssue([{ issue: "#1", spaceId: "s1" }], { issue: "#2", spaceId: "s1" })).toEqual(["space-already-bound"]);
  });
});
