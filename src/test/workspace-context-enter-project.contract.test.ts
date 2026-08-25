// #501 프로젝트 진입 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.3·4.
// 프로젝트 선언이 루트를 이기는가, 그리고 문서를 읽었다는 사실이 권한이 되지 않는가.
import { describe, it, expect } from "vitest";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { mergeProjectDeclaration, resolveWriteScope } from "../main/domain/workspace-context.js";
import { doc, fakeSource, rootDeclaration, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };
const DECL = rootDeclaration();

function withProjects() {
  return fakeSource({
    projects: {
      alpha: {
        ok: true,
        declaration: rootDeclaration({
          entrypoint: "projects/alpha/AGENTS.md",
          documents: [doc("rules", "agents-rules.json"), doc("alpha-rules", "projects/alpha/rules.json")],
        }),
      },
      beta: {
        ok: true,
        declaration: rootDeclaration({
          entrypoint: "projects/beta/AGENTS.md",
          documents: [doc("rules", "agents-rules.json"), doc("beta-terms", "projects/beta/terminology.yaml", ["용어"])],
        }),
      },
    },
  });
}

describe("프로젝트 선언 병합 (FR-WORKSPACE-CONTEXT.3)", () => {
  it("같은 주제를 다루면 프로젝트 문서가 루트 문서를 대신한다", () => {
    const project = DECL.projects.find((p) => p.name === "beta");
    expect(project).toBeDefined();
    const merged = mergeProjectDeclaration(DECL, project!);
    const ids = merged.documents.map((d) => d.id);
    expect(ids).toContain("beta-terms");
    expect(ids).not.toContain("terms");
  });

  it("루트의 필수 문서는 남는다 — 프로젝트가 루트를 지우지 않는다", () => {
    const project = DECL.projects.find((p) => p.name === "beta");
    const merged = mergeProjectDeclaration(DECL, project!);
    expect(merged.documents.map((d) => d.id)).toContain("rules");
  });

  it("겹치지 않는 프로젝트 문서는 그냥 더해진다", () => {
    const project = DECL.projects.find((p) => p.name === "alpha");
    const merged = mergeProjectDeclaration(DECL, project!);
    expect(merged.documents.map((d) => d.id)).toEqual(["rules", "terms", "reqs", "alpha-rules"]);
  });

  it("양쪽이 같은 경로를 선언하면 하나만 남는다 — 같은 파일이 예산을 두 번 쓰지 않는다", () => {
    const project = { name: "gamma", entrypoint: "projects/gamma/AGENTS.md", documents: [doc("rules-dup", "agents-rules.json")] };
    const merged = mergeProjectDeclaration(DECL, project);
    expect(merged.documents.filter((d) => d.path === "agents-rules.json")).toHaveLength(1);
  });

  it("같은 경로가 겹치면 프로젝트가 선언한 쪽이 남는다", () => {
    const project = { name: "gamma", entrypoint: "projects/gamma/AGENTS.md", documents: [doc("rules-dup", "agents-rules.json")] };
    const merged = mergeProjectDeclaration(DECL, project);
    expect(merged.documents.find((d) => d.path === "agents-rules.json")?.id).toBe("rules-dup");
  });

  it("루트가 선언한 문서의 근거는 병합 뒤에도 루트 진입점이다", () => {
    const project = DECL.projects.find((p) => p.name === "alpha");
    const merged = mergeProjectDeclaration(DECL, project!);
    expect(merged.documents.find((d) => d.path === "agents-rules.json")?.declaredBy).toBe("AGENTS.md");
    expect(merged.documents.find((d) => d.path === "projects/alpha/rules.json")?.declaredBy).toBe("projects/alpha/AGENTS.md");
  });

  it("병합 결과의 진입점은 프로젝트 진입점이다", () => {
    const project = DECL.projects.find((p) => p.name === "alpha");
    expect(mergeProjectDeclaration(DECL, project!).entrypoint).toBe("projects/alpha/AGENTS.md");
  });
});

describe("진입은 컨텍스트 전환이다 (FR-WORKSPACE-CONTEXT.3)", () => {
  it("진입하면 범위가 프로젝트로 바뀌고 개정이 올라간다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.scope).toEqual({ kind: "project", name: "alpha" });
    expect(out.manifest.revision.value).toBe(2);
  });

  it("진입 결과에 프로젝트 전용 문서가 들어간다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.map((d) => d.ref.id)).toContain("alpha-rules");
  });

  it("진입 후 근거 목록이 어느 진입점의 선언인지 정확히 가리킨다", async () => {
    // 루트만 선언한 문서와 프로젝트만 선언한 문서를 함께 둔다.
    const src = fakeSource({
      root: { ok: true, declaration: rootDeclaration({ documents: [doc("root-only", "root-only.json")] }) },
      projects: {
        alpha: {
          ok: true,
          declaration: rootDeclaration({
            entrypoint: "projects/alpha/AGENTS.md",
            documents: [doc("alpha-rules", "projects/alpha/rules.json")],
          }),
        },
      },
    });
    const svc = new WorkspaceContextService(src, LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const byPath = new Map(out.manifest.selection.loaded.map((d) => [d.ref.path, d.declaredBy]));
    expect(byPath.get("root-only.json")).toBe("AGENTS.md");
    expect(byPath.get("projects/alpha/rules.json")).toBe("projects/alpha/AGENTS.md");
  });

  it("프로젝트가 루트와 같은 경로를 다시 선언하면 근거는 프로젝트가 된다 — 실제로 그쪽이 선언했다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const entry = out.manifest.selection.loaded.find((d) => d.ref.path === "agents-rules.json");
    expect(entry?.declaredBy).toBe("projects/alpha/AGENTS.md");
  });

  it("진입 후 같은 경로가 두 번 실리지 않는다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const paths = out.manifest.selection.loaded.map((d) => d.ref.path);
    expect(paths).toEqual([...new Set(paths)]);
  });

  it("존재하지 않는 프로젝트는 진단으로 실패한다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("없는프로젝트", { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-missing");
  });
});

describe("컨텍스트는 권한이 아니다 (FR-WORKSPACE-CONTEXT.4)", () => {
  it("문서를 아무리 많이 읽어도 쓰기 범위는 명시된 것뿐이다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: ["용어", "요구사항"] });
    const out = await svc.enterProject("alpha", { topics: ["용어", "요구사항"] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.length).toBeGreaterThan(1);
    expect(resolveWriteScope(out.manifest, ["projects/alpha"])).toEqual(["projects/alpha"]);
  });

  it("부여된 것이 없으면 쓰기 범위는 비어 있다 — 읽은 경로가 권한으로 승격되지 않는다", async () => {
    const svc = new WorkspaceContextService(withProjects(), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(resolveWriteScope(out.manifest, [])).toEqual([]);
  });

  it("형제 프로젝트 문서가 실려 있어도 그 경로는 쓰기 범위에 들어오지 않는다", async () => {
    const src = fakeSource({
      projects: {
        alpha: {
          ok: true,
          declaration: rootDeclaration({
            entrypoint: "projects/alpha/AGENTS.md",
            documents: [doc("rules", "agents-rules.json"), doc("beta-leak", "projects/beta/rules.json")],
          }),
        },
      },
    });
    const svc = new WorkspaceContextService(src, LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const out = await svc.enterProject("alpha", { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(resolveWriteScope(out.manifest, ["projects/alpha"])).toEqual(["projects/alpha"]);
  });
});
