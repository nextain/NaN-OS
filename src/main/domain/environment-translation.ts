// domain/environment-translation — #502 슬라이스 1 의 번역 (FR-ENV-SURFACE.7·8·9). 순수.
// 계약: docs/progress/issue-497-universal-agent.md 의 2026-08-26 계층 결정.
//
// 뇌가 내린 의도를 환경 호출로 바꾼다. 뇌는 이 파일의 결과를 보지 않는다.
// 두 가지를 감추지 않는다.
//   1) 전달 방식 — 어떤 표면은 구조화 인자로 받고(에이전트가 붙은 표면), 어떤 표면은 터미널 입력뿐이다.
//      후자는 인용 책임이 호출자에게 있다. Herdr 프로토콜 19 에 임의 명령의 argv 경로가 없다는 실측.
//   2) 확인 여부 — 실제 환경에서 확인하지 못한 대응은 확인했다고 말하지 않는다.
import type { EnvironmentIntent, IntentRejection } from "./environment-intent.js";

// ⚠️ 이름은 셸이 실제로 부르는 CLI 하위명령을 따른다. 소켓 API 메서드 이름과 일치하지 않을 수 있다.
//    예: API 에는 `pane.focus{pane_id}` 절대 포커스가 있지만 CLI `herdr pane focus` 는 방향 이동뿐이라
//    셸에서 도달할 수 없다. 반대로 `pane run` 은 CLI 편의 명령이고 API 메서드 목록에는 없다.
//    도달 가능한 것만 낸다 — 스키마에 있다고 부를 수 있는 것이 아니다(2026-08-26 실측).

/** 손잡이 하나가 실제로 무엇을 가리키는가. 셸만 안다 — 뇌에 나가지 않는다 (FR-ENV-SURFACE.9). */
export interface SurfaceBinding {
  readonly token: string;
  /** 환경의 표면 식별자. */
  readonly surfaceId: string;
  /** 에이전트가 붙어 있으면 그 대상 식별자. 없으면 일반 터미널이다. */
  readonly agentTarget?: string;
}

export type SurfaceRegistry = ReadonlyMap<string, SurfaceBinding>;

/** 구조화 인자로 가는가, 터미널 입력으로 가는가. */
export type DeliveryKind = "structured" | "terminal-input";

export interface EnvironmentCall {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly delivery: DeliveryKind;
  /**
   * 이 대응을 실제 환경에서 확인했는가.
   * false 는 "될 것 같다"는 뜻이다 — 확인한 것처럼 보고하지 않기 위해 값으로 남긴다.
   */
  readonly verified: boolean;
  /** 인용·이스케이프 책임이 호출자에게 있는가. 터미널 입력이면 참이다. */
  readonly quotingOwnedByCaller: boolean;
}

/**
 * 환경마다 다른 표기법. 값을 지어내지 않기 위해 주입받는다.
 * Herdr 0.8.0 의 `pane send-keys` 는 `esc` 외에 키 표기법을 문서화하지 않았고,
 * 확인하려면 사용자의 살아 있는 세션에 실제 키를 보내야 해서 확인하지 않았다.
 */
export interface EnvironmentDialect {
  readonly interruptKeys: readonly string[];
  /** interruptKeys 표기법을 실제 환경에서 확인했는가. */
  readonly interruptVerified: boolean;
}

export const HERDR_0_8_DIALECT: EnvironmentDialect = {
  interruptKeys: ["C-c"],
  interruptVerified: false,
};

export type TranslationOutcome =
  | { readonly ok: true; readonly call: EnvironmentCall }
  | { readonly ok: false; readonly rejections: readonly IntentRejection[] };

function unknownSurface(token: string): TranslationOutcome {
  return { ok: false, rejections: [{ code: "unknown-surface", detail: `모르는 표면 손잡이: ${token}` }] };
}

/**
 * 의도 → 환경 호출 (FR-ENV-SURFACE.7).
 * 대응표에 없는 손잡이는 번역하지 않는다. 번역할 수 없는 조합은 지어내지 않고 거절한다.
 */
