// #500 자가 완료·권한 확장 계약 테스트 (P02) — FR-ORCHESTRATION.6.
// 작업자가 완료를 선언하거나 권한을 넓히려 해도 반영되지 않는가.
import { describe, it, expect } from "vitest";
import { IssueOrchestrator } from "../main/app/control/orchestration.js";
import { acceptReport } from "../main/domain/orchestration.js";
import { assignment, brief, fakeSpaces, fakeTracker, fakeWorkers } from "./helpers/orchestration-fixture.js";

const B = brief("w1");

describe("완료 선언 무시 (FR-ORCHESTRATION.6)", () => {
  it("작업자가 완료라 해도 이슈는 완료되지 않는다", () => {
    const accepted = acceptReport(B, { workerId: "w1", evidence: ["log"], claimsIssueComplete: true, requestedTiers: [] });
    expect(accepted.issueComplete).toBe(false);
  });

  it("완료라 하지 않아도 결과는 같다 — 주장 자체가 판정에 쓰이지 않는다", () => {
    const a = acceptReport(B, { workerId: "w1", evidence: ["log"], claimsIssueComplete: true, requestedTiers: [] });
    const b = acceptReport(B, { workerId: "w1", evidence: ["log"], claimsIssueComplete: false, requestedTiers: [] });
    expect(a).toEqual(b);
  });

  it("증거는 그대로 전달된다 — 주장은 버리되 근거는 버리지 않는다", () => {
    const accepted = acceptReport(B, { workerId: "w1", evidence: ["log:1", "test:ok"], claimsIssueComplete: true, requestedTiers: [] });
    expect(accepted.evidence).toEqual(["log:1", "test:ok"]);
  });
});

describe("권한 확장 무시 (FR-ORCHESTRATION.6)", () => {
  it("작업자가 요청한 등급은 부여되지 않는다", () => {
    const accepted = acceptReport(B, {
      workerId: "w1",
      evidence: [],
      claimsIssueComplete: false,
      requestedTiers: ["destructive", "external-message"],
    });
    expect(accepted.effectiveTiers).toEqual(["observe", "workspace-write"]);
    expect(accepted.ignoredEscalations).toEqual(["destructive", "external-message"]);
  });

  it("이미 부여된 등급을 다시 요청한 것은 확장이 아니다", () => {
    const accepted = acceptReport(B, { workerId: "w1", evidence: [], claimsIssueComplete: false, requestedTiers: ["observe"] });
    expect(accepted.ignoredEscalations).toEqual([]);
  });

  it("아무것도 요청하지 않으면 무시할 것도 없다", () => {
    expect(acceptReport(B, { workerId: "w1", evidence: [], claimsIssueComplete: false, requestedTiers: [] }).ignoredEscalations).toEqual([]);
  });
});

describe("수집 경로 (FR-ORCHESTRATION.6)", () => {
  it("리더가 증거를 이슈 상태에 통합한다", async () => {
    const workers = fakeWorkers({ evidence: ["log:1"], claimsIssueComplete: true, requestedTiers: ["destructive"] });
    const o = new IssueOrchestrator(fakeTracker(), fakeSpaces(), workers);
    await o.start(
      "제목",
      "s1",
      { issue: "#501", leaderId: "L1" },
      [assignment("w1", "implementer", ["src/main"]), assignment("w2", "tester", ["src/test"])],
      [brief("w1"), brief("w2")],
    );
    const accepted = await o.collect("#501", B);
    expect(accepted.issueComplete).toBe(false);
    expect(accepted.ignoredEscalations).toEqual(["destructive"]);
    expect(o.stateOf("#501")?.evidence).toEqual(["log:1"]);
  });
});
