// #501 파일 시스템 어댑터 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.1·7·8.
// 대역이 아니라 이 저장소의 실제 AGENTS.md 와 실제 임시 워크스페이스에서 확인한다.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileSystemWorkspaceContextAdapter, parseDeclaration, sectionLines } from "../main/adapters/workspace-context-fs.js";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { canonicalRoot } from "../main/domain/workspace.js";

const LIMITS = { maxDocuments: 20, maxBytes: 1_000_000 };
const REPO = canonicalRoot(resolve(__dirname, "..", ".."));

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function tempWorkspace(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "naia-wsctx-"));
  dirs.push(d);
  return d;
}

describe("진입점 파싱", () => {
  it("Mandatory Reads 절의 백틱 경로만 뽑는다", () => {
    const md = ["# T", "## Mandatory Reads", "1. **현황**: `a.json` — 설명 속 `무시할것`", "2. `b.json`", "## 다른 절", "- `c.json`"].join("\n");
    expect(parseDeclaration("AGENTS.md", md).documents.map((d) => d.path)).toEqual(["a.json", "b.json"]);
  });

  it("목록이 아닌 줄의 백틱은 무시한다", () => {
    const md = ["## Mandatory Reads", "본문에 나온 `무시할것`", "- `a.json`"].join("\n");
    expect(parseDeclaration("AGENTS.md", md).documents.map((d) => d.path)).toEqual(["a.json"]);
  });

  it("절 제목은 접두사로 맞춘다 — 괄호 붙은 실제 제목도 잡는다", () => {
    const lines = sectionLines("## Mandatory Reads (every session start)\n- `a.json`\n", "Mandatory Reads");
    expect(lines.join("\n")).toContain("`a.json`");
  });

  it("더 깊은 하위 제목은 절을 끊지 않는다", () => {
    const md = ["## Mandatory Reads", "- `a.json`", "### 하위", "- `b.json`", "## 끝", "- `c.json`"].join("\n");
    expect(parseDeclaration("AGENTS.md", md).documents.map((d) => d.path)).toEqual(["a.json", "b.json"]);
  });

  it("Projects 절이 있으면 프로젝트 진입점으로 읽는다", () => {
    const md = ["## Mandatory Reads", "- `a.json`", "## Projects", "- `projects/alpha/AGENTS.md`"].join("\n");
    const d = parseDeclaration("AGENTS.md", md);
    expect(d.projects).toEqual([{ name: "alpha", entrypoint: "projects/alpha/AGENTS.md", documents: [] }]);
  });

  it("Projects 절이 없으면 프로젝트는 비어 있다 — 디렉터리를 훑어 지어내지 않는다", () => {
    expect(parseDeclaration("AGENTS.md", "## Mandatory Reads\n- `a.json`\n").projects).toEqual([]);
  });
});

describe("이 저장소의 실제 진입점", () => {
  it("AGENTS.md 가 선언한 필수 문서를 읽어 낸다", async () => {
    const out = await new FileSystemWorkspaceContextAdapter().readRootDeclaration(REPO);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.declaration.documents.map((d) => d.path)).toEqual([
      ".agents/context/process-status.json",
      ".agents/context/agents-rules.json",
      "docs/project-structure.md",
    ]);
  });

  it("선언된 세 문서가 실제로 존재한다", async () => {
    const adapter = new FileSystemWorkspaceContextAdapter();
    for (const p of [".agents/context/process-status.json", ".agents/context/agents-rules.json", "docs/project-structure.md"]) {
      expect(await adapter.documentExists(REPO, p)).toBe(true);
    }
  });

  it("서비스가 실제 저장소에서 컨텍스트를 확정한다", async () => {
    const svc = new WorkspaceContextService(new FileSystemWorkspaceContextAdapter(), LIMITS);
    const out = await svc.discover(REPO, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.map((d) => d.ref.path)).toContain(".agents/context/agents-rules.json");
    expect(out.manifest.selection.dropped).toEqual([]);
  });

  it("확정된 문서는 실제로 읽히고, 선언 밖 문서는 읽히지 않는다", async () => {
    const svc = new WorkspaceContextService(new FileSystemWorkspaceContextAdapter(), LIMITS);
    const out = await svc.discover(REPO, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const body = await svc.readContext(".agents/context/agents-rules.json", out.manifest.revision);
    expect(body).toContain("charter_immutability");
    await expect(svc.readContext("README.md", out.manifest.revision)).rejects.toThrow(/선택되지 않은 문서/);
  });
});

