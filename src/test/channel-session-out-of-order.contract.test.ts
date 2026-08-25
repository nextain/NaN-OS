// #503 순서 계약 테스트 (P02) — FR-CHANNEL-SESSION.6.
// 순서가 뒤바뀐 이벤트가 상태를 되돌리지 않는가.
import { describe, it, expect } from "vitest";
import { ChannelSessionService } from "../main/app/control/channel-session.js";
import { emptyLedger, judgeDelivery, recordDelivery } from "../main/domain/channel-session.js";
import { fakeMembership, fakeRegistry, fakeTransport, identity, inbound } from "./helpers/channel-session-fixture.js";

describe("순서 판정 (FR-CHANNEL-SESSION.6)", () => {
  it("지난 순번은 순서가 뒤바뀐 것이다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 5 }));
    expect(judgeDelivery(ledger, inbound({ deliveryId: "d2", sequence: 3 }))).toEqual({ kind: "out-of-order", latestSequence: 5 });
  });

  it("같은 순번도 순서가 뒤바뀐 것으로 본다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 5 }));
    expect(judgeDelivery(ledger, inbound({ deliveryId: "d2", sequence: 5 })).kind).toBe("out-of-order");
  });

  it("중복이 순서보다 먼저 판정된다 — 같은 전달을 순서 문제로 오해하지 않는다", () => {
    const ledger = recordDelivery(emptyLedger(), inbound({ sequence: 5 }));
    expect(judgeDelivery(ledger, inbound({ sequence: 1 })).kind).toBe("duplicate");
  });
});

describe("상태 역전 없음 (FR-CHANNEL-SESSION.6)", () => {
  it("뒤늦게 온 옛 메시지는 받지 않고 최신 순번도 낮추지 않는다", async () => {
    const svc = new ChannelSessionService(fakeRegistry(), fakeMembership(), fakeTransport());
    await svc.intake(inbound({ deliveryId: "d1", sequence: 5 }), identity());
    const late = await svc.intake(inbound({ deliveryId: "d2", sequence: 2 }), identity());
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.reason).toBe("out-of-order");
    const next = await svc.intake(inbound({ deliveryId: "d3", sequence: 6 }), identity());
    expect(next.ok).toBe(true);
  });

  it("순번이 이어지면 계속 받는다", async () => {
    const svc = new ChannelSessionService(fakeRegistry(), fakeMembership(), fakeTransport());
    for (const [i, sequence] of [1, 2, 3, 4].entries()) {
      const out = await svc.intake(inbound({ deliveryId: `d${i}`, sequence }), identity());
      expect(out.ok).toBe(true);
    }
  });
});
