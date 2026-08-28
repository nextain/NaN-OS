// #501 경계 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.8.
// 상위 경로 표기와 절대 경로가 워크스페이스 밖을 가리키지 못하는가, 거부가 명시적인가.
import { describe, it, expect } from "vitest";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { checkDeclarationBoundary, isWithinBoundary } from "../main/domain/workspace-context.js";
import { doc, fakeSource, rootDeclaration, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

describe("경로 경계 판정 (FR-WORKSPACE-CONTEXT.8) [UC-WORKSPACE-CONTEXT-BROKEN-ENTRYPOINT]", () => {
  it.each(["a.json", "dir/a.json", "./dir/a.json", "dir/sub/../a.json", "dir/./a.json"])("%s 는 경계 안이다", (p) => {
    expect(isWithinBoundary(p)).toBe(true);
  });

  it.each(["../a.json", "../../a.json", "dir/../../a.json", "/etc/passwd", "C:/Windows/x.json", "..\\a.json", ""])(
    "%s 는 경계 밖이다",
    (p) => {
      expect(isWithinBoundary(p)).toBe(false);
    },
  );

  it("내려갔다 올라오는 것은 허용하되 루트를 넘어서면 막는다", () => {
    expect(isWithinBoundary("a/b/../../c.json")).toBe(true);
    expect(isWithinBoundary("a/b/../../../c.json")).toBe(false);
  });
});

describe("선언 전체 검사 (FR-WORKSPACE-CONTEXT.8)", () => {
  it("경계 안 선언에는 진단이 없다", () => {
    expect(checkDeclarationBoundary(rootDeclaration(), "/ws")).toEqual([]);
  });

  it("경계 밖 문서마다 진단을 남긴다 — 조용한 무시가 아니다", () => {
    const decl = rootDeclaration({ documents: [doc("ok", "ok.json"), doc("bad", "../탈출.json"), doc("bad2", "/etc/passwd")] });
    const ds = checkDeclarationBoundary(decl, "/ws");
    expect(ds.map((d) => d.target)).toEqual(["../탈출.json", "/etc/passwd"]);
    expect(ds.every((d) => d.code === "outside-boundary")).toBe(true);
  });

  it("경계 밖 프로젝트 진입점도 잡는다", () => {
    const decl = rootDeclaration({ projects: [{ name: "탈출", entrypoint: "../밖/AGENTS.md", documents: [] }] });
    const ds = checkDeclarationBoundary(decl, "/ws");
    expect(ds.map((d) => d.target)).toEqual(["../밖/AGENTS.md"]);
  });
});

describe("서비스는 경계 위반 선언을 확정하지 않는다", () => {
  it("경계 밖 문서를 선언한 진입점은 발견에 실패한다", async () => {
    const src = fakeSource({
      root: { ok: true, declaration: rootDeclaration({ documents: [doc("bad", "../탈출.json")] }) },
    });
    const svc = new WorkspaceContextService(src, LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("outside-boundary");
    expect(svc.current()).toBeNull();
  });

  it("경계 검사는 존재 검사보다 먼저다 — 밖을 가리키는 경로는 열어 보지도 않는다", async () => {
    const src = fakeSource({
      root: { ok: true, declaration: rootDeclaration({ documents: [doc("bad", "../탈출.json")] }) },
      missingPaths: ["../탈출.json"],
    });
    const out = await new WorkspaceContextService(src, LIMITS).discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics.map((d) => d.code)).toEqual(["outside-boundary"]);
  });
});
