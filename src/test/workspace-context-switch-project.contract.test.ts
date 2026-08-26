// #501 프로젝트 전환 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.5.
// 이전 프로젝트의 지역 컨텍스트가 남지 않는가, 사용자가 명시한 의도는 유지되는가.
import { describe, it, expect } from "vitest";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { dropProjectScoped, projectScope, rootScope, selectDocuments } from "../main/domain/workspace-context.js";
import { doc, fakeSource, rootDeclaration, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

function twoProjects() {
  return fakeSource({
    projects: {
      alpha: {
        ok: true,
        declaration: rootDeclaration({
          entrypoint: "projects/alpha/AGENTS.md",
          documents: [doc("rules", "agents-rules.json"), doc("alpha-only", "projects/alpha/rules.json")],
        }),
      },
      beta: {
        ok: true,
        declaration: rootDeclaration({
          entrypoint: "projects/beta/AGENTS.md",
          documents: [doc("rules", "agents-rules.json"), doc("beta-only", "projects/beta/rules.json")],
        }),
      },
    },
  });
}

describe("지역 컨텍스트 폐기 (FR-WORKSPACE-CONTEXT.5) [UC-WORKSPACE-CONTEXT-SWITCH-PROJECT]", () => {
  it("프로젝트 범위 문서만 버리고 루트 범위 문서는 남긴다", () => {
    const decl = rootDeclaration({ documents: [doc("r", "r.json")] });
    const root = selectDocuments(decl, { topics: [] }, LIMITS, rootScope());
    const local = selectDocuments(decl, { topics: [] }, LIMITS, projectScope("alpha"));
    const mixed = { loaded: [...root.loaded, ...local.loaded], dropped: [], totalBytes: 200 };
    const kept = dropProjectScoped(mixed);
    expect(kept.loaded).toHaveLength(1);
    expect(kept.loaded[0]?.scope).toEqual({ kind: "root" });
    expect(kept.totalBytes).toBe(100);
  });

  it("루트만 있으면 전환해도 아무것도 잃지 않는다", () => {
    const decl = rootDeclaration({ documents: [doc("r", "r.json")] });
    const root = selectDocuments(decl, { topics: [] }, LIMITS, rootScope());
    expect(dropProjectScoped(root)).toEqual(root);
  });
});

describe("전환 후 교차 누출 (FR-WORKSPACE-CONTEXT.5)", () => {
  it("alpha 에서 beta 로 옮기면 alpha 문서가 근거에 남지 않는다", async () => {
    const svc = new WorkspaceContextService(twoProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    await svc.enterProject("alpha", { topics: [] });
    const out = await svc.switchProject("beta");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ids = out.manifest.selection.loaded.map((d) => d.ref.id);
    expect(ids).toContain("beta-only");
    expect(ids).not.toContain("alpha-only");
  });

  it("전환 후 범위와 개정이 모두 바뀐다", async () => {
    const svc = new WorkspaceContextService(twoProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const first = await svc.enterProject("alpha", { topics: [] });
    const second = await svc.switchProject("beta");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.manifest.scope).toEqual({ kind: "project", name: "beta" });
    expect(second.manifest.revision.value).toBeGreaterThan(first.manifest.revision.value);
  });

  it("사용자가 명시한 의도는 전환을 넘어 유지된다", async () => {
    const svc = new WorkspaceContextService(twoProjects(), LIMITS);
    await svc.discover(ROOT, { topics: ["용어"] });
    await svc.enterProject("alpha", { topics: ["용어"] });
    const out = await svc.switchProject("beta");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.intent).toEqual({ topics: ["용어"] });
  });
});
