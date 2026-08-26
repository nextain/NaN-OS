// adapters/herdr-environment — #502 첫 세로 슬라이스. Herdr 스냅샷 → 뇌가 보는 환경 보고.
// 계약: docs/progress/issue-497-universal-agent.md 의 2026-08-26 계층 결정.
//
// 이 파일이 Herdr 어휘를 아는 마지막 지점이다. 여기서부터 위로는 SurfaceRef 와 네 가지 활동 상태뿐이다.
// 브라우저 안전 — 프로세스도 파일도 만지지 않는다. 스냅샷 값을 받아 변환만 한다.
//
// 무엇을 표면으로 볼 것인가: pane 이다. 작업이 실제로 벌어지는 곳이고, 실측(2026-08-26)에서
// pane 13개 중 7개가 에이전트를 달고 있었다. workspace 나 tab 은 묶음이라 "무엇이 돌고 있나"에
// 답하지 못한다.
import { toReport, type EnvironmentReport, type RawSurface } from "../domain/environment-intent.js";
import { mintRegistry, SurfaceRegistrar, type SurfaceBinding, type SurfaceRegistry } from "../domain/environment-translation.js";

/** Herdr 스냅샷에서 이 슬라이스가 실제로 쓰는 필드만. 나머지는 보지 않는다. */
export interface HerdrPaneLike {
  readonly pane_id?: unknown;
  readonly label?: unknown;
  readonly terminal_title_stripped?: unknown;
  readonly terminal_title?: unknown;
  readonly agent?: unknown;
  readonly agent_status?: unknown;
  readonly focused?: unknown;
}

export interface HerdrSnapshotLike {
  readonly panes?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

/** 이름을 하나도 못 찾았을 때 뇌에 보일 말. 환경 식별자를 쓰지 않는다. */
export const UNNAMED_SURFACE_LABEL = "이름없는 표면";

/**
 * 표면 이름. 레이블이 없는 pane 이 흔하다(실측 13개 중 6개) — 그럴 때 터미널 제목으로 내려간다.
 * 전부 없으면 이름 없는 표면이라고 말한다.
 *
 * ⚠️ 여기에 pane 식별자를 넘기면 안 된다. 예전에는 `surfaceLabel(pane, surfaceId)` 로 불렀고,
 *    이름이 하나도 없는 pane 이 자기 pane 식별자를 그대로 뇌에 올렸다 — 손잡이를 불투명하게
 *    만들어 둔 이유가 이름 자리로 새어 나가 무너졌다(2026-08-26 살아 있는 Herdr 에서 발견).
 */
export function surfaceLabel(pane: HerdrPaneLike, fallback: string): string {
  return str(pane.label) ?? str(pane.terminal_title_stripped) ?? str(pane.terminal_title) ?? str(pane.agent) ?? fallback;
}

/** 셸만 보는 중간값 — 환경 식별자와 뇌에 보일 표시를 함께 든다. */
export interface PaneBinding {
  readonly surfaceId: string;
  readonly agentTarget?: string;
  readonly label: string;
  readonly status?: string;
  readonly focused: boolean;
}

/**
 * pane 하나를 셸 내부 결속으로. 손잡이는 여기서 만들지 않는다 —
 * 환경 식별자를 손잡이로 쓰면 뇌에 pane 어휘가 그대로 샌다(FR-ENV-SURFACE.1·9).
 */
export function toBinding(pane: HerdrPaneLike): PaneBinding | null {
  const surfaceId = str(pane.pane_id);
  if (!surfaceId) return null; // 식별할 수 없는 pane 은 뇌에 올리지 않는다.
  const agent = str(pane.agent);
  const base = {
    surfaceId,
    label: surfaceLabel(pane, UNNAMED_SURFACE_LABEL),
    status: str(pane.agent_status),
    focused: pane.focused === true,
  };
  // Herdr 의 agent.focus·agent.prompt 는 pane 식별자를 대상으로 받는다(셸의 herdr_focus_agent 와 동형).
  return agent ? { ...base, agentTarget: surfaceId } : base;
}

export interface EnvironmentObservation {
  readonly report: EnvironmentReport;
  /** 손잡이 → 환경 식별자. 셸이 보관하고 뇌에 노출하지 않는다. */
  readonly registry: SurfaceRegistry;
}

/**
 * 스냅샷 → 보고 + 대응표. 형태가 어긋나면 빈 관측을 내고 터지지 않는다 —
 * Herdr 가 바뀌었을 때 셸이 죽는 것보다 "지금은 아무것도 모른다"가 정직하다.
 *
 * 보고에 실린 표면만 대응표에 오른다. 상한 때문에 잘린 표면의 손잡이는 발행되지 않는다 —
 * 뇌가 보지 못한 표면을 가리킬 수 있으면 안 된다.
 */
export function observe(
  snapshot: HerdrSnapshotLike | null | undefined,
  cap?: number,
  /**
   * 손잡이 발행기. 주면 손잡이가 표면에 고정된다 (FR-ENV-STICKY.1~3) —
   * 뇌가 나중에 그 손잡이로 돌아오는 경로에는 반드시 준다.
   * 안 주면 이 스냅샷 한정 순서 발행이다(관측만 하고 끝나는 호출).
   */
  registrar?: SurfaceRegistrar,
): EnvironmentObservation {
  const panes = Array.isArray(snapshot?.panes) ? (snapshot?.panes as readonly HerdrPaneLike[]) : [];
  const bindings: PaneBinding[] = [];
  for (const pane of panes) {
    const binding = toBinding(pane);
    if (binding) bindings.push(binding);
  }
  // 사용자가 보고 있는 표면이 먼저 오도록 domain 과 같은 순서로 맞춘 뒤 손잡이를 발행한다.
  const ordered = [...bindings].sort((a, b) => Number(b.focused) - Number(a.focused));
  const registry = registrar ? registrar.registryFor(ordered) : mintRegistry(ordered);
  // 표시 순서는 위 정렬이 정하고, 손잡이는 대응표가 정한다 —
  // 고정 발행기에서는 손잡이가 순서와 무관하기 때문이다 (FR-ENV-STICKY.3).
  const tokenOf = new Map<string, string>();
  for (const [token, binding] of registry) tokenOf.set(binding.surfaceId, token);
  const raws: RawSurface[] = [];
  for (const binding of ordered) {
    const token = tokenOf.get(binding.surfaceId);
    if (token === undefined) continue;
    raws.push({ token, label: binding.label, status: binding.status, focused: binding.focused });
  }
  const report = toReport(raws, cap);
  const visible = new Set(report.surfaces.map((s) => s.ref.token));
  const trimmed = new Map<string, SurfaceBinding>();
  for (const [token, binding] of registry) if (visible.has(token)) trimmed.set(token, binding);
  return { report, registry: trimmed };
}
