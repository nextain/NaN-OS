// #499 승인 행렬 계약 테스트 (P02) — FR-ENV-TOOL.8.
// 일반 편집 권한이 외부 발신·게시·구매·파괴적 명령·운영 변경을 상속하지 않는가.
import { describe, it, expect } from "vitest";
import { admitEnvOperation } from "../main/domain/env-tool.js";
import { ALL_TIERS, permits, requiresApproval, requiresHumanDecision, type CapabilityTier } from "../main/domain/capability.js";
import { envRequest } from "./helpers/env-tool-fixture.js";

const ORDINARY: CapabilityTier[] = ["observe", "workspace-write"];

describe("등급 분리 (FR-ENV-TOOL.8) [UC-ENV-TOOL-BOUNDARY-DENY]", () => {
  it("여덟 등급이 각각 따로 있다", () => {
    expect([...ALL_TIERS].sort()).toEqual([
      "credential",
      "destructive",
      "external-message",
      "observe",
      "production",
      "publication",
      "purchase",
      "workspace-write",
    ]);
  });

  it.each(["credential", "external-message", "publication", "purchase", "destructive", "production"] as const)(
    "일반 편집 권한은 %s 를 상속하지 않는다",
    (tier) => {
      expect(permits(ORDINARY, tier)).toBe(false);
      const r = admitEnvOperation(envRequest({ capability: tier }), { grantedTiers: ORDINARY });
      expect(r.map((x) => x.code)).toContain("capability-denied");
    },
  );

  it("게시와 구매와 외부 발신은 서로도 상속하지 않는다", () => {
    expect(permits(["external-message"], "publication")).toBe(false);
    expect(permits(["publication"], "purchase")).toBe(false);
    expect(permits(["purchase"], "external-message")).toBe(false);
  });
});

describe("승인 요구 (FR-ENV-TOOL.8)", () => {
  it("관측과 워크스페이스 편집만 건별 승인 없이 된다", () => {
    for (const tier of ALL_TIERS) {
      expect(requiresApproval(tier)).toBe(!ORDINARY.includes(tier));
    }
  });

  it("등급을 부여해도 승인 참조가 없으면 거절한다", () => {
    const r = admitEnvOperation(envRequest({ capability: "publication" }), { grantedTiers: ["publication"] });
    expect(r.map((x) => x.code)).toEqual(["approval-missing"]);
  });

  it("등급과 승인이 모두 있으면 통과한다", () => {
    const r = admitEnvOperation(envRequest({ capability: "publication", approvalRef: "a-1" }), { grantedTiers: ["publication"] });
    expect(r).toEqual([]);
  });

  it("등급 미부여와 승인 부재는 각각 남는다", () => {
    const r = admitEnvOperation(envRequest({ capability: "purchase" }), { grantedTiers: ORDINARY });
    expect(r.map((x) => x.code).sort()).toEqual(["approval-missing", "capability-denied"]);
  });
});

describe("사람 결정으로 올릴 것 (FR-ENV-TOOL.8)", () => {
  it("삭제와 운영 변경은 위임 대상이 아니다", () => {
    expect(requiresHumanDecision("destructive")).toBe(true);
    expect(requiresHumanDecision("production")).toBe(true);
  });

  it("나머지는 위임할 수 있다", () => {
    for (const tier of ALL_TIERS.filter((t) => t !== "destructive" && t !== "production")) {
      expect(requiresHumanDecision(tier)).toBe(false);
    }
  });
});
