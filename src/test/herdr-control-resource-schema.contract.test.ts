// #502 자원·구독 계약 테스트 (P02) — FR-HERDR-CONTROL.1·2·10.
// 스키마 버전과 안정된 식별자가 실리는가, 개정 누락을 감지하는가, 비밀값이 전달에서 빠지는가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { checkContinuity, stripSecrets } from "../main/domain/herdr-control.js";
import { event, fakeConnection, fakeMutate, fakeObserve, resource, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };
function plane(observe = fakeObserve()) {
  return new HerdrControlPlane(observe, fakeMutate(), fakeConnection([snapshot(9)]), ["observe", "workspace-write"], POLICY);
}

describe("자원 표면 (FR-HERDR-CONTROL.1)", () => {
  it("스냅샷은 스키마 버전과 개정을 함께 싣는다", async () => {
    const snap = await plane().observeNow();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.revision).toEqual({ value: 1 });
  });

  it("자원은 종류와 안정된 식별자를 갖는다", async () => {
    const observe = fakeObserve(snapshot(1, [resource("space", "s1"), resource("terminal", "t1"), resource("agent", "a1")]));
    const snap = await plane(observe).observeNow();
    expect(snap.resources.map((r) => r.id)).toEqual([
      { kind: "space", id: "s1" },
      { kind: "terminal", id: "t1" },
      { kind: "agent", id: "a1" },
    ]);
  });
});

describe("구독 연속성 (FR-HERDR-CONTROL.2)", () => {
  it("개정이 하나씩 오르면 연속이다", () => {
    expect(checkContinuity({ value: 4 }, { value: 5 })).toEqual({ ok: true });
  });

  it("건너뛰면 gap 으로 남긴다", () => {
    expect(checkContinuity({ value: 4 }, { value: 7 })).toEqual({ ok: false, reason: "gap", from: 4, to: 7 });
  });

  it("뒤로 가면 regressed 로 남긴다 — gap 과 구분한다", () => {
    expect(checkContinuity({ value: 7 }, { value: 4 })).toEqual({ ok: false, reason: "regressed", from: 7, to: 4 });
    expect(checkContinuity({ value: 7 }, { value: 7 })).toEqual({ ok: false, reason: "regressed", from: 7, to: 7 });
  });

  it("제어면이 누락을 실제로 기록한다", async () => {
    const observe = fakeObserve();
    const p = plane(observe);
    await p.observeNow();
    const seen: string[] = [];
    await p.watch((_e, continuity) => seen.push(continuity.ok ? "ok" : continuity.reason));
    observe.emit(event(2));
    observe.emit(event(5));
    expect(seen).toEqual(["ok", "gap"]);
    expect(p.observedGaps()).toHaveLength(1);
  });

  it("구독 해제가 실제로 이뤄진다 — 리스너를 흘리지 않는다", async () => {
    const observe = fakeObserve();
    const p = plane(observe);
    const unsubscribe = await p.watch(() => {});
    unsubscribe();
    expect(observe.unsubscribed).toBe(true);
  });
});

describe("비밀값 제외 (FR-HERDR-CONTROL.10, #434 승계)", () => {
  it.each(["apiKey", "api_key", "API-KEY", "token", "password", "clientSecret", "credential"])("%s 는 전달에서 빠진다", (key) => {
    expect(stripSecrets({ [key]: "값", 안전: "유지" })).toEqual({ 안전: "유지" });
  });

  it("비밀이 아닌 값은 그대로 남는다", () => {
    expect(stripSecrets({ cwd: "/ws", pid: "42" })).toEqual({ cwd: "/ws", pid: "42" });
  });

  it("관측 결과와 이벤트 모두에서 빠진다", async () => {
    const observe = fakeObserve(snapshot(1, [resource("terminal", "t1", { apiKey: "비밀", cwd: "/ws" })]));
    const p = plane(observe);
    const snap = await p.observeNow();
    expect(snap.resources[0]?.attributes).toEqual({ cwd: "/ws" });
    const seen: Record<string, string>[] = [];
    await p.watch((e) => seen.push(e.resource.attributes as Record<string, string>));
    observe.emit(event(2, resource("terminal", "t1", { token: "비밀", pid: "7" })));
    expect(seen).toEqual([{ pid: "7" }]);
  });
});
