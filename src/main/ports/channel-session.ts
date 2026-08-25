// ports/channel-session — #503 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// 채널은 L3 어댑터다 — 여기에는 작업자 생명주기 진입점이 없다.
import type { ChannelKind, OutboundMessage, ResumeReference, SessionIdentity } from "../domain/channel-session.js";

export interface ChannelTransportPort {
  send(message: OutboundMessage): Promise<void>;
}

export interface SessionRegistryPort {
  list(): Promise<readonly SessionIdentity[]>;
  register(identity: SessionIdentity): Promise<void>;
  /** 재개에 필요한 참조만 보관한다. 작업자 실행 상태는 보관하지 않는다. */
  saveResumeReference(reference: ResumeReference): Promise<void>;
  loadResumeReference(conversationId: string): Promise<ResumeReference | null>;
}

export interface ChannelMembershipPort {
  /** 이 채널에서 이 대화를 이어갈 자격이 있는가. */
  isAuthorized(channel: ChannelKind, conversationId: string): Promise<boolean>;
}
