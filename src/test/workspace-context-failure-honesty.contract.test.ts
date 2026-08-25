// #501 실패 정직성 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.7.
// 진입점 부재·형식 오류·선언된 인덱스 부재를 추측으로 메우지 않고, 고칠 수 있는 형태로 보고하는가.
import { describe, it, expect } from "vitest";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { diagnostic } from "../main/domain/workspace-context.js";
import { fakeSource, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

describe("진단 형태 (FR-WORKSPACE-CONTEXT.7)", () => {
  it.each(["entrypoint-missing", "entrypoint-malformed", "declared-index-missing", "outside-boundary"] as const)(
    "%s 진단은 대상·탐색 위치·조치를 모두 담는다",
    (code) => {
      const d = diagnostic(code, "대상.json", "/ws");
      expect(d.code).toBe(code);
      expect(d.target).toBe("대상.json");
      expect(d.searchedIn).toBe("/ws");
      expect(d.action.length).toBeGreaterThan(0);
      expect(d.action).toContain("대상.json");
    },
  );

  it("조치 문구는 코드마다 다르다 — 하나로 뭉뚱그리지 않는다", () => {
    const actions = (["entrypoint-missing", "entrypoint-malformed", "declared-index-missing", "outside-boundary"] as const).map(
      (c) => diagnostic(c, "x", "/ws").action,
    );
    expect(new Set(actions).size).toBe(4);
  });
});

describe("실패는 부분 성공으로 승격되지 않는다 (FR-WORKSPACE-CONTEXT.7)", () => {
  it("진입점이 없으면 컨텍스트를 만들지 않는다", async () => {
    const src = fakeSource({ root: { ok: false, diagnostics: [diagnostic("entrypoint-missing", "AGENTS.md", ROOT.path)] } });
    const svc = new WorkspaceContextService(src, LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-missing");
    expect(svc.current()).toBeNull();
  });

  it("진입점 형식이 깨지면 형식 오류로 보고한다", async () => {
    const src = fakeSource({ root: { ok: false, diagnostics: [diagnostic("entrypoint-malformed", "AGENTS.md", ROOT.path)] } });
    const out = await new WorkspaceContextService(src, LIMITS).discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-malformed");
  });

  it("선언된 인덱스가 실제로 없으면 그 경로를 짚어 실패한다", async () => {
    const src = fakeSource({ missingPaths: ["terminology.yaml"] });
    const svc = new WorkspaceContextService(src, LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics.map((d) => [d.code, d.target])).toEqual([["declared-index-missing", "terminology.yaml"]]);
    expect(svc.current()).toBeNull();
  });

  it("없는 인덱스가 여럿이면 전부 보고한다 — 첫 실패에서 멈추지 않는다", async () => {
    const src = fakeSource({ missingPaths: ["agents-rules.json", "requirements.yaml"] });
    const out = await new WorkspaceContextService(src, LIMITS).discover(ROOT, { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics.map((d) => d.target)).toEqual(["agents-rules.json", "requirements.yaml"]);
  });

  it("실패한 발견 뒤에는 프로젝트 진입도 할 수 없다 — 없는 컨텍스트 위에 쌓지 않는다", async () => {
    const src = fakeSource({ root: { ok: false, diagnostics: [diagnostic("entrypoint-missing", "AGENTS.md", ROOT.path)] } });
    const svc = new WorkspaceContextService(src, LIMITS);
    await svc.discover(ROOT, { topics: [] });
    await expect(svc.enterProject("alpha", { topics: [] })).rejects.toThrow(/discover 를 먼저/);
  });
});
