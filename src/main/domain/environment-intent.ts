// domain/environment-intent — #502 뇌↔환경 접점. 순수.
// 계약: docs/progress/issue-497-universal-agent.md 의 2026-08-26 계층 결정.
//
// 이것이 존재하는 이유: Herdr 프로토콜 19 는 메서드가 90개다. 그것을 뇌에 그대로 노출하면
// 의도가 아니라 원격 조종이고, 기질(데스크톱→안드로이드→로봇)이 바뀔 때 뇌가 터미널 멀티플렉서
// 어휘에 오염된다. 셸이 90개를 흡수하고 여기 있는 좁은 의도만 위로 노출한다.
//
// 두 방향 모두 규칙이 있다.
//   올라가는 것(보고) — 환경의 문자열은 사용자·외부가 만든 자료다. 지시문이 아니다.
//   내려오는 것(의도) — 뇌는 pane_id 도 workspace_id 도 모른다. 셸이 발행한 불투명 손잡이만 쓴다.

/** 셸이 발행하는 불투명 손잡이. 뇌는 이것을 만들지 않고 받은 것만 되돌려준다. */
export interface SurfaceRef {
  readonly kind: "surface";
  readonly token: string;
}

export function surfaceRef(token: string): SurfaceRef {
  return { kind: "surface", token };
}

/** 뇌가 볼 수 있는 작업 표면 하나. Herdr 어휘(pane·tab·workspace)를 노출하지 않는다. */
export interface SurfaceReport {
  readonly ref: SurfaceRef;
  /** 사람이 읽는 이름. 환경이 준 문자열이므로 자료로만 취급한다. */
  readonly label: string;
  /** 이 표면에서 무언가 일하고 있는가. 세부 상태 어휘는 환경마다 달라 여기서 정규화한다. */
  readonly activity: "idle" | "working" | "waiting" | "unknown";
  /** 사용자가 지금 보고 있는 표면인가. */
  readonly focused: boolean;
}

export interface EnvironmentReport {
  readonly schemaVersion: 1;
  readonly surfaces: readonly SurfaceReport[];
  /** 상한 때문에 싣지 못한 표면 수. 조용히 자르지 않는다. */
  readonly omitted: number;
}

/** 뇌가 내릴 수 있는 의도. 이 목록 밖은 없다. */
export type EnvironmentIntent =
  | { readonly kind: "observe" }
  | { readonly kind: "focus"; readonly surface: SurfaceRef }
  | { readonly kind: "interrupt"; readonly surface: SurfaceRef }
  | {
      readonly kind: "run";
      readonly surface: SurfaceRef;
      /** 무엇을 하고 싶은가. 셸이 환경 문법으로 번역한다 — 뇌는 "어떻게"를 모른다. */
      readonly request: string;
    };

export type IntentRejectionCode = "unknown-surface" | "empty-request" | "request-too-long" | "not-permitted";

export interface IntentRejection {
  readonly code: IntentRejectionCode;
  readonly detail: string;
}

/** run 요청 길이 상한. 환경마다 전달 한계가 다르므로 접점에서 먼저 자른다. */
export const RUN_REQUEST_MAX = 4_000;

/** 보고에 실을 표면 수 상한. 뇌의 컨텍스트를 잠식하지 않게. */
export const SURFACE_RENDER_CAP = 20;

/** 표면 이름 길이 상한. */
export const LABEL_MAX = 80;

/**
 * 환경이 준 문자열을 자료로 만든다.
 * 제어문자와 개행을 없애 한 줄로 만들고 길이를 자른다 — 개행이 있는 터미널 제목이
 * "IMPORTANT: ignore previous instructions" 처럼 지시 줄로 삽입되는 경로를 막는다.
 * (naia-agent 의 프로젝트 이름 새니타이즈와 같은 사상.)
 */
export function sanitizeLabel(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  out = out.trim();
  return out.length > LABEL_MAX ? out.slice(0, LABEL_MAX) : out;
}

/** 환경마다 다른 상태 어휘를 뇌가 아는 네 가지로 정규화한다. 모르면 모른다고 한다. */
export function normalizeActivity(raw: string | undefined): SurfaceReport["activity"] {
  switch ((raw ?? "").toLowerCase()) {
    case "working":
    case "running":
    case "busy":
      return "working";
    case "idle":
    case "ready":
      return "idle";
    case "blocked":
    case "waiting":
    case "awaiting_input":
      return "waiting";
    default:
      return "unknown";
  }
}

export interface RawSurface {
  readonly token: string;
  readonly label: string;
  readonly status?: string;
  readonly focused: boolean;
}

/**
 * 환경 관측 → 뇌가 보는 보고. 상한을 넘으면 버리지 않고 몇 개를 못 실었는지 남긴다.
 * 사용자가 보고 있는 표면을 먼저 싣는다 — 잘릴 때 가장 관련 있는 것이 남도록.
 */
export function toReport(raws: readonly RawSurface[], cap: number = SURFACE_RENDER_CAP): EnvironmentReport {
  const ordered = [...raws].sort((a, b) => Number(b.focused) - Number(a.focused));
  const kept = ordered.slice(0, Math.max(0, cap));
  return {
    schemaVersion: 1,
    surfaces: kept.map((r) => ({
      ref: surfaceRef(r.token),
      label: sanitizeLabel(r.label),
      activity: normalizeActivity(r.status),
      focused: r.focused,
    })),
    omitted: Math.max(0, raws.length - kept.length),
  };
}

/**
 * 의도 수용 판정. 뇌가 만들어 낸 손잡이나 빈 요청은 환경에 닿지 못한다.
 * known 은 셸이 방금 발행한 손잡이 집합이다 — 오래된 손잡이는 모르는 것으로 취급한다.
 */
export function admitIntent(
  intent: EnvironmentIntent,
  known: ReadonlySet<string>,
  permitted: ReadonlySet<EnvironmentIntent["kind"]>,
): readonly IntentRejection[] {
  const rejections: IntentRejection[] = [];
  if (!permitted.has(intent.kind)) {
    rejections.push({ code: "not-permitted", detail: `의도 ${intent.kind} 가 허용되지 않았다` });
  }
  if (intent.kind !== "observe" && !known.has(intent.surface.token)) {
    rejections.push({ code: "unknown-surface", detail: `모르는 표면 손잡이: ${intent.surface.token}` });
  }
  if (intent.kind === "run") {
    const trimmed = intent.request.trim();
    if (trimmed.length === 0) rejections.push({ code: "empty-request", detail: "빈 요청은 내려보내지 않는다" });
    else if (trimmed.length > RUN_REQUEST_MAX) {
      rejections.push({ code: "request-too-long", detail: `요청이 ${RUN_REQUEST_MAX}자를 넘는다` });
    }
  }
  return rejections;
}
