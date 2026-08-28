// app/control/herdr-control — #502 조립 (FR-HERDR-CONTROL.1~10). 포트만 사용. 판정 규칙 0.
// 수용 판정·연속성·증거·재접속 규칙은 domain/herdr-control 의 순수 함수가 한다.
import type { HerdrConnectionPort, HerdrMutatePort, HerdrObservePort } from "../../ports/herdr-control.js";
import {
  admit,
  backoffMs,
  checkContinuity,
  hasEvidence,
  shouldRetry,
  stanceAfterReconnect,
  stripSecrets,
  type CapabilityTier,
  type EventEnvelope,
  type MutationRejection,
  type MutationRequest,
  type MutationResult,
  type PostReconnectStance,
  type ReconnectPolicy,
  type Resource,
  type Revision,
  type Snapshot,
  type SubscriptionCheck,
} from "../../domain/herdr-control.js";

export type MutationOutcome =
  | { readonly ok: true; readonly result: MutationResult; readonly deduplicated: boolean }
  | { readonly ok: false; readonly rejections: readonly MutationRejection[] };

export class HerdrControlPlane {
  private revision: Revision = { value: 0 };
  private lastEvent: Revision = { value: 0 };
  private readonly byIdempotencyKey = new Map<string, MutationResult>();
  private gaps: SubscriptionCheck[] = [];

  constructor(
    private readonly observe: HerdrObservePort,
    private readonly mutate: HerdrMutatePort,
    private readonly connection: HerdrConnectionPort,
    private readonly grantedTiers: readonly CapabilityTier[],
    private readonly reconnectPolicy: ReconnectPolicy,
  ) {}

  /** 관측. 비밀값은 전달 대상에서 뺀다 (FR-HERDR-CONTROL.10). */
  async observeNow(): Promise<Snapshot> {
    const snap = await this.observe.snapshot();
    this.revision = snap.revision;
    this.lastEvent = snap.revision;
    return { ...snap, resources: snap.resources.map(redact) };
  }

  /** 구독. 개정이 끊기면 그 사실을 남긴다 — 정상으로 가장하지 않는다 (FR-HERDR-CONTROL.2). */
  async watch(onEvent: (event: EventEnvelope, continuity: SubscriptionCheck) => void): Promise<() => void> {
    return this.observe.subscribe((event) => {
      const continuity = checkContinuity(this.lastEvent, event.revision);
      if (!continuity.ok) this.gaps.push(continuity);
      if (event.revision.value > this.lastEvent.value) this.lastEvent = event.revision;
      if (event.revision.value > this.revision.value) this.revision = event.revision;
      onEvent({ ...event, resource: redact(event.resource) }, continuity);
    });
  }

  observedGaps(): readonly SubscriptionCheck[] {
    return this.gaps;
  }

  /**
   * 변경 요청 (FR-HERDR-CONTROL.3~7).
   * 같은 멱등 키의 재전송은 프로세스를 다시 만들지 않고 최초 결과를 돌려준다.
   */
  async requestMutation(request: MutationRequest): Promise<MutationOutcome> {
    const cached = this.byIdempotencyKey.get(request.idempotencyKey);
    if (cached) return { ok: true, result: cached, deduplicated: true };

    const rejections = admit(request, { currentRevision: this.revision, grantedTiers: this.grantedTiers });
    if (rejections.length > 0) return { ok: false, rejections };

    const result = await this.mutate.apply(request);
    if (!hasEvidence(result)) {
      return { ok: false, rejections: [{ code: "unstructured-command", detail: "증거 없는 성공 응답은 수용하지 않는다" }] };
    }
    this.byIdempotencyKey.set(request.idempotencyKey, result);
    return { ok: true, result, deduplicated: false };
  }

  /**
   * 재접속 (FR-HERDR-CONTROL.9). 상한까지만 시도하고, 재동기화 전에는 아무것도 단정하지 않는다.
   * 대기는 주입된 sleep 이 맡는다 — 도메인도 이 클래스도 시계를 직접 만지지 않는다.
   */
  async reconnect(sleep: (ms: number) => Promise<void>): Promise<{ readonly stance: PostReconnectStance; readonly attempts: number }> {
    let attempt = 0;
    while (shouldRetry(attempt, this.reconnectPolicy)) {
      const snap = await this.connection.reconnect();
      if (snap) {
        this.revision = snap.revision;
        this.lastEvent = snap.revision;
        return { stance: stanceAfterReconnect(true), attempts: attempt + 1 };
      }
      await sleep(backoffMs(attempt, this.reconnectPolicy));
      attempt += 1;
    }
    return { stance: stanceAfterReconnect(false), attempts: attempt };
  }

  currentRevision(): Revision {
    return this.revision;
  }
}

function redact(resource: Resource): Resource {
  return { ...resource, attributes: stripSecrets(resource.attributes) };
}