describe("실패와 경계 (FR-WORKSPACE-CONTEXT.7·8)", () => {
  it("진입점이 없으면 entrypoint-missing", async () => {
    const root = canonicalRoot(await tempWorkspace());
    const out = await new FileSystemWorkspaceContextAdapter().readRootDeclaration(root);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-missing");
  });

  it("필수 선언이 없는 진입점은 entrypoint-malformed — 빈 컨텍스트를 성공으로 위장하지 않는다", async () => {
    const dir = await tempWorkspace();
    await writeFile(join(dir, "AGENTS.md"), "# 제목만 있고 선언이 없다\n", "utf8");
    const out = await new FileSystemWorkspaceContextAdapter().readRootDeclaration(canonicalRoot(dir));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("entrypoint-malformed");
  });

  it("선언한 문서가 실제로 없으면 declared-index-missing 으로 실패한다", async () => {
    const dir = await tempWorkspace();
    await writeFile(join(dir, "AGENTS.md"), "## Mandatory Reads\n- `있다.json`\n- `없다.json`\n", "utf8");
    await writeFile(join(dir, "있다.json"), "{}\n", "utf8");
    const svc = new WorkspaceContextService(new FileSystemWorkspaceContextAdapter(), LIMITS);
    const out = await svc.discover(canonicalRoot(dir), { topics: [] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics.map((d) => [d.code, d.target])).toEqual([["declared-index-missing", "없다.json"]]);
  });

  it("중첩 프로젝트 진입점을 읽고 그 프로젝트의 문서를 싣는다", async () => {
    const dir = await tempWorkspace();
    await writeFile(join(dir, "AGENTS.md"), "## Mandatory Reads\n- `root.json`\n## Projects\n- `projects/alpha/AGENTS.md`\n", "utf8");
    await writeFile(join(dir, "root.json"), "{}\n", "utf8");
    await mkdir(join(dir, "projects", "alpha"), { recursive: true });
    await writeFile(join(dir, "projects", "alpha", "AGENTS.md"), "## Mandatory Reads\n- `projects/alpha/local.json`\n", "utf8");
    await writeFile(join(dir, "projects", "alpha", "local.json"), "{}\n", "utf8");
    const svc = new WorkspaceContextService(new FileSystemWorkspaceContextAdapter(), LIMITS);
    const root = canonicalRoot(dir);
    expect((await svc.discover(root, { topics: [] })).ok).toBe(true);
    const entered = await svc.enterProject("alpha", { topics: [] });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    expect(entered.manifest.selection.loaded.map((d) => d.ref.path)).toContain("projects/alpha/local.json");
    expect(entered.manifest.scope).toEqual({ kind: "project", name: "alpha" });
  });

  it("경계 밖 경로는 읽지 않고 거부한다", async () => {
    const root = canonicalRoot(await tempWorkspace());
    const adapter = new FileSystemWorkspaceContextAdapter();
    expect(await adapter.documentExists(root, "../탈출.json")).toBe(false);
    await expect(adapter.readDocument(root, "../탈출.json")).rejects.toThrow(/경계 밖/);
    const out = await adapter.readProjectDeclaration(root, "../탈출");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0]?.code).toBe("outside-boundary");
  });

  it("지문은 파일이 바뀌면 달라진다", async () => {
    const dir = await tempWorkspace();
    await writeFile(join(dir, "a.json"), "{}\n", "utf8");
    const adapter = new FileSystemWorkspaceContextAdapter();
    const root = canonicalRoot(dir);
    const before = await adapter.fingerprint(root, ["a.json"]);
    await writeFile(join(dir, "a.json"), '{"더":"길어졌다"}\n', "utf8");
    expect(await adapter.fingerprint(root, ["a.json"])).not.toBe(before);
  });
});
