// #501 관측 포트 어댑터 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.1·6·7·8.
// 셸 경로에는 node:fs 가 없다. 파일 접근을 F2 관측 포트로 재사용해도 계약이 그대로인가,
// 그리고 크기 기반 지문의 한계가 무엇인가를 고정한다.
import { describe, it, expect } from "vitest";
import { ObservePortWorkspaceContextAdapter } from "../main/adapters/workspace-context-observe.js";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { canonicalRoot } from "../main/domain/workspace.js";
import type { EnvironmentObservePort, ObservedState, PermissionDenied, ReadResult, DirEntryInfo, Unsubscribe } from "../main/ports/f2.js";

const ROOT = canonicalRoot("/ws");
const LIMITS = { maxDocuments: 20, maxBytes: 100_000 };

function env(files: Record<string, string>, denied: readonly string[] = []): EnvironmentObservePort & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async listDir(): Promise<ReadResult<readonly DirEntryInfo[]>> {
      return [];
    },
    async readFile(path: string): Promise<ReadResult<string>> {
      reads.push(path);
      if (denied.includes(path)) return { denied: true, path };
      const body = files[path];
      return body === undefined ? { failed: true, path, reason: "없음" } : body;
    },
    async fileStatus(path: string): Promise<ObservedState | PermissionDenied> {
      if (denied.includes(path)) return { denied: true, path };
      const body = files[path];
      return { key: path, value: body === undefined ? null : String(body.length) };
    },
    async sessions() {
      return [];
    },
    async processStatus() {
      return [];
    },
    async worktrees() {
      return [];
    },
    subscribeChanges(): Unsubscribe {
      return () => {};
    },
  } as EnvironmentObservePort & { readonly reads: string[] };
}

const ENTRYPOINT = "## Mandatory Reads\n- `rules.json`\n## Projects\n- `projects/alpha/AGENTS.md`\n";
const FILES = {
  "/ws/AGENTS.md": ENTRYPOINT,
  "/ws/rules.json": "{}\n",
  "/ws/projects/alpha/AGENTS.md": "## Mandatory Reads\n- `projects/alpha/local.json`\n",
  "/ws/projects/alpha/local.json": "{}\n",
};

describe("관측 포트 재사용 (FR-WORKSPACE-CONTEXT.1)", () => {
  it("루트 진입점을 읽어 선언을 만든다", async () => {
    const out = await new ObservePortWorkspaceContextAdapter(env(FILES)).readRootDeclaration(ROOT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.declaration.documents.map((d) => d.path)).toEqual(["rules.json"]);
    expect(out.declaration.projects.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("경로는 루트 아래로만 합성된다", async () => {
    const e = env(FILES);
    await new ObservePortWorkspaceContextAdapter(e).readRootDeclaration(ROOT);
    expect(e.reads).toEqual(["/ws/AGENTS.md"]);
  });

  it("서비스가 이 어댑터로도 컨텍스트를 확정한다", async () => {
    const svc = new WorkspaceContextService(new ObservePortWorkspaceContextAdapter(env(FILES)), LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.map((d) => d.ref.path)).toEqual(["rules.json"]);
  });

  it("중첩 프로젝트 진입도 같은 계약으로 동작한다", async () => {
    const svc = new WorkspaceContextService(new ObservePortWorkspaceContextAdapter(env(FILES)), LIMITS);
    await svc.discover(ROOT, { topics: [] });
    const entered = await svc.enterProject("alpha", { topics: [] });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    expect(entered.manifest.selection.loaded.map((d) => d.ref.path)).toContain("projects/alpha/local.json");
  });
});

describe("실패와 경계 (FR-WORKSPACE-CONTEXT.7·8)", () => {
  it("진입점이 없으면 entrypoint-missing", async () => {
    const out = await new ObservePortWorkspaceContextAdapter(env({})).readRootDeclaration(ROOT);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-missing");
  });

  it("권한 거부도 정직하게 실패로 돌린다 — 빈 컨텍스트로 위장하지 않는다", async () => {
    const out = await new ObservePortWorkspaceContextAdapter(env(FILES, ["/ws/AGENTS.md"])).readRootDeclaration(ROOT);
    expect(out.ok).toBe(false);
  });

  it("선언이 없는 진입점은 entrypoint-malformed", async () => {
    const out = await new ObservePortWorkspaceContextAdapter(env({ "/ws/AGENTS.md": "# 제목뿐\n" })).readRootDeclaration(ROOT);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-malformed");
  });

  it("경계 밖 프로젝트 이름은 읽지 않고 거부한다", async () => {
    const e = env(FILES);
    const out = await new ObservePortWorkspaceContextAdapter(e).readProjectDeclaration(ROOT, "../탈출");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("outside-boundary");
    expect(e.reads).toEqual([]);
  });

  it("경계 밖 문서는 읽지 않고 던진다", async () => {
    const adapter = new ObservePortWorkspaceContextAdapter(env(FILES));
    await expect(adapter.readDocument(ROOT, "../탈출.json")).rejects.toThrow(/경계 밖/);
    expect(await adapter.documentExists(ROOT, "../탈출.json")).toBe(false);
  });
});

describe("지문의 한계 (FR-WORKSPACE-CONTEXT.6)", () => {
  it("크기가 달라지면 지문이 달라진다", async () => {
    const a = await new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "짧다" })).fingerprint(ROOT, ["a.json"]);
    const b = await new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "훨씬 더 길어졌다" })).fingerprint(ROOT, ["a.json"]);
    expect(a).not.toBe(b);
  });

  it("크기가 같은 편집은 잡지 못한다 — 이 한계를 아는 채로 쓴다", async () => {
    const a = await new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "가나다" })).fingerprint(ROOT, ["a.json"]);
    const b = await new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "라마바" })).fingerprint(ROOT, ["a.json"]);
    expect(a).toBe(b);
  });

  it("파일이 사라지면 지문이 달라진다", async () => {
    const a = await new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "x" })).fingerprint(ROOT, ["a.json"]);
    const b = await new ObservePortWorkspaceContextAdapter(env({})).fingerprint(ROOT, ["a.json"]);
    expect(a).not.toBe(b);
  });

  it("경로 순서가 달라도 같은 지문이 나온다", async () => {
    const adapter = new ObservePortWorkspaceContextAdapter(env({ "/ws/a.json": "x", "/ws/b.json": "yy" }));
    expect(await adapter.fingerprint(ROOT, ["a.json", "b.json"])).toBe(await adapter.fingerprint(ROOT, ["b.json", "a.json"]));
  });
});
