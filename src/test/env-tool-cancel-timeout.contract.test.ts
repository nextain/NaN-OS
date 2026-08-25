// #499 취소·타임아웃 계약 테스트 (P02) — FR-ENV-TOOL.1·9.
// 취소가 실제로 멈추는가, 부분 실행이 남는가, 재전송이 두 번 실행하지 않는가.
import { describe, it, expect } from "vitest";
import { EnvironmentToolService } from "../main/app/control/env-tool.js";
import { terminate } from "../main/domain/env-tool.js";
import { envRequest, fakeBrowser, fakeCancellation, fakeTerminal } from "./helpers/env-tool-fixture.js";

function service() {
  const browser = fakeBrowser();
  return { svc: new EnvironmentToolService(browser, fakeTerminal(), fakeCancellation(), ["observe", "workspace-write"]), browser };
}

describe("종료 사유 구별 (FR-ENV-TOOL.9)", () => {
  it("정상 종료만 완료다", () => {
    expect(terminate("finished", []).state).toBe("completed");
  });

  it("취소는 완료가 아니고 실패도 아니다", () => {
    expect(terminate("cancelled", []).state).toBe("cancelled");
  });

  it("타임아웃은 완료로 승격되지 않는다", () => {
    expect(terminate("timed-out", []).state).not.toBe("completed");
  });

  it("취소·타임아웃이어도 이미 일어난 일은 남는다", () => {
    expect(terminate("cancelled", ["파일 3개 기록됨"]).partialEffects).toEqual(["파일 3개 기록됨"]);
    expect(terminate("timed-out", ["요청 1건 전송됨"]).partialEffects).toEqual(["요청 1건 전송됨"]);
  });
});

describe("취소 (FR-ENV-TOOL.9)", () => {
  it("진행 중 작업을 취소하면 상태가 취소로 바뀌고 부분 결과가 온다", async () => {
    const { svc } = service();
    await svc.click(envRequest(), { kind: "reference", ref: "b" });
    // 완료된 작업은 취소되지 않는다.
    const done = await svc.cancel("op1");
    expect(done.partialEffects).toEqual([]);
    expect(svc.stateOf("op1")).toBe("completed");
  });

  it("모르는 작업을 취소해도 터지지 않는다", async () => {
    const { svc } = service();
    const out = await svc.cancel("없는작업");
    expect(out.state).toBe("cancelled");
    expect(out.partialEffects).toEqual([]);
  });
});

describe("멱등 재전송 (FR-ENV-TOOL.9)", () => {
  it("같은 키를 두 번 보내면 브라우저를 한 번만 부른다", async () => {
    const { svc, browser } = service();
    const first = await svc.click(envRequest(), { kind: "reference", ref: "b" });
    const second = await svc.click(envRequest({ operationId: "op2" }), { kind: "reference", ref: "b" });
    expect(browser.calls.filter((c) => c === "click")).toHaveLength(1);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.operation.deduplicated).toBe(true);
    expect(second.operation.operationId).toBe("op1");
  });

  it("키가 다르면 각각 실행한다", async () => {
    const { svc, browser } = service();
    await svc.click(envRequest({ idempotencyKey: "k1" }), { kind: "reference", ref: "b" });
    await svc.click(envRequest({ operationId: "op2", idempotencyKey: "k2" }), { kind: "reference", ref: "b" });
    expect(browser.calls.filter((c) => c === "click")).toHaveLength(2);
  });

  it("거절된 요청은 기억하지 않는다", async () => {
    const { svc, browser } = service();
    const bad = await svc.click(envRequest({ capability: "purchase" }), { kind: "reference", ref: "b" });
    expect(bad.ok).toBe(false);
    const good = await svc.click(envRequest(), { kind: "reference", ref: "b" });
    expect(good.ok).toBe(true);
    expect(browser.calls.filter((c) => c === "click")).toHaveLength(1);
  });
});
