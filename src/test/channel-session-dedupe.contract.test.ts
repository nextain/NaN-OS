// #503 중복 전달 계약 테스트 (P02) — FR-CHANNEL-SESSION.6.
// 같은 메시지가 두 번 와도 이슈나 작업자가 두 개 생기지 않는가.
import { describe, it, expect } from "vitest";
import { ChannelSessionService } from "../main/app/control/channel-session.js";
import { emptyLedger, judgeDelivery, recordDelivery } from "../main/domain/channel-session.js";
import { fakeMembership, fakeRegistry, fakeTransport, identity, inbound } from "./helpers/channel-session-fixture.js";

describe("중복 판정 (FR-CHANNEL-SESSION.6)", () => {
  it("처음 보는 전달은 받는다", () => {
    expect(judgeDelivery(emptyLedger(), inbound())).toEqual({ kind: "accept" });
  });

  it("같은 전달 식별자가 다시 오면 중복이다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 3 }));
    expect(judgeDelivery(ledger, inbound({ sequence: 3 }))).toEqual({ kind: "duplicate", firstSeenSequence: 3 });
  });

  it("순번이 달라도 전달 식별자가 같으면 중복이다 — 채널이 순번을 다시 매겨도 속지 않는다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 3 }));
    expect(judgeDelivery(ledger, inbound({ sequence: 9 })).kind).toBe("duplicate");
  });

  it("다른 전달은 순번이 올라가면 받는다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 3 }));
    expect(judgeDelivery(ledger, inbound({ deliveryId: "d2", sequence: 4 }))).toEqual({ kind: "accept" });
  });
});

describe("원장 갱신", () => {
  it("가장 큰 순번을 유지한다 — 뒤늦게 온 작은 순번이 되돌리지 않는다", () => {
    let ledger = recordDelivery(emptyLedger(), inbound({ deliveryId: "d1", sequence: 5 }));
    ledger = recordDelivery(ledger, inbound({ deliveryId: "d2", sequence: 2 }));
    expect(ledger.latestSequence).toBe(5);
  });

  it("원장은 갱신될 때마다 새 값이다 — 이전 원장이 바뀌지 않는다", () => {
    const before = emptyLedger();
    const after = recordDelivery(before, inbound());
    expect(before.seen.size).toBe(0);
    expect(after.seen.size).toBe(1);
  });
});

describe("서비스 수용 (FR-CHANNEL-SESSION.6)", () => {
  function service() {
    return new ChannelSessionService(fakeRegistry(), fakeMembership(), fakeTransport());
  }

  it("같은 전달을 두 번 보내면 두 번째는 중복으로 거절한다", async () => {
    const svc = service();
    expect((await svc.intake(inbound(), identity())).ok).toBe(true);
    const second = await svc.intake(inbound(), identity());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("duplicate");
  });

  it("자격이 없는 채널의 입력은 아예 받지 않는다", async () => {
    const svc = new ChannelSessionService(fakeRegistry(), fakeMembership(false), fakeTransport());
    const out = await svc.intake(inbound(), identity());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("unauthorized");
  });

  it("거절된 입력은 원장에 남지 않는다 — 자격을 얻은 뒤 다시 보낼 수 있다", async () => {
    const svc = new ChannelSessionService(fakeRegistry(), fakeMembership(false), fakeTransport());
    await svc.intake(inbound(), identity());
    const authorized = new ChannelSessionService(fakeRegistry(), fakeMembership(true), fakeTransport());
    expect((await authorized.intake(inbound(), identity())).ok).toBe(true);
  });
});
