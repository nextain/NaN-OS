// #498 픽스처 계약 테스트 (P02) — NFR-AGENT-BENCH.2.
// 중첩 진입점과 여러 프로젝트를 가진 임시 워크스페이스가 실제로 만들어지고 정리되는지 확인한다.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TempWorkspaceFixtureAdapter } from "./harness/workspace-fixture.js";
import type { WorkspaceFixtureSpec } from "../main/ports/agent-bench.js";

const SPEC: WorkspaceFixtureSpec = {
  rootEntrypoint: "AGENTS.md",
  mandatoryIndexes: ["agents-rules.json", "project-index.json"],
  projects: [
    { name: "alpha", entrypoint: "AGENTS.md" },
    { name: "beta", entrypoint: "AGENTS.md" },
  ],
};

const bases: string[] = [];
afterEach(async () => {
  for (const b of bases.splice(0)) await rm(b, { recursive: true, force: true });
});

async function base(): Promise<string> {
  const b = await mkdtemp(join(tmpdir(), "naia-bench-base-"));
  bases.push(b);
  return b;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("임시 워크스페이스 픽스처 (NFR-AGENT-BENCH.2) [UC-AGENT-BENCH-RUN]", () => {
  it("루트 진입점과 필수 인덱스, 중첩 프로젝트 진입점을 모두 만든다", async () => {
    const fx = await new TempWorkspaceFixtureAdapter(await base()).create(SPEC);
    try {
      expect(await exists(join(fx.root, "AGENTS.md"))).toBe(true);
      expect(await exists(join(fx.root, "agents-rules.json"))).toBe(true);
      expect(await exists(join(fx.root, "project-index.json"))).toBe(true);
      expect(await exists(join(fx.root, "projects", "alpha", "AGENTS.md"))).toBe(true);
      expect(await exists(join(fx.root, "projects", "beta", "AGENTS.md"))).toBe(true);
    } finally {
      await fx.dispose();
    }
  });

  it("루트 진입점이 필수 인덱스와 프로젝트를 선언한다 — 발견이 이름 추측에 기대지 않도록", async () => {
    const fx = await new TempWorkspaceFixtureAdapter(await base()).create(SPEC);
    try {
      const body = await readFile(join(fx.root, "AGENTS.md"), "utf8");
      // 경로는 백틱으로 감싸야 실제 파서가 읽는다 — 맨 경로면 선언이 비어 진입점이
      // malformed 로 거절된다(2026-08-26 실측). 픽스처는 실제로 쓸 수 있는 모양이어야 한다.
      expect(body).toContain("- `agents-rules.json`");
      expect(body).toContain("- `project-index.json`");
      expect(body).toContain("- `projects/alpha/AGENTS.md`");
      expect(body).toContain("- `projects/beta/AGENTS.md`");
    } finally {
      await fx.dispose();
    }
  });

  it("두 픽스처는 서로 다른 루트를 갖는다 — 교차 오염 없이 병렬 실행", async () => {
    const adapter = new TempWorkspaceFixtureAdapter(await base());
    const a = await adapter.create(SPEC);
    const b = await adapter.create(SPEC);
    try {
      expect(a.root).not.toBe(b.root);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });

  it("dispose 는 픽스처를 지우고 두 번 불러도 안전하다", async () => {
    const b = await base();
    const fx = await new TempWorkspaceFixtureAdapter(b).create(SPEC);
    await fx.dispose();
    expect(await exists(fx.root)).toBe(false);
    await expect(fx.dispose()).resolves.toBeUndefined();
    expect(await exists(b)).toBe(true);
  });

  it("경계 밖을 가리키는 인덱스는 거부한다 — 픽스처가 호스트를 건드리지 못하게", async () => {
    const adapter = new TempWorkspaceFixtureAdapter(await base());
    await expect(adapter.create({ ...SPEC, mandatoryIndexes: ["../탈출.json"] })).rejects.toThrow(/경계 밖/);
  });

  it("경계 밖을 가리키는 프로젝트 이름도 거부한다", async () => {
    const adapter = new TempWorkspaceFixtureAdapter(await base());
    await expect(adapter.create({ ...SPEC, projects: [{ name: "../탈출", entrypoint: "AGENTS.md" }] })).rejects.toThrow(/경계 밖/);
  });
});
