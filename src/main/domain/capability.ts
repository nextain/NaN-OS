// domain/capability — #497 에픽 공용 권한 등급. 계약: docs/progress/issue-497-universal-agent.md.
// 순수. 한 곳에서만 정의한다 — 권한 정의가 두 벌이면 그 자체가 드리프트의 출발점이다.
// 핵심 불변식: 낮은 등급이 높은 등급을 상속하지 않는다. 순서가 아니라 집합이다.

export type CapabilityTier =
  | "observe"
  | "workspace-write"
  | "credential"
  | "external-message"
  | "publication"
  | "purchase"
  | "destructive"
  | "production";

export const ALL_TIERS: readonly CapabilityTier[] = [
  "observe",
  "workspace-write",
  "credential",
  "external-message",
  "publication",
  "purchase",
  "destructive",
  "production",
];

/** 부여된 등급 집합이 요구 등급을 덮는가. 정확히 포함해야 한다. */
export function permits(granted: readonly CapabilityTier[], required: CapabilityTier): boolean {
  return granted.includes(required);
}

/** 건별 승인이 필요한 등급. 세션 범위 허가로 대신할 수 없다. */
export function requiresApproval(tier: CapabilityTier): boolean {
  return tier !== "observe" && tier !== "workspace-write";
}

/** 사람 결정으로 올려야 하는 등급. 작업자에게 위임하지 않는다. */
export function requiresHumanDecision(tier: CapabilityTier): boolean {
  return tier === "destructive" || tier === "production";
}
