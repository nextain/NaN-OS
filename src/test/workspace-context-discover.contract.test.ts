// #501 발견 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.1·9.
// 진입점이 선언한 것만 읽는가, 워크스페이스 이름을 코드에 박지 않았는가,
// 자원 표면이 스키마 버전과 개정을 함께 싣는가.
import { describe, it, expect } from "vitest";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { canonicalRoot } from "../main/domain/workspace.js";
import { fakeSource, rootDeclaration, doc, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

describe("루트 발견 (FR-WORKSPACE-CONTEXT.1)", () => {
  it("진입점이 필수로 선언한 문서를 싣는다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.map((d) => d.ref.id)).toEqual(["rules"]);
    expect(out.manifest.selection.loaded[0]?.reason).toBe("mandatory");
  });

  it("선언되지 않은 문서는 실리지 않는다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: ["용어", "요구사항"] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ids = out.manifest.selection.loaded.map((d) => d.ref.id);
    expect(ids).toEqual(["rules", "terms", "reqs"]);
    expect(ids).not.toContain("선언에없는문서");
  });

  it("워크스페이스 이름이 아니라 선언이 결과를 정한다 — 다른 루트, 다른 선언, 다른 결과", async () => {
    const other = fakeSource({
      root: { ok: true, declaration: rootDeclaration({ entrypoint: "OTHER.md", documents: [doc("only", "only.json")], projects: [] }) },
    });
    const svc = new WorkspaceContextService(other, LIMITS);
    const out = await svc.discover(canonicalRoot("/전혀다른곳"), { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.root.path).toBe("/전혀다른곳");
    expect(out.manifest.selection.loaded.map((d) => d.ref.id)).toEqual(["only"]);
  });

  it("발견만으로 문서를 읽지 않는다 — 선택된 것만 나중에 읽는다", async () => {
    const src = fakeSource();
    const svc = new WorkspaceContextService(src, LIMITS);
    await svc.discover(ROOT, { topics: [] });
    expect(src.reads).toEqual([]);
  });

  it("각 문서에 어떤 선언이 요구했는지가 남는다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: ["용어"] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const d of out.manifest.selection.loaded) {
      expect(d.declaredBy).toBe("AGENTS.md");
      expect(d.scope).toEqual({ kind: "root" });
    }
  });
});

describe("자원 표면 (FR-WORKSPACE-CONTEXT.9)", () => {
  it("매니페스트는 스키마 버전과 개정을 함께 싣는다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.schemaVersion).toBe(1);
    expect(out.manifest.revision).toEqual({ value: 1 });
    expect(out.manifest.scope).toEqual({ kind: "root" });
  });

  it("discover 전에는 현재 컨텍스트가 없다 — 없는 것을 있는 척하지 않는다", () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    expect(svc.current()).toBeNull();
  });
});
