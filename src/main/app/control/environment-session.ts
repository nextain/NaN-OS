// app/control/environment-session — #502 실배선 조립 (FR-ENV-LIVE.1~5, FR-ENV-STICKY.1~3).
// 포트만 사용. 프로세스도 파일도 만지지 않는다 — 스냅샷 값을 받아 판정하고 명령을 낼 뿐이다.
//
// 왜 여기 있는가: 관측·번역·전달은 각각 순수하게 있었지만 그것들을 이어 주는 것이 없었다.
// 그래서 프로덕션 호출자가 0이었다(2026-08-26 실측). 이 파일이 그 이음매다.
//
// 한 세션이 사는 동안 손잡이가 고정된다. 뇌가 표면 목록을 본 시점과 그중 하나에 명령을
// 넣는 시점 사이에 터미널이 닫힐 수 있고, 그때 손잡이가 다른 표면으로 옮겨 가면 뇌는
// 자기가 본 그 표면이라고 믿고 엉뚱한 곳에 명령을 넣는다 (FR-ENV-STICKY.1).
import {
  admitIntent,
  toEnvironmentSegment,
  type EnvironmentIntent,
  type EnvironmentReport,
  type EnvironmentSurfacesSegment,
  type IntentRejection,
} from "../../domain/environment-intent.js";
import { SurfaceRegistrar, translate, type EnvironmentDialect, type SurfaceRegistry } from "../../domain/environment-translation.js";
import { observe, type HerdrSnapshotLike } from "../../adapters/herdr-environment.js";
import { EnvironmentDispatcher, type DispatchGrants, type DispatchOutcome } from "./environment-dispatch.js";
import type { EnvironmentCommandPort } from "../../ports/environment-dispatch.js";

/** 이 슬라이스가 뇌에 여는 의도 전부. */
export const PERMITTED_INTENTS: ReadonlySet<EnvironmentIntent["kind"]> = new Set([
  "observe",
  "focus",
  "interrupt",
  "run",
] as const);

/**
 * 지켜보기가 저절로 풀리기까지의 대화 턴 수 (FR-ENV-ATTENTION.7).
 *
 * 왜 상한이 있는가: 나이아가 다 본 뒤 unwatch 를 부르리라고 기대하는 것으로는 비용도
 * 노출도 보장되지 않는다. 모델이 안 부르면 세션 내내 목록이 실린다 — 사용자가 지적한
 * 바로 그 상태로 되돌아간다. 그래서 켜는 것은 나이아가 정하되, 켜 둔 채 잊는 것은
 * 구조가 막는다. 더 봐야 하면 다시 부르면 된다.
 */
export const WATCH_TURN_BUDGET = 8;

export type ActOutcome =
  | { readonly ok: false; readonly rejections: readonly IntentRejection[] }
  | DispatchOutcome;

/**
 * 사용자가 정하는 환경 인지 수준 (FR-ENV-ATTENTION.4).
 *   off    — 아무것도 싣지 않는다. 도구도 등록하지 않는다.
 *   auto   — 기본값. 평소에는 개수만 알리고, 나이아가 지켜보기로 하면 그때 목록을 싣는다.
 *   always — 늘 목록을 싣는다.
 */
export type EnvironmentAwareness = "off" | "auto" | "always";

/**
 * 한 셸 세션의 환경 접점. 손잡이 발행기와 마지막 관측을 든다.
 * 셸이 I/O(스냅샷 가져오기·명령 보내기)를 소유하고, 이 객체는 판정만 한다.
 */
export class EnvironmentSession {
  private readonly registrar = new SurfaceRegistrar();
  private report: EnvironmentReport | null = null;
  private known: ReadonlySet<string> = new Set();
  private registry: SurfaceRegistry = new Map();
  /**
   * 나이아가 지금 표면을 지켜보고 있는가 (FR-ENV-ATTENTION.1).
   * 세션 안에서만 산다 — 손잡이와 같다. 앱을 다시 켜면 안 지켜보는 상태로 시작한다.
   */
  private watched = false;
  /** 지켜보기가 남은 턴 수. 0 이면 다음 턴에 저절로 풀린다 (FR-ENV-ATTENTION.7). */
  private watchTurnsLeft = 0;
  /**
   * 지금 켜져 있는 지켜보기를 누가 켰는가 (FR-ENV-ATTENTION.13).
   *
   * 왜 필요한가: 통화가 끝날 때 "통화가 켠 것만" 끄려면 누가 켰는지 알아야 한다.
   * 통화 시작 시점의 참/거짓만으로는 알 수 없다 — 통화 중에 텍스트나 능동 발화가 켠 것도
   * 그 통화가 끄게 되고, 늦게 도착한 옛 세션의 종료가 새 세션이 켠 것을 지운다
   * (2026-08-27 12차 적대리뷰 지적).
   */
  private watchOwner: string | undefined;

  constructor(private readonly cap?: number) {}

  /** 나이아가 표면을 계속 보겠다고 정한다. 다음 요청부터 목록이 실린다 (FR-ENV-ATTENTION.1). */
  watch(owner?: string): void {
    this.watched = true;
    this.watchTurnsLeft = WATCH_TURN_BUDGET;
    this.watchOwner = owner;
  }

  /** 나이아가 그만 보겠다고 정한다. 다음 요청부터 개수만 실린다 (FR-ENV-ATTENTION.2). */
  unwatch(): void {
    this.watched = false;
    this.watchTurnsLeft = 0;
    this.watchOwner = undefined;
  }

