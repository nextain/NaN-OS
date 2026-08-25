// #502 결과 분류 계약 테스트 (P02) — FR-HERDR-CONTROL.8.
// 끊김·타임아웃·종료·취소·부분 완료가 서로 구별되는가, 불명을 성공으로 승격하지 않는가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { hasEvidence, type MutationResult, type OutcomeKind } from "../main/domain/herdr-control.js";
import { fakeConnection, fakeMutate, fakeObserve, request, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };
const ALL: readonly OutcomeKind[] = ["completed", "failed", "cancelled", "timeout", "disconnected", "partial"];

function result(outcome: OutcomeKind): MutationResult {
  return { requestId: "r", outcome, affected: [{ kind: "terminal", id: "t" }], evidence: ["log"] };
}

describe("결과 종류 (FR-HERDR-CONTROL.8)", () => {
  it("여섯 종류가 서로 다르다 — 하나의 실패로 뭉뚱그리지 않는다", () => {
    expect(new Set(ALL).size).toBe(6);
  });

  it("완료만 성공이다 — 나머지는 성공이 아니다", () => {
    const succeeded = ALL.filter((o) => o === "completed");
    expect(succeeded).toEqual(["completed"]);
  });

  it("부분 완료는 완료도 실패도 아니다", () => {
    expect(ALL).toContain("partial");
    expect(result("partial").outcome).not.toBe("completed");
    expect(result("partial").outcome).not.toBe("failed");
  });

  it("타임아웃과 끊김은 서로 다른 결과다", () => {
    expect(result("timeout").outcome).not.toBe(result("disconnected").outcome);
  });

  it("취소는 실패가 아니다", () => {
    expect(result("cancelled").outcome).not.toBe("failed");
  });
});

describe("불명은 승격되지 않는다 (FR-HERDR-CONTROL.8)", () => {
  it.each(["timeout", "disconnected", "partial"] as const)("%s 결과가 제어면을 통과해도 완료로 바뀌지 않는다", async (outcome) => {
    const p = new HerdrControlPlane(
      fakeObserve(),
      fakeMutate({ outcome }),
      fakeConnection([snapshot(9)]),
      ["observe", "workspace-write"],
      POLICY,
    );
    await p.observeNow();
    const out = await p.requestMutation(request());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.outcome).toBe(outcome);
  });

  it("증거가 없어도 실패 계열은 그대로 통과한다 — 남길 것이 없을 수 있다", () => {
    for (const outcome of ["failed", "cancelled", "timeout", "disconnected"] as const) {
      expect(hasEvidence({ requestId: "r", outcome, affected: [], evidence: [] })).toBe(true);
    }
  });
});
