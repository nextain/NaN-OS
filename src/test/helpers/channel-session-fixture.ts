// #503 계약 테스트용 대역 포트. 결정론 — 실제 채널도 저장소도 쓰지 않는다.
import type { ChannelMembershipPort, ChannelTransportPort, SessionRegistryPort } from "../../main/ports/channel-session.js";
import type { InboundMessage, OutboundMessage, ResumeReference, SessionIdentity } from "../../main/domain/channel-session.js";

export function identity(over: Partial<SessionIdentity> = {}): SessionIdentity {
  return { conversationId: "c1", taskId: "t1", issue: "#501", spaceId: "s1", ...over };
}

export function inbound(over: Partial<InboundMessage> = {}): InboundMessage {
  return { deliveryId: "d1", channel: "discord", conversationId: "c1", sequence: 1, text: "이거 고쳐줘", ...over };
}

export interface FakeRegistry extends SessionRegistryPort {
  readonly registered: SessionIdentity[];
  readonly references: Map<string, ResumeReference>;
}

export function fakeRegistry(initial: readonly SessionIdentity[] = []): FakeRegistry {
  const registered = [...initial];
  const references = new Map<string, ResumeReference>();
  return {
    registered,
    references,
    async list() {
      return registered;
    },
    async register(id) {
      registered.push(id);
    },
    async saveResumeReference(reference) {
      references.set(reference.conversationId, reference);
    },
    async loadResumeReference(conversationId) {
      return references.get(conversationId) ?? null;
    },
  };
}

export function fakeMembership(authorized = true): ChannelMembershipPort {
  return { async isAuthorized() { return authorized; } };
}

export interface FakeTransport extends ChannelTransportPort {
  readonly sent: OutboundMessage[];
}

export function fakeTransport(): FakeTransport {
  const sent: OutboundMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
