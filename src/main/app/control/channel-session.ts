// app/control/channel-session — #503 조립 (FR-CHANNEL-SESSION.1~7). 포트만 사용. 판정 규칙 0.
import type { ChannelMembershipPort, ChannelTransportPort, SessionRegistryPort } from "../../ports/channel-session.js";
import {
  checkDisclosure,
  checkIdentity,
  emptyLedger,
  judgeDelivery,
  mayReportCompletion,
  recordDelivery,
  resumeReferenceOf,
  stanceAfterReconnect,
  type ChannelKind,
  type ChannelStance,
  type Confidentiality,
  type DeliveryLedger,
  type DeliveryVerdict,
  type IdentityRejection,
  type InboundMessage,
  type OutboundKind,
  type ResumeReference,
  type SessionIdentity,
} from "../../domain/channel-session.js";

export type IntakeOutcome =
  | { readonly ok: true; readonly identity: SessionIdentity }
  | { readonly ok: false; readonly reason: "unauthorized" | "duplicate" | "out-of-order"; readonly verdict?: DeliveryVerdict };

export class ChannelSessionService {
  private ledger: DeliveryLedger = emptyLedger();

  constructor(
    private readonly registry: SessionRegistryPort,
    private readonly membership: ChannelMembershipPort,
    private readonly transport: ChannelTransportPort,
  ) {}

  /** 같은 이슈에 정체성이 둘 생기지 않게 한다 (FR-CHANNEL-SESSION.1). */
  async adopt(identity: SessionIdentity): Promise<readonly IdentityRejection[]> {
    const rejections = checkIdentity(await this.registry.list(), identity);
    if (rejections.length > 0) return rejections;
    await this.registry.register(identity);
    await this.registry.saveResumeReference(resumeReferenceOf(identity));
    return [];
  }

  /** 채널 입력 수용 (FR-CHANNEL-SESSION.2·6). 중복과 순서 뒤바뀜은 상태를 바꾸지 않는다. */
  async intake(message: InboundMessage, identity: SessionIdentity): Promise<IntakeOutcome> {
    if (!(await this.membership.isAuthorized(message.channel, message.conversationId))) {
      return { ok: false, reason: "unauthorized" };
    }
    const verdict = judgeDelivery(this.ledger, message);
    if (verdict.kind !== "accept") return { ok: false, reason: verdict.kind, verdict };
    this.ledger = recordDelivery(this.ledger, message);
    return { ok: true, identity };
  }

  /** 내보내기 (FR-CHANNEL-SESSION.3·5). 공개 범위를 넘으면 보내지 않는다. */
  async emit(kind: OutboundKind, channel: ChannelKind, text: string, level: Confidentiality): Promise<boolean> {
    const verdict = checkDisclosure(channel, level);
    if (!verdict.ok) return false;
    await this.transport.send({ kind, channel, text });
    return true;
  }

  /** 재개 (FR-CHANNEL-SESSION.4·7). 참조만 읽고, 재동기화 전에는 완료를 말하지 않는다. */
  async resume(conversationId: string, resynced: boolean, evidence: readonly string[]): Promise<{
    readonly reference: ResumeReference | null;
    readonly stance: ChannelStance;
    readonly mayReportCompletion: boolean;
  }> {
    const reference = await this.registry.loadResumeReference(conversationId);
    const stance = stanceAfterReconnect(resynced && reference !== null);
    return { reference, stance, mayReportCompletion: mayReportCompletion(stance, evidence) };
  }
}
