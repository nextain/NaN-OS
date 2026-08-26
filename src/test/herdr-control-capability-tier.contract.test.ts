// #502 권한 등급 계약 테스트 (P02) — FR-HERDR-CONTROL.6.
// 낮은 등급이 높은 등급을 상속하지 않는가, 건별 승인이 필요한 등급이 승인 없이 통과하지 않는가.
import { describe, it, expect } from "vitest";
import { admit, ALL_TIERS, permits, requiresApproval, type CapabilityTier } from "../main/domain/herdr-control.js";
import { request } from "./helpers/herdr-control-fixture.js";

describe("등급 비상속 (FR-HERDR-CONTROL.6) [UC-HERDR-CONTROL-MUTATE]", () => {
  it("부여된 등급만 통과한다", () => {
    expect(permits(["observe"], "observe")).toBe(true);
    expect(permits(["observe"], "workspace-write")).toBe(false);
  });

  it("워크스페이스 편집 권한이 자격증명·외부 발신·파괴적 변경을 상속하지 않는다", () => {
    const granted: CapabilityTier[] = ["observe", "workspace-write"];
    for (const tier of ["credential", "external-message", "publication", "purchase", "destructive", "production"] as const) {
      expect(permits(granted, tier)).toBe(false);
    }
  });

  it("높은 등급을 가졌다고 낮은 등급이 따라오지 않는다 — 순서가 아니라 집합이다", () => {
    expect(permits(["destructive"], "observe")).toBe(false);
    expect(permits(["external-message"], "workspace-write")).toBe(false);
    expect(permits(["publication"], "external-message")).toBe(false);
    expect(permits(["production"], "destructive")).toBe(false);
  });

  it("모든 등급을 부여하면 전부 통과한다", () => {
    for (const tier of ALL_TIERS) expect(permits(ALL_TIERS, tier)).toBe(true);
  });
});

describe("건별 승인 (FR-HERDR-CONTROL.6)", () => {
  it.each(["credential", "external-message", "publication", "purchase", "destructive", "production"] as const)(
    "%s 는 건별 승인이 필요하다",
    (tier) => {
      expect(requiresApproval(tier)).toBe(true);
    },
  );

  it.each(["observe", "workspace-write"] as const)("%s 는 건별 승인이 필요하지 않다", (tier) => {
    expect(requiresApproval(tier)).toBe(false);
  });

  it("승인 참조가 없으면 approval-missing 으로 거절한다", () => {
    const r = admit(request({ capability: "external-message" }), { currentRevision: { value: 1 }, grantedTiers: ["external-message"] });
    expect(r.map((x) => x.code)).toEqual(["approval-missing"]);
  });

  it("승인 참조가 있으면 통과한다", () => {
    const r = admit(request({ capability: "external-message", approvalRef: "approval-1" }), {
      currentRevision: { value: 1 },
      grantedTiers: ["external-message"],
    });
    expect(r).toEqual([]);
  });

  it("등급 미부여와 승인 부재는 각각 남는다 — 하나로 뭉뚱그리지 않는다", () => {
    const r = admit(request({ capability: "destructive" }), { currentRevision: { value: 1 }, grantedTiers: ["observe"] });
    expect(r.map((x) => x.code).sort()).toEqual(["approval-missing", "capability-denied"]);
  });
});
