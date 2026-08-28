// #501 개정 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.6.
// 개정이 단조 증가하는가, 디스크 변경이 반영되는가, 오래된 개정으로 답하지 못하는가.
import { describe, it, expect } from "vitest";
import { StaleRevisionError, WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { firstRevision, nextRevision } from "../main/domain/workspace-context.js";
import { fakeSource, rootDeclaration, ROOT } from "./helpers/workspace-context-fixture.js";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

describe("개정 단조 증가 (FR-WORKSPACE-CONTEXT.6) [UC-WORKSPACE-CONTEXT-SWITCH-PROJECT]", () => {
  it("첫 개정은 1 이고 다음은 항상 커진다", () => {
    let r = firstRevision();
    expect(r.value).toBe(1);
    for (let i = 2; i <= 5; i += 1) {
      const before = r.value;
      r = nextRevision(r);
      expect(r.value).toBe(i);
      expect(r.value).toBeGreaterThan(before);
    }
  });

  it("진입할 때마다 개정이 올라간다", async () => {
    const src = fakeSource({
      projects: {
        alpha: { ok: true, declaration: rootDeclaration({ entrypoint: "projects/alpha/AGENTS.md" }) },
        beta: { ok: true, declaration: rootDeclaration({ entrypoint: "projects/beta/AGENTS.md" }) },
      },
    });
    const svc = new WorkspaceContextService(src, LIMITS);
    const a = await svc.discover(ROOT, { topics: [] });
    const b = await svc.enterProject("alpha", { topics: [] });
    const c = await svc.enterProject("beta", { topics: [] });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    const values = [a.manifest.revision.value, b.manifest.revision.value, c.manifest.revision.value];
    expect(values).toEqual([...values].sort((x, y) => x - y));
    expect(new Set(values).size).toBe(3);
  });
});

describe("디스크 변경 반영 (FR-WORKSPACE-CONTEXT.6)", () => {
  it("지문이 그대로면 개정을 올리지 않는다 — 헛된 무효화는 없다", async () => {
    const svc = new WorkspaceContextService(fakeSource({ fingerprints: ["fp-1"] }), LIMITS);
    const first = await svc.discover(ROOT, { topics: [] });
    const again = await svc.refresh();
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.manifest.revision.value).toBe(first.manifest.revision.value);
  });

  it("지문이 바뀌면 개정을 올리고 다시 싣는다 — 오래된 사본으로 답하지 않는다", async () => {
    const src = fakeSource({ fingerprints: ["fp-1", "fp-2"] });
    const svc = new WorkspaceContextService(src, LIMITS);
    const first = await svc.discover(ROOT, { topics: [] });
    src.advanceFingerprint();
    const after = await svc.refresh();
    expect(first.ok && after.ok).toBe(true);
    if (!first.ok || !after.ok) return;
    expect(after.manifest.revision.value).toBeGreaterThan(first.manifest.revision.value);
  });
});

describe("오래된 개정 거절 (FR-WORKSPACE-CONTEXT.6)", () => {
  it("현재 개정으로는 선택된 문서를 읽을 수 있다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    await expect(svc.readContext("rules", out.manifest.revision)).resolves.toBe("본문:agents-rules.json");
  });

  it("무효화된 개정으로 읽으려 하면 거절한다", async () => {
    const src = fakeSource({
      fingerprints: ["fp-1"],
      projects: { alpha: { ok: true, declaration: rootDeclaration({ entrypoint: "projects/alpha/AGENTS.md" }) } },
    });
    const svc = new WorkspaceContextService(src, LIMITS);
    const first = await svc.discover(ROOT, { topics: [] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await svc.enterProject("alpha", { topics: [] });
    await expect(svc.readContext("rules", first.manifest.revision)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("선택되지 않은 문서는 현재 개정으로도 읽지 못한다", async () => {
    const svc = new WorkspaceContextService(fakeSource(), LIMITS);
    const out = await svc.discover(ROOT, { topics: [] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    await expect(svc.readContext("terms", out.manifest.revision)).rejects.toThrow(/선택되지 않은 문서/);
  });
});
