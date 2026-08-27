// #501 실제 파일시스템으로 컨텍스트 해석을 끝까지 밟는다 (native 증거).
//
// 왜 따로 있는가: 다른 계약 테스트는 전부 대역 소스를 쓴다. 대역은 우리가 상상한 모양이라
// 진입점 파싱·경로 경계·중첩 선언 같은 것이 실제 디스크에서도 같은지 증명하지 못한다.
// 벤치가 이 계열에 native 증거를 요구하는 이유이기도 하다.
//
// ⚠️ 임시 디렉터리만 만들고 끝나면 지운다. 픽스처는 자기 루트 밖을 지우지 못한다.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { writeAttestation } from "./harness/bench-execution.js";
import { resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkspaceContextService } from "../main/app/control/workspace-context.js";
import { canonicalRoot } from "../main/domain/workspace.js";
import { TempWorkspaceFixtureAdapter } from "./harness/workspace-fixture.js";
import { FileSystemWorkspaceContextAdapter } from "./harness/workspace-context-fs.js";
import type { WorkspaceFixture } from "../main/ports/agent-bench.js";

/**
 * 실제로 돈 케이스를 러너에서 모은다. 손으로 적은 목록은 테스트를 고칠 때 따라오지 않아
 * 작성자가 관리하는 매핑이 하나 더 느는 것뿐이다(2026-08-27 적대리뷰).
 */
const passedCases: string[] = [];
afterEach((ctx) => {
  if (ctx.task.result?.state === "pass") passedCases.push(ctx.task.name);
});

const LIMITS = { maxDocuments: 20, maxBytes: 200_000 };

let fixture: WorkspaceFixture | null = null;
let root = "";

beforeAll(async () => {
  fixture = await new TempWorkspaceFixtureAdapter().create({
    rootEntrypoint: "AGENTS.md",
    mandatoryIndexes: [".agents/context/project-index.yaml"],
    projects: [
      { name: "alpha", entrypoint: "AGENTS.md" },
      { name: "beta", entrypoint: "AGENTS.md" },
    ],
  });
  root = fixture.root;
}, 60_000);

afterAll(async () => {
  // 이 실행이 실제로 무엇을 만졌는지 남긴다. 정리 전에 써야 root 가 유효하다.
  writeAttestation(resolvePath(__dirname, "..", ".."), {
    spec: "src/test/workspace-context-real-fs.contract.test.ts",
    kinds: ["native"],
    cases: passedCases,
    touched: [root].filter(Boolean),
    at: Date.now(),
  });
  await fixture?.dispose();
}, 60_000);

function service(): WorkspaceContextService {
  return new WorkspaceContextService(new FileSystemWorkspaceContextAdapter(), LIMITS);
}

describe("실제 디스크 위의 컨텍스트 해석 (native)", () => {
  it("픽스처가 실제로 만들어졌다 — 없으면 이 증거는 성립하지 않는다", () => {
    expect(root.length).toBeGreaterThan(0);
    expect(readFileSync(resolve(root, "AGENTS.md"), "utf8").length).toBeGreaterThan(0);
  });

  it("진입점이 선언한 문서를 실제 파일에서 읽는다 (UC-WORKSPACE-CONTEXT-DISCOVER)", async () => {
    const out = await service().discover(canonicalRoot(root), { topics: [] });
    expect(out.ok, `발견 실패: ${JSON.stringify(out)}`).toBe(true);
    if (!out.ok) return;
    expect(out.manifest.selection.loaded.length).toBeGreaterThan(0);
    // 선언되지 않은 파일은 실려 오지 않는다.
    for (const d of out.manifest.selection.loaded) {
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("프로젝트에 들어가면 범위와 개정이 함께 바뀐다 (UC-WORKSPACE-CONTEXT-ENTER-PROJECT)", async () => {
    const svc = service();
    const first = await svc.discover(canonicalRoot(root), { topics: [] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const entered = await svc.enterProject("alpha", { topics: [] });
    expect(entered.ok, `진입 실패: ${JSON.stringify(entered)}`).toBe(true);
    if (!entered.ok) return;
    expect(entered.manifest.scope).not.toEqual(first.manifest.scope);
    expect(entered.manifest.revision).not.toEqual(first.manifest.revision);
  });

  it("프로젝트를 바꾸면 이전 지역 컨텍스트가 남지 않는다 (UC-WORKSPACE-CONTEXT-SWITCH-PROJECT)", async () => {
    const svc = service();
    await svc.discover(canonicalRoot(root), { topics: [] });
    const alpha = await svc.enterProject("alpha", { topics: [] });
    expect(alpha.ok).toBe(true);
    const beta = await svc.switchProject("beta");
    expect(beta.ok, `전환 실패: ${JSON.stringify(beta)}`).toBe(true);
    if (!beta.ok || !alpha.ok) return;
    const alphaOnly = alpha.manifest.selection.loaded
      .filter((d) => d.ref.id.includes("alpha"))
      .map((d) => d.ref.id);
    const afterIds = beta.manifest.selection.loaded.map((d) => d.ref.id);
    for (const id of alphaOnly) expect(afterIds, `이전 프로젝트 문서가 남았다: ${id}`).not.toContain(id);
  });

  it("없는 진입점을 성공으로 말하지 않는다 (UC-WORKSPACE-CONTEXT-BROKEN-ENTRYPOINT)", async () => {
    const svc = service();
    await svc.discover(canonicalRoot(root), { topics: [] });
    const out = await svc.enterProject("존재하지-않는-프로젝트", { topics: [] });
    expect(out.ok, "없는 프로젝트인데 성공했다").toBe(false);
  });

  it("루트 밖으로 나가는 이름은 거절한다", async () => {
    const svc = service();
    await svc.discover(canonicalRoot(root), { topics: [] });
    const out = await svc.enterProject("../../etc", { topics: [] });
    expect(out.ok, "루트 밖 경로가 통과했다").toBe(false);
  });
});
