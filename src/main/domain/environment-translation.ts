// domain/environment-translation — #502 슬라이스 1 의 번역 (FR-ENV-SURFACE.7·8·9). 순수.
// 계약: docs/progress/issue-497-universal-agent.md 의 2026-08-26 계층 결정.
//
// 뇌가 내린 의도를 환경 호출로 바꾼다. 뇌는 이 파일의 결과를 보지 않는다.
// 두 가지를 감추지 않는다.
//   1) 전달 방식 — 어떤 표면은 구조화 인자로 받고(에이전트가 붙은 표면), 어떤 표면은 터미널 입력뿐이다.
//      후자는 인용 책임이 호출자에게 있다. Herdr 프로토콜 19 에 임의 명령의 argv 경로가 없다는 실측.
//   2) 확인 여부 — 실제 환경에서 확인하지 못한 대응은 확인했다고 말하지 않는다.
import type { EnvironmentIntent, IntentRejection } from "./environment-intent.js";

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
      // 에이전트가 붙은 표면은 에이전트 대상으로, 아니면 표면 자체로 포커스한다.
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
            ok: true,
            call: {
              method: "pane.focus",
              params: { pane_id: binding.surfaceId },
              delivery: "structured",
              verified: true,
              quotingOwnedByCaller: false,
            },
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
              method: "pane.send_text",
              params: { pane_id: binding.surfaceId, text: intent.request },
              delivery: "terminal-input",
              verified: true,
              quotingOwnedByCaller: true,
            },
          };
  }
}

/** 손잡이 발행 (FR-ENV-SURFACE.9). 환경 식별자를 손잡이로 쓰지 않는다 — 어휘가 새기 때문이다. */
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
