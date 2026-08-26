// #500 교체·재개 계약 테스트 (P02) — FR-ORCHESTRATION.9·10.
// 교체가 이슈 상태와 증거를 잃지 않는가, 재시작 이후 증거 없이 단정하지 않는가.
import { describe, it, expect } from "vitest";
import { IssueOrchestrator } from "../main/app/control/orchestration.js";
import { replaceWorker, stanceAfterRestart } from "../main/domain/orchestration.js";
import { assignment, brief, fakeSpaces, fakeTracker, fakeWorkers } from "./helpers/orchestration-fixture.js";

const IMPL = assignment("w1", "implementer", ["src/main"]);
const TEST = assignment("w2", "tester", ["src/test"]);

async function started(workers = fakeWorkers()) {
  const o = new IssueOrchestrator(fakeTracker(), fakeSpaces(), workers);
  await o.start("제목", "s1", { issue: "#501", leaderId: "L1" }, [IMPL, TEST], [brief("w1"), brief("w2")]);
  return { o, workers };
}

describe("교체 (FR-ORCHESTRATION.9) [UC-ORCHESTRATION-WORKER-REPLACE]", () => {
  it("교체해도 증거는 남는다", () => {
    const state = { issue: "#1", evidence: ["log:1"], assignments: [IMPL, TEST] };
    const next = replaceWorker(state, "w1", assignment("w9", "implementer", ["무시됨"]));
    expect(next.evidence).toEqual(["log:1"]);
  });

  it("교체한 작업자가 이전 소유 경로를 그대로 이어받는다 — 경계가 흔들리지 않는다", () => {
    const state = { issue: "#1", evidence: [], assignments: [IMPL, TEST] };
    const next = replaceWorker(state, "w1", assignment("w9", "implementer", ["엉뚱한경로"]));
    expect(next.assignments[0]).toEqual({ workerId: "w9", role: "implementer", provider: "codex", ownedPaths: ["src/main"] });
  });

  it("교체 대상이 아닌 작업자는 건드리지 않는다", () => {
    const state = { issue: "#1", evidence: [], assignments: [IMPL, TEST] };
    expect(replaceWorker(state, "w1", assignment("w9", "implementer", [])).assignments[1]).toEqual(TEST);
  });

  it("서비스는 먼저 중단한 뒤 새 작업자를 시작한다", async () => {
    const { o, workers } = await started();
    const next = await o.replace("#501", "w1", assignment("w9", "implementer", []), brief("w9"));
    expect(workers.interrupted).toEqual(["w1"]);
    expect(workers.started).toEqual(["w1", "w2", "w9"]);
    expect(next?.assignments.map((a) => a.workerId)).toEqual(["w9", "w2"]);
  });

  it("모르는 이슈는 교체하지 않는다", async () => {
    const { o } = await started();
    expect(await o.replace("#없음", "w1", assignment("w9", "implementer", []), brief("w9"))).toBeNull();
  });
});

describe("재시작 이후 (FR-ORCHESTRATION.10)", () => {
  it("찾지 못하면 이어받을 수 없다고 말한다", () => {
    expect(stanceAfterRestart(false, false)).toBe("unresumable");
    expect(stanceAfterRestart(false, true)).toBe("unresumable");
  });

  it("찾았지만 재동기화 전이면 불명이다 — 완료도 중단도 단정하지 않는다", () => {
    expect(stanceAfterRestart(true, false)).toBe("unknown-until-resynced");
  });

  it("찾고 재동기화되면 이어받는다", () => {
    expect(stanceAfterRestart(true, true)).toBe("resumed");
  });

  it("모든 작업자가 살아 있으면 이어받는다", async () => {
    const { o } = await started();
    expect((await o.resume("#501")).stance).toBe("resumed");
  });

  it("멈춘 작업자가 하나라도 있으면 불명으로 남긴다", async () => {
    const workers = fakeWorkers();
    const { o } = await started(workers);
    workers.states.set("w2", "stalled");
    const out = await o.resume("#501");
    expect(out.stance).toBe("unknown-until-resynced");
    expect(out.state?.issue).toBe("#501");
  });

  it("없는 이슈는 이어받을 수 없다고 말하고 상태를 지어내지 않는다", async () => {
    const { o } = await started();
    const out = await o.resume("#없음");
    expect(out).toEqual({ stance: "unresumable", state: null });
  });
});
