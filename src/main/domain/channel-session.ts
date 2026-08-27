// domain/channel-session — #503 채널 중립 세션의 순수 규칙 (FR-CHANNEL-SESSION.1~7).
// 계약: docs/progress/issue-497-universal-agent.md. 기존 UC10·UC10a 를 확장한다.
// 순수. 전송도 저장소도 여기 없다 — 전부 ports/channel-session.ts 뒤.
// 핵심 불변식: 채널은 어댑터이지 실행 소유자가 아니다. 같은 이슈에 L3 정체성 하나, 실행 소유자 하나.

export type ChannelKind = "desktop" | "voice" | "discord";

/** 채널과 무관한 식별자 묶음 (FR-CHANNEL-SESSION.1). */
export interface SessionIdentity {
  readonly conversationId: string;
  readonly taskId: string;
  readonly issue: string;
  readonly spaceId: string;
}

export type IdentityRejection = "issue-has-other-conversation" | "issue-has-other-space";

/** 같은 이슈에 대화 정체성 하나, 실행 소유자 하나 (FR-CHANNEL-SESSION.1). */
export function checkIdentity(existing: readonly SessionIdentity[], candidate: SessionIdentity): readonly IdentityRejection[] {
  const rejections: IdentityRejection[] = [];
  for (const e of existing) {
    if (e.issue !== candidate.issue) continue;
    if (e.conversationId !== candidate.conversationId) rejections.push("issue-has-other-conversation");
    if (e.spaceId !== candidate.spaceId) rejections.push("issue-has-other-space");
  }
  return [...new Set(rejections)];
}

/** 채널이 실어 오는 메시지. deliveryId 는 채널이 붙인 전달 식별자다. */
export interface InboundMessage {
  readonly deliveryId: string;
  readonly channel: ChannelKind;
  readonly conversationId: string;
  /** 채널이 매기는 순번. 없으면 순서 판단을 하지 않는다. */
  readonly sequence: number;
  readonly text: string;
}

export type DeliveryVerdict =
  | { readonly kind: "accept" }
  | { readonly kind: "duplicate"; readonly firstSeenSequence: number }
  | { readonly kind: "out-of-order"; readonly latestSequence: number };

export interface DeliveryLedger {
  readonly seen: ReadonlyMap<string, number>;
  readonly latestSequence: number;
}

export function emptyLedger(): DeliveryLedger {
  return { seen: new Map(), latestSequence: 0 };
}

/**
 * 전달 판정 (FR-CHANNEL-SESSION.6).
 * 같은 전달이 다시 오면 중복이고, 이미 지난 순번이면 순서가 뒤바뀐 것이다.
 * 둘 다 상태를 바꾸지 않는다 — 이슈도 작업자도 다시 만들지 않는다.
 */
export function judgeDelivery(ledger: DeliveryLedger, message: InboundMessage): DeliveryVerdict {
  const first = ledger.seen.get(message.deliveryId);
  if (first !== undefined) return { kind: "duplicate", firstSeenSequence: first };
  if (message.sequence <= ledger.latestSequence) return { kind: "out-of-order", latestSequence: ledger.latestSequence };
  return { kind: "accept" };
}

export function recordDelivery(ledger: DeliveryLedger, message: InboundMessage): DeliveryLedger {
  const seen = new Map(ledger.seen);
  seen.set(message.deliveryId, message.sequence);
  return { seen, latestSequence: Math.max(ledger.latestSequence, message.sequence) };
}

/** 내보내는 것의 종류 (FR-CHANNEL-SESSION.3). 대화 응답과 진행 알림을 섞지 않는다. */
export type OutboundKind = "reply" | "progress";

export interface OutboundMessage {
  readonly kind: OutboundKind;
  readonly channel: ChannelKind;
  readonly text: string;
}

/** 공개 범위 (FR-CHANNEL-SESSION.5). 좁은 곳의 이야기가 넓은 곳으로 새지 않는다. */
export type Confidentiality = "workspace-internal" | "team" | "public";

const CHANNEL_REACH: Readonly<Record<ChannelKind, Confidentiality>> = {
  desktop: "workspace-internal",
  voice: "workspace-internal",
  discord: "team",
};

const ORDER: readonly Confidentiality[] = ["public", "team", "workspace-internal"];

/** 채널이 그 등급의 내용을 실어 나를 수 있는가. 더 좁은 등급은 더 넓은 채널로 나가지 못한다. */
export function mayDisclose(channel: ChannelKind, level: Confidentiality): boolean {
  return ORDER.indexOf(level) <= ORDER.indexOf(CHANNEL_REACH[channel]);
}

export type DisclosureVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function checkDisclosure(channel: ChannelKind, level: Confidentiality): DisclosureVerdict {
  return mayDisclose(channel, level)
    ? { ok: true }
    : { ok: false, reason: `${level} 내용은 ${channel} 채널로 내보내지 않는다` };
}

/**
 * 재개 참조 (FR-CHANNEL-SESSION.4).
 * 작업자 실행 상태를 복사해 두지 않는다 — 정본은 Herdr 에 있고 여기에는 가리키는 것만 둔다.
 */
export interface ResumeReference {
  readonly issue: string;
  readonly spaceId: string;
  readonly conversationId: string;
}

export function resumeReferenceOf(identity: SessionIdentity): ResumeReference {
  return { issue: identity.issue, spaceId: identity.spaceId, conversationId: identity.conversationId };
}

/** 재연결 이후 태도 (FR-CHANNEL-SESSION.7). 증거 없이 멈췄다거나 끝났다고 말하지 않는다. */
export type ChannelStance = "resynced" | "unknown-until-resynced";

export function stanceAfterReconnect(resynced: boolean): ChannelStance {
  return resynced ? "resynced" : "unknown-until-resynced";
}

export function mayReportCompletion(stance: ChannelStance, evidence: readonly string[]): boolean {
  return stance === "resynced" && evidence.length > 0;
}
