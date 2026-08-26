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

/**
 * 표면 이름. 레이블이 없는 pane 이 흔하다(실측 13개 중 6개) — 그럴 때 터미널 제목으로 내려간다.
 * 전부 없으면 손잡이로 대신한다. 이름 없는 표면을 만들지 않는다.
 */
export function surfaceLabel(pane: HerdrPaneLike, fallback: string): string {
  return str(pane.label) ?? str(pane.terminal_title_stripped) ?? str(pane.terminal_title) ?? str(pane.agent) ?? fallback;
}

/** pane 하나를 원시 표면으로. 여기서 나온 값은 domain 이 새니타이즈·정규화한다. */
export function toRawSurface(pane: HerdrPaneLike): RawSurface | null {
  const token = str(pane.pane_id);
  if (!token) return null; // 식별할 수 없는 pane 은 뇌에 올리지 않는다.
  return {
    token,
    label: surfaceLabel(pane, token),
    status: str(pane.agent_status),
    focused: pane.focused === true,
  };
}

/**
 * 스냅샷 → 보고. 형태가 어긋나면 빈 보고를 내고 터지지 않는다 —
 * Herdr 가 바뀌었을 때 셸이 죽는 것보다 "지금은 아무것도 모른다"가 정직하다.
 */
export function snapshotToReport(snapshot: HerdrSnapshotLike | null | undefined, cap?: number): EnvironmentReport {
  const panes = Array.isArray(snapshot?.panes) ? (snapshot?.panes as readonly HerdrPaneLike[]) : [];
  const raws: RawSurface[] = [];
  for (const pane of panes) {
    const raw = toRawSurface(pane);
    if (raw) raws.push(raw);
  }
  return toReport(raws, cap);
}
