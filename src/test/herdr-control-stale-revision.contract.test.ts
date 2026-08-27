// #502 개정 충돌 계약 테스트 (P02) — FR-HERDR-CONTROL.7.
// 기대 개정이 어긋나면 타입 있는 충돌로 거절하는가, 상태를 조용히 덮어쓰지 않는가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { admit } from "../main/domain/herdr-control.js";
import { event, fakeConnection, fakeMutate, fakeObserve, request, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };
const GRANTED = ["observe", "workspace-write"] as const;

describe("기대 개정 (FR-HERDR-CONTROL.7) [UC-HERDR-CONTROL-STALE-REVISION]", () => {
  it("일치하면 통과한다", () => {
    expect(admit(request({ expectedRevision: { value: 4 } }), { currentRevision: { value: 4 }, grantedTiers: [...GRANTED] })).toEqual([]);
  });

  it.each([
    [3, 4, "뒤처진 기대"],
    [5, 4, "앞선 기대"],
  ])("%s 와 현재 %s 는 stale-revision 이다 (%s)", (expected, current) => {
    const r = admit(request({ expectedRevision: { value: expected } }), { currentRevision: { value: current }, grantedTiers: [...GRANTED] });
    expect(r.map((x) => x.code)).toEqual(["stale-revision"]);
    expect(r[0]?.detail).toContain(String(current));
  });
});

describe("무음 덮어쓰기 금지 (FR-HERDR-CONTROL.7)", () => {
  it("그 사이 상태가 바뀌면 요청이 포트에 도달하지 않는다", async () => {
    const observe = fakeObserve(snapshot(1));
    const mutate = fakeMutate();
    const p = new HerdrControlPlane(observe, mutate, fakeConnection([snapshot(9)]), [...GRANTED], POLICY);
    await p.observeNow();
    await p.watch(() => {});
    observe.emit(event(2));
    const out = await p.requestMutation(request({ expectedRevision: { value: 1 } }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.rejections.map((r) => r.code)).toEqual(["stale-revision"]);
    expect(mutate.applied).toEqual([]);
  });

  it("현재 개정을 다시 읽어 보내면 통과한다 — 충돌은 막다른 길이 아니다", async () => {
    const observe = fakeObserve(snapshot(1));
    const mutate = fakeMutate();
    const p = new HerdrControlPlane(observe, mutate, fakeConnection([snapshot(9)]), [...GRANTED], POLICY);
    await p.observeNow();
    await p.watch(() => {});
    observe.emit(event(2));
    const retry = await p.requestMutation(request({ expectedRevision: p.currentRevision() }));
    expect(retry.ok).toBe(true);
    expect(mutate.applied).toHaveLength(1);
  });
});
