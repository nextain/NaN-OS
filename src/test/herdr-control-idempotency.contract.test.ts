// #502 멱등 계약 테스트 (P02) — FR-HERDR-CONTROL.4·5.
// 같은 멱등 키의 재전송이 프로세스를 두 번 만들지 않는가, 증거 없는 성공을 받지 않는가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { hasEvidence } from "../main/domain/herdr-control.js";
import { fakeConnection, fakeMutate, fakeObserve, request, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };
function plane(mutate = fakeMutate()) {
  return {
    plane: new HerdrControlPlane(fakeObserve(), mutate, fakeConnection([snapshot(9)]), ["observe", "workspace-write"], POLICY),
    mutate,
  };
}

describe("멱등 재전송 (FR-HERDR-CONTROL.4)", () => {
  it("같은 키를 두 번 보내면 한 번만 실행하고 최초 결과를 돌려준다", async () => {
    const { plane: p, mutate } = plane();
    await p.observeNow();
    const first = await p.requestMutation(request());
    const second = await p.requestMutation(request({ requestId: "r2" }));
    expect(mutate.applied).toHaveLength(1);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.deduplicated).toBe(true);
    expect(second.result.requestId).toBe(first.result.requestId);
  });

  it("첫 요청은 중복이 아니다", async () => {
    const { plane: p } = plane();
    await p.observeNow();
    const first = await p.requestMutation(request());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.deduplicated).toBe(false);
  });

  it("키가 다르면 각각 실행한다", async () => {
    const { plane: p, mutate } = plane();
    await p.observeNow();
    await p.requestMutation(request({ idempotencyKey: "k1" }));
    await p.requestMutation(request({ idempotencyKey: "k2", requestId: "r2" }));
    expect(mutate.applied).toHaveLength(2);
  });

  it("거절된 요청은 기억하지 않는다 — 고친 뒤 다시 보낼 수 있다", async () => {
    const { plane: p, mutate } = plane();
    await p.observeNow();
    const bad = await p.requestMutation(request({ expectedRevision: { value: 99 } }));
    expect(bad.ok).toBe(false);
    const good = await p.requestMutation(request());
    expect(good.ok).toBe(true);
    expect(mutate.applied).toHaveLength(1);
  });
});

describe("증거 없는 성공 (FR-HERDR-CONTROL.5)", () => {
  it("완료에는 영향 자원과 증거가 함께 있어야 한다", () => {
    expect(hasEvidence({ requestId: "r", outcome: "completed", affected: [{ kind: "terminal", id: "t" }], evidence: ["log"] })).toBe(true);
  });

  it.each([
    ["증거 없음", { affected: [{ kind: "terminal" as const, id: "t" }], evidence: [] }],
    ["영향 자원 없음", { affected: [], evidence: ["log"] }],
    ["둘 다 없음", { affected: [], evidence: [] }],
  ])("완료인데 %s 이면 받지 않는다", (_l, patch) => {
    expect(hasEvidence({ requestId: "r", outcome: "completed", ...patch })).toBe(false);
  });

  it("부분 완료에도 증거를 요구한다", () => {
    expect(hasEvidence({ requestId: "r", outcome: "partial", affected: [], evidence: [] })).toBe(false);
  });

  it("실패·취소·타임아웃에는 증거를 강요하지 않는다 — 남길 것이 없을 수 있다", () => {
    for (const outcome of ["failed", "cancelled", "timeout", "disconnected"] as const) {
      expect(hasEvidence({ requestId: "r", outcome, affected: [], evidence: [] })).toBe(true);
    }
  });

  it("제어면은 증거 없는 완료를 거절하고 캐시에도 넣지 않는다", async () => {
    const { plane: p } = plane(fakeMutate({ evidence: [], affected: [] }));
    await p.observeNow();
    const out = await p.requestMutation(request());
    expect(out.ok).toBe(false);
    const retry = await p.requestMutation(request());
    expect(retry.ok).toBe(false);
  });
});
