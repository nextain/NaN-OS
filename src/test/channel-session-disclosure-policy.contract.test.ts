// #503 공개 범위 계약 테스트 (P02) — FR-CHANNEL-SESSION.5.
// 좁은 곳의 이야기가 넓은 채널로 새지 않는가, 거부가 조용하지 않은가.
import { describe, it, expect } from "vitest";
import { ChannelSessionService } from "../main/app/control/channel-session.js";
import { checkDisclosure, mayDisclose, type ChannelKind, type Confidentiality } from "../main/domain/channel-session.js";
import { fakeMembership, fakeRegistry, fakeTransport } from "./helpers/channel-session-fixture.js";

const CHANNELS: readonly ChannelKind[] = ["desktop", "voice", "discord"];
const LEVELS: readonly Confidentiality[] = ["public", "team", "workspace-internal"];

describe("공개 범위 (FR-CHANNEL-SESSION.5)", () => {
  it("공개 내용은 어느 채널로도 나간다", () => {
    for (const c of CHANNELS) expect(mayDisclose(c, "public")).toBe(true);
  });

  it("워크스페이스 내부 내용은 데스크톱과 음성까지만 나간다", () => {
    expect(mayDisclose("desktop", "workspace-internal")).toBe(true);
    expect(mayDisclose("voice", "workspace-internal")).toBe(true);
    expect(mayDisclose("discord", "workspace-internal")).toBe(false);
  });

  it("팀 내용은 세 채널 모두 나간다", () => {
    for (const c of CHANNELS) expect(mayDisclose(c, "team")).toBe(true);
  });

  it("모든 조합이 정의되어 있다 — 판단이 빠지는 칸이 없다", () => {
    for (const c of CHANNELS) for (const l of LEVELS) expect(typeof mayDisclose(c, l)).toBe("boolean");
  });
});

describe("거부는 조용하지 않다 (FR-CHANNEL-SESSION.5)", () => {
  it("허용되면 사유가 없다", () => {
    expect(checkDisclosure("desktop", "workspace-internal")).toEqual({ ok: true });
  });

  it("거부되면 무엇이 어디로 못 가는지 말한다", () => {
    const v = checkDisclosure("discord", "workspace-internal");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toContain("workspace-internal");
    expect(v.reason).toContain("discord");
  });
});

describe("서비스가 실제로 막는다 (FR-CHANNEL-SESSION.5)", () => {
  function service() {
    const transport = fakeTransport();
    return { svc: new ChannelSessionService(fakeRegistry(), fakeMembership(), transport), transport };
  }

  it("범위를 넘는 내용은 전송 자체를 하지 않는다", async () => {
    const { svc, transport } = service();
    expect(await svc.emit("reply", "discord", "내부 자격증명 경로", "workspace-internal")).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  it("범위 안이면 보낸다", async () => {
    const { svc, transport } = service();
    expect(await svc.emit("reply", "discord", "빌드가 끝났습니다", "team")).toBe(true);
    expect(transport.sent).toHaveLength(1);
  });

  it("같은 내용도 채널에 따라 갈린다", async () => {
    const { svc, transport } = service();
    expect(await svc.emit("reply", "desktop", "같은 문장", "workspace-internal")).toBe(true);
    expect(await svc.emit("reply", "discord", "같은 문장", "workspace-internal")).toBe(false);
    expect(transport.sent.map((m) => m.channel)).toEqual(["desktop"]);
  });
});
