// #503 재개 계약 테스트 (P02) — FR-CHANNEL-SESSION.3·4·7.
// 대화 응답과 진행 알림이 구분되는가, 재동기화 전에 완료를 말하지 않는가.
import { describe, it, expect } from "vitest";
import { ChannelSessionService } from "../main/app/control/channel-session.js";
import { mayReportCompletion, stanceAfterReconnect } from "../main/domain/channel-session.js";
import { fakeMembership, fakeRegistry, fakeTransport, identity } from "./helpers/channel-session-fixture.js";

function service() {
  const registry = fakeRegistry();
  const transport = fakeTransport();
  return { svc: new ChannelSessionService(registry, fakeMembership(), transport), registry, transport };
}

describe("응답과 진행 알림 분리 (FR-CHANNEL-SESSION.3)", () => {
  it("두 종류가 각각 보내진다", async () => {
    const { svc, transport } = service();
    await svc.emit("reply", "desktop", "다 됐습니다", "workspace-internal");
    await svc.emit("progress", "desktop", "작업자 2명 실행 중", "workspace-internal");
    expect(transport.sent.map((m) => m.kind)).toEqual(["reply", "progress"]);
  });

  it("진행 알림이 대화 응답을 대신하지 않는다 — 종류가 보존된다", async () => {
    const { svc, transport } = service();
    await svc.emit("progress", "discord", "진행 중", "team");
    expect(transport.sent[0]?.kind).toBe("progress");
    expect(transport.sent[0]?.kind).not.toBe("reply");
  });
});

describe("재동기화 전 단정 금지 (FR-CHANNEL-SESSION.7)", () => {
  it("재동기화되지 않았으면 불명이다", () => {
    expect(stanceAfterReconnect(false)).toBe("unknown-until-resynced");
    expect(stanceAfterReconnect(true)).toBe("resynced");
  });

  it("불명이면 증거가 있어도 완료를 말하지 않는다", () => {
    expect(mayReportCompletion("unknown-until-resynced", ["log"])).toBe(false);
  });

  it("재동기화됐어도 증거가 없으면 완료를 말하지 않는다", () => {
    expect(mayReportCompletion("resynced", [])).toBe(false);
  });

  it("재동기화되고 증거가 있어야 완료를 말한다", () => {
    expect(mayReportCompletion("resynced", ["log"])).toBe(true);
  });
});

describe("재개 흐름 (FR-CHANNEL-SESSION.4·7)", () => {
  it("보관된 참조를 찾아 이어간다", async () => {
    const { svc } = service();
    await svc.adopt(identity());
    const out = await svc.resume("c1", true, ["log:1"]);
    expect(out.reference).toEqual({ issue: "#501", spaceId: "s1", conversationId: "c1" });
    expect(out.stance).toBe("resynced");
    expect(out.mayReportCompletion).toBe(true);
  });

  it("참조가 없으면 재동기화됐다고 해도 불명으로 남긴다", async () => {
    const { svc } = service();
    const out = await svc.resume("없는대화", true, ["log:1"]);
    expect(out.reference).toBeNull();
    expect(out.stance).toBe("unknown-until-resynced");
    expect(out.mayReportCompletion).toBe(false);
  });

  it("재연결 직후 증거가 없으면 완료를 말하지 않는다", async () => {
    const { svc } = service();
    await svc.adopt(identity());
    expect((await svc.resume("c1", true, [])).mayReportCompletion).toBe(false);
  });
});