export function translate(
  intent: EnvironmentIntent,
  registry: SurfaceRegistry,
  dialect: EnvironmentDialect = HERDR_0_8_DIALECT,
): TranslationOutcome {
  if (intent.kind === "observe") {
    return {
      ok: true,
      call: { method: "session.snapshot", params: {}, delivery: "structured", verified: true, quotingOwnedByCaller: false },
    };
  }

  const binding = registry.get(intent.surface.token);
  if (!binding) return unknownSurface(intent.surface.token);

  switch (intent.kind) {
    case "focus":
      // 에이전트가 붙은 표면만 포커스할 수 있다. 일반 터미널의 절대 포커스는 CLI 에 없다
      // (`herdr pane focus` 는 --direction 필수). API 에는 있으나 셸이 닿는 경로가 아니다.
      return binding.agentTarget
        ? {
            ok: true,
            call: {
              method: "agent.focus",
              params: { target: binding.agentTarget },
              delivery: "structured",
              verified: true,
              quotingOwnedByCaller: false,
            },
          }
        : {
            ok: false,
            rejections: [
              {
                code: "not-permitted",
                detail: "에이전트가 없는 표면의 절대 포커스는 이 환경에서 도달할 수 없다 (CLI 는 방향 이동만 제공)",
              },
            ],
          };

    case "interrupt":
      return {
        ok: true,
        call: {
          method: "pane.send_keys",
          params: { pane_id: binding.surfaceId, keys: [...dialect.interruptKeys] },
          delivery: "terminal-input",
          verified: dialect.interruptVerified,
          quotingOwnedByCaller: true,
        },
      };

    case "run":
      // 에이전트가 붙은 표면은 구조화된 프롬프트를 받는다 — 인용 문제가 없다.
      // 일반 터미널은 텍스트 입력뿐이라 인용 책임이 호출자에게 남는다.
      return binding.agentTarget
        ? {
            ok: true,
            call: {
              method: "agent.prompt",
              params: { target: binding.agentTarget, text: intent.request },
              delivery: "structured",
              verified: true,
              quotingOwnedByCaller: false,
            },
          }
        : {
            ok: true,
            call: {
              // `pane run` 은 텍스트와 Enter 를 한 번에 보낸다 — 실행이라는 의도에 맞는 것은 이쪽이다.
              // send_text 만 보내면 줄이 입력만 되고 실행되지 않는다.
              method: "pane.run",
              params: { pane_id: binding.surfaceId, command: intent.request },
              delivery: "terminal-input",
              verified: true,
              quotingOwnedByCaller: true,
            },
          };
  }
}

/**
 * 손잡이 발행 (FR-ENV-SURFACE.9). 환경 식별자를 손잡이로 쓰지 않는다 — 어휘가 새기 때문이다.
 *
 * ⚠️ 순서로 발행한다. 한 스냅샷 안에서만 쓰는 일회성 대응표다.
 *    뇌가 손잡이를 본 뒤 나중에 그 손잡이로 돌아오는 경로에는 쓰면 안 된다 —
 *    그 사이 표면이 하나 사라지면 같은 손잡이가 다른 표면을 가리킨다.
 *    그 경로에는 `SurfaceRegistrar` 를 쓴다 (FR-ENV-STICKY.1~3).
 */
export function mintRegistry(
  surfaces: readonly { readonly surfaceId: string; readonly agentTarget?: string }[],
  prefix = "s",
): SurfaceRegistry {
  const map = new Map<string, SurfaceBinding>();
  surfaces.forEach((s, index) => {
    const token = `${prefix}-${index + 1}`;
    map.set(token, s.agentTarget ? { token, surfaceId: s.surfaceId, agentTarget: s.agentTarget } : { token, surfaceId: s.surfaceId });
  });
  return map;
}

/**
 * 표면에 고정되는 손잡이 발행기 (FR-ENV-STICKY.1~3).
 *
 * 왜 필요한가: 뇌가 표면 목록을 본 시점과 그중 하나에 명령을 넣는 시점 사이에 시간이 흐른다.
 * 그 사이 터미널이 닫히면, 순서로 발행하는 대응표에서는 같은 손잡이가 *다른* 표면으로
 * 옮겨 간다. 뇌는 자기가 본 그 표면이라고 믿고 명령을 넣는다 — 엉뚱한 터미널에 들어간다.
 *
 * 그래서 손잡이를 표면에 못 박는다. 표면이 살아 있는 동안 같은 값이고, 사라지면 그 손잡이는
 * 되살아나지 않는다. 재사용하지 않으므로 나중에 온 죽은 손잡이는 조용히 다른 곳을 가리키는
 * 대신 `unknown-surface` 로 거절된다.
 */
export class SurfaceRegistrar {
  /** 표면 식별자 → 손잡이. 한 번 박히면 이 발행기가 사는 동안 안 바뀐다. */
  private readonly assigned = new Map<string, string>();
  /** 발행한 손잡이 전부. 표면이 사라져도 남겨 재사용을 막는다. */
  private readonly issued = new Set<string>();
  private next = 1;

  constructor(private readonly prefix = "s") {}

  /** 이 표면의 손잡이. 처음 보는 표면이면 새로 박는다. */
  tokenFor(surfaceId: string): string {
    const existing = this.assigned.get(surfaceId);
    if (existing !== undefined) return existing;
    let token = `${this.prefix}-${this.next}`;
    // 발행기를 여러 개 쓰거나 접두어가 겹쳐도 재사용이 생기지 않게.
    while (this.issued.has(token)) {
      this.next += 1;
      token = `${this.prefix}-${this.next}`;
    }
    this.next += 1;
    this.assigned.set(surfaceId, token);
    this.issued.add(token);
    return token;
  }

  /**
   * 지금 살아 있는 표면들로 대응표를 만든다.
   * 목록에 없는 표면의 손잡이는 여기 담기지 않는다 — 그래서 무효가 된다 (FR-ENV-STICKY.2).
   */
  registryFor(
    surfaces: readonly { readonly surfaceId: string; readonly agentTarget?: string }[],
  ): SurfaceRegistry {
    const map = new Map<string, SurfaceBinding>();
    for (const s of surfaces) {
      const token = this.tokenFor(s.surfaceId);
      map.set(token, s.agentTarget ? { token, surfaceId: s.surfaceId, agentTarget: s.agentTarget } : { token, surfaceId: s.surfaceId });
    }
    return map;
  }
}
