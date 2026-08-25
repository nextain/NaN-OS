// #502 재접속 계약 테스트 (P02) — FR-HERDR-CONTROL.9.
// 상한이 있는가, 재동기화 전에 아무것도 단정하지 않는가, 대기가 결정적인가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { backoffMs, shouldRetry, stanceAfterReconnect } from "../main/domain/herdr-control.js";
import { fakeConnection, fakeMutate, fakeObserve, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 40 };

describe("재접속 상한 (FR-HERDR-CONTROL.9)", () => {
  it("상한 안에서만 다시 시도한다", () => {
    expect(shouldRetry(0, POLICY)).toBe(true);
    expect(shouldRetry(2, POLICY)).toBe(true);
    expect(shouldRetry(3, POLICY)).toBe(false);
  });

  it("대기는 지수로 늘고 상한에서 멈춘다 — 난수를 섞지 않는다", () => {
    expect([0, 1, 2, 3, 4].map((a) => backoffMs(a, POLICY))).toEqual([10, 20, 40, 40, 40]);
    expect(backoffMs(1, POLICY)).toBe(backoffMs(1, POLICY));
  });
});

describe("재동기화 전 단정 금지 (FR-HERDR-CONTROL.9)", () => {
  it("재동기화되지 않았으면 상태는 불명이다", () => {
    expect(stanceAfterReconnect(false)).toBe("unknown-until-resynced");
    expect(stanceAfterReconnect(true)).toBe("resynced");
  });

  it("첫 시도에 붙으면 한 번 만에 재동기화된다", async () => {
    const slept: number[] = [];
    const p = new HerdrControlPlane(fakeObserve(), fakeMutate(), fakeConnection([snapshot(42)]), ["observe"], POLICY);
    const out = await p.reconnect(async (ms) => void slept.push(ms));
    expect(out).toEqual({ stance: "resynced", attempts: 1 });
    expect(slept).toEqual([]);
    expect(p.currentRevision()).toEqual({ value: 42 });
  });

  it("몇 번 실패한 뒤 붙으면 그 사이 대기가 지수로 늘어난다", async () => {
    const slept: number[] = [];
    const p = new HerdrControlPlane(fakeObserve(), fakeMutate(), fakeConnection([null, null, snapshot(7)]), ["observe"], POLICY);
    const out = await p.reconnect(async (ms) => void slept.push(ms));
    expect(out).toEqual({ stance: "resynced", attempts: 3 });
    expect(slept).toEqual([10, 20]);
  });

  it("상한까지 못 붙으면 불명으로 남기고 개정을 지어내지 않는다", async () => {
    const slept: number[] = [];
    const p = new HerdrControlPlane(fakeObserve(), fakeMutate(), fakeConnection([null]), ["observe"], POLICY);
    const out = await p.reconnect(async (ms) => void slept.push(ms));
    expect(out).toEqual({ stance: "unknown-until-resynced", attempts: 3 });
    expect(slept).toEqual([10, 20, 40]);
    expect(p.currentRevision()).toEqual({ value: 0 });
  });
});