  /**
   * 이 주인이 켠 지켜보기만 끈다 (FR-ENV-ATTENTION.13).
   * 다른 주인이 켠 것이거나 이미 꺼져 있으면 아무것도 하지 않는다.
   */
  unwatchIfOwner(owner: string): void {
    if (!this.watched || this.watchOwner !== owner) return;
    this.unwatch();
  }

  /** 지금 지켜보기를 켠 주인. 아무도 안 켰으면 undefined. 관측용이다. */
  watchedBy(): string | undefined {
    return this.watched ? this.watchOwner : undefined;
  }

  /**
   * 대화 턴 하나가 지나갔다고 알린다. 셸이 요청을 조립하기 직전에 한 번 부른다.
   * 예산을 다 쓰면 지켜보기가 저절로 풀린다 (FR-ENV-ATTENTION.7).
   */
  noteTurn(): void {
    if (!this.watched) return;
    if (this.watchTurnsLeft <= 0) {
      this.unwatch();
      return;
    }
    this.watchTurnsLeft -= 1;
  }

  /** 지켜보기가 몇 턴 남았는지. 관측용 — 판정에는 쓰지 않는다. */
  watchTurnsRemaining(): number {
    return this.watched ? this.watchTurnsLeft : 0;
  }

  /** 지금 지켜보고 있는지. */
  watching(): boolean {
    return this.watched;
  }

  /**
   * 스냅샷을 받아 관측을 갱신한다. 형태가 어긋나면 빈 관측이 되고 터지지 않는다.
   * 살아 있는 표면만 대응표에 오르므로, 사라진 표면의 손잡이는 여기서 무효가 된다 (FR-ENV-STICKY.2).
   */
  observeSnapshot(snapshot: HerdrSnapshotLike | null | undefined): EnvironmentReport {
    const observation = observe(snapshot, this.cap, this.registrar);
    this.report = observation.report;
    this.registry = observation.registry;
    this.known = new Set(observation.report.surfaces.map((s) => s.ref.token));
    return observation.report;
  }

  /**
   * 환경을 더 이상 관측할 수 없다 (FR-ENV-ATTENTION.6).
   *
   * 왜 필요한가: 한 번 성공한 뒤 Herdr 이 죽으면 갱신은 실패만 하고 마지막 보고서는
   * 남는다. 그러면 이미 닫힌 터미널의 이름과 손잡이가 계속 뇌로 간다 — "지금 상태"라는
   * 말이 거짓이 되고, 죽은 손잡이가 살아 있는 것처럼 보인다.
   * 모르는 상태로 되돌리는 것이 마지막으로 본 것을 계속 보여 주는 것보다 정직하다.
   */
  markUnavailable(): void {
    this.report = null;
    this.known = new Set();
    this.registry = new Map();
  }

  /** 마지막 관측. 아직 한 번도 관측하지 않았으면 null. */
  latestReport(): EnvironmentReport | null {
    return this.report;
  }

  /**
   * 대화 요청에 실을 세그먼트 (FR-ENV-LIVE.1·2, FR-ENV-ATTENTION.1~4).
   *
   * 표면이 하나도 없으면 만들지 않는다 — 빈 목록을 올려 "아무것도 없다"고 단언하지 않는다.
   *
   * 지켜보지 않는 동안에는 개수만 싣는다. 목록 전체를 늘 싣는 것은 두 가지 값을 치른다:
   * 요청마다 토큰이 붙고, 터미널 이름이 늘 뇌로 간다. 개수만으로도 나이아는 볼 것이
   * 있다는 사실을 알고 스스로 지켜보기로 정할 수 있다 (FR-ENV-ATTENTION.3).
   *
   * 개수만 싣는 형태는 wire 를 바꾸지 않는다 — `omitted` 는 이미 "실지 못한 개수"를 뜻하고,
   * 뇌 쪽 렌더러가 그 값만으로 "…and N more not shown" 을 만든다. 표면이 없다고
   * 단언하는 것이 아니라 "있는데 안 실었다"고 말하는 것이라 거짓이 되지 않는다.
   */
  segment(awareness: EnvironmentAwareness = "auto"): EnvironmentSurfacesSegment | null {
    if (awareness === "off") return null;
    if (this.report === null || this.report.surfaces.length === 0) return null;
    if (awareness === "always" || this.watched) return toEnvironmentSegment(this.report);
    return {
      kind: "environmentSurfaces",
      surfaces: [],
      omitted: this.report.surfaces.length + this.report.omitted,
      // 상한에 잘린 것이 아니라 일부러 안 보낸 것이다 (FR-ENV-ATTENTION.8).
      listWithheld: true,
    };
  }

  /**
   * 의도 하나를 실제로 내려보낸다 (FR-ENV-LIVE.3·5).
   * 수용 판정 → 번역 → 전달. 어느 단계에서 걸리든 사유를 그대로 올린다.
   */
  async act(
    intent: EnvironmentIntent,
    commands: EnvironmentCommandPort,
    grants: DispatchGrants,
    dialect?: EnvironmentDialect,
  ): Promise<ActOutcome> {
    const rejections = admitIntent(intent, this.known, PERMITTED_INTENTS);
    if (rejections.length > 0) return { ok: false, rejections };

    const translated = translate(intent, this.registry, dialect);
    if (!translated.ok) return { ok: false, rejections: translated.rejections };

    return new EnvironmentDispatcher(commands, grants).dispatch(translated.call);
  }
}
