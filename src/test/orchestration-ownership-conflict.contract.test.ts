// #500 소유 경로 계약 테스트 (P02) — FR-ORCHESTRATION.5.
// 겹치는 경로를 배치하지 않는가, 상하위 관계도 겹침으로 보는가.
import { describe, it, expect } from "vitest";
import { IssueOrchestrator } from "../main/app/control/orchestration.js";
import { ownershipConflicts, pathsOverlap } from "../main/domain/orchestration.js";
import { assignment, brief, fakeSpaces, fakeTracker, fakeWorkers } from "./helpers/orchestration-fixture.js";

describe("경로 겹침 판정 (FR-ORCHESTRATION.5)", () => {
  it("같은 경로는 겹친다", () => {
    expect(pathsOverlap("src/main", "src/main")).toBe(true);
  });

  it("상위와 하위는 겹친다 — 방향과 무관하다", () => {
    expect(pathsOverlap("src", "src/main/domain")).toBe(true);
    expect(pathsOverlap("src/main/domain", "src")).toBe(true);
  });

  it("형제 경로는 겹치지 않는다", () => {
    expect(pathsOverlap("src/main", "src/test")).toBe(false);
  });

  it("이름이 접두사로 겹치는 다른 디렉터리는 겹치지 않는다", () => {
    expect(pathsOverlap("src/main", "src/main-legacy")).toBe(false);
  });

  it("끝의 구분자와 역슬래시는 결과를 바꾸지 않는다", () => {
    expect(pathsOverlap("src/main/", "src\\main")).toBe(true);
  });
});

describe("배치 충돌 (FR-ORCHESTRATION.5)", () => {
  it("겹치지 않는 배치는 충돌이 없다", () => {
    expect(ownershipConflicts([assignment("w1", "implementer", ["src/main"]), assignment("w2", "tester", ["src/test"])])).toEqual([]);
  });

  it("겹치는 배치는 어느 작업자와 어느 경로가 문제인지 짚는다", () => {
    const c = ownershipConflicts([assignment("w1", "implementer", ["src"]), assignment("w2", "tester", ["src/test"])]);
    expect(c).toEqual([{ a: "w1", b: "w2", path: "src", otherPath: "src/test" }]);
  });

  it("세 명이 얽히면 짝마다 남는다", () => {
    const c = ownershipConflicts([
      assignment("w1", "implementer", ["src"]),
      assignment("w2", "tester", ["src/test"]),
      assignment("w3", "reviewer", ["src/main"]),
    ]);
    expect(c).toHaveLength(2);
    expect(c.map((x) => [x.a, x.b])).toEqual([
      ["w1", "w2"],
      ["w1", "w3"],
    ]);
  });

  it("충돌하는 배치는 아무 작업자도 시작하지 않는다", async () => {
    const workers = fakeWorkers();
    const o = new IssueOrchestrator(fakeTracker(), fakeSpaces(), workers);
    const out = await o.start(
      "제목",
      "s1",
      { issue: "#501", leaderId: "L1" },
      [assignment("w1", "implementer", ["src"]), assignment("w2", "tester", ["src/test"])],
      [brief("w1"), brief("w2")],
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.rejections.some((r) => r.code === "ownership")).toBe(true);
    expect(workers.started).toEqual([]);
  });
});
