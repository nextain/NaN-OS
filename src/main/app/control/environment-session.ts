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

export type ActOutcome =
  | { readonly ok: false; readonly rejections: readonly IntentRejection[] }
  | DispatchOutcome;

/**
 * 한 셸 세션의 환경 접점. 손잡이 발행기와 마지막 관측을 든다.
 * 셸이 I/O(스냅샷 가져오기·명령 보내기)를 소유하고, 이 객체는 판정만 한다.
 */
export class EnvironmentSession {
  private readonly registrar = new SurfaceRegistrar();
  private report: EnvironmentReport | null = null;
  private known: ReadonlySet<string> = new Set();
  private registry: SurfaceRegistry = new Map();

  constructor(private readonly cap?: number) {}

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

  /** 마지막 관측. 아직 한 번도 관측하지 않았으면 null. */
  latestReport(): EnvironmentReport | null {
    return this.report;
  }

  /**
   * 대화 요청에 실을 세그먼트 (FR-ENV-LIVE.1·2).
   * 표면이 하나도 없으면 만들지 않는다 — 빈 목록을 올려 "아무것도 없다"고 단언하지 않는다.
   */
  segment(): EnvironmentSurfacesSegment | null {
    if (this.report === null || this.report.surfaces.length === 0) return null;
    return toEnvironmentSegment(this.report);
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
