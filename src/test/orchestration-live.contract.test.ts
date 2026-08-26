// #500 실제로 도는 작업자로 오케스트레이션을 끝까지 밟는다 (UC-ORCHESTRATION-*, worker+native 증거).
//
// 왜 따로 있는가: 오케스트레이션 계약 테스트는 전부 대역 작업자로 돈다. 대역은 우리가 정한
// 상태를 그대로 돌려주므로 "작업자가 정말 돌았고 산출물을 남겼는가", "완료 선언이 판정에
// 쓰이지 않는가"를 증명하지 못한다. 이 포트에는 실제 구현이 하나도 없었다(2026-08-27 실측).
//
// ⚠️ 코딩 모델을 띄우지 않는다. provider 는 `shell` 이고, 실제 프로세스가 임시 디렉터리
//    안에서 산출물을 남긴다. 사용자의 자격증명과 비용이 걸리는 일은 이 검증의 목적이 아니다.
// ⚠️ 모든 작업은 임시 디렉터리 안에서만 하고 끝나면 지운다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeAttestation } from "./harness/bench-execution.js";
import { resolve as resolvePath } from "node:path";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IssueOrchestrator } from "../main/app/control/orchestration.js";
import { classify, overrideClassification } from "../main/domain/orchestration.js";
import {
  LiveShellWorkerAdapter,
  fileIssueTracker,
  fileSpaceBindings,
} from "./harness/orchestration-live.js";
import type { DelegationBrief, WorkerAssignment } from "../main/domain/orchestration.js";

let root = "";
let workers: LiveShellWorkerAdapter;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "naia-orch-"));
  workers = new LiveShellWorkerAdapter(root);
});

afterAll(() => {
  // 이 실행이 실제로 무엇을 만졌는지 남긴다. 벤치는 이 증명서가 있어야 worker 영수증을 준다.
  writeAttestation(resolvePath(__dirname, "..", ".."), {
    spec: "src/test/orchestration-live.contract.test.ts",
    kinds: ["worker", "native"],
    touched: [root].filter(Boolean),
    at: Date.now(),
  });
  if (root && root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
  // 지웠는지 실제로 확인한다 — 확인 불능을 깨끗함으로 읽지 않는다.
  if (root && existsSync(root)) throw new Error(`임시 작업 공간이 남았다: ${root}`);
});

function orchestrator(): IssueOrchestrator {
  return new IssueOrchestrator(fileIssueTracker(root), fileSpaceBindings(root), workers);
}

const IMPLEMENTER: WorkerAssignment = {
  workerId: "impl-1",
  role: "implementer",
  provider: "shell",
  ownedPaths: ["src"],
};
const REVIEWER: WorkerAssignment = {
  workerId: "review-1",
  role: "reviewer",
  provider: "shell",
  ownedPaths: ["docs"],
};

function brief(workerId: string, issue: string): DelegationBrief {
  return {
    workerId,
    issue,
    intent: "작은 산출물을 하나 남긴다",
    contextRevision: "rev-1",
    grantedTiers: ["workspace-write"],
    ownedPaths: workerId === "impl-1" ? ["src"] : ["docs"],
    successCriteria: ["산출물 파일이 존재한다"],
    tokenBudget: 1_000,
  };
}

describe("실제 작업자로 오케스트레이션 (worker+native)", () => {
  it("임시 작업 공간이 실제로 만들어졌다", () => {
    expect(existsSync(root)).toBe(true);
  });

  it("저장소를 바꾸는 일은 이슈로 분류된다 (UC-ORCHESTRATION-CLASSIFY)", () => {
    const chat = classify({ mutatesRepository: false, multiStep: false, needsVerification: false });
    expect(chat.taskClass).toBe("conversational");
    const work = classify({ mutatesRepository: true, multiStep: true, needsVerification: true });
    expect(work.taskClass).toBe("issue-worthy");
    expect(work.reasons.length).toBeGreaterThan(0);
  });

  it("사용자가 분류를 뒤집으면 따르되 근거가 남는다 (UC-ORCHESTRATION-CLASSIFY)", () => {
    const auto = classify({ mutatesRepository: true, multiStep: false, needsVerification: false });
    const forced = overrideClassification(auto, "conversational", "그냥 물어본 것");
    expect(forced.taskClass).toBe("conversational");
    expect(forced.overridden).toBe(true);
    expect(forced.reasons.join(" ")).toContain("그냥 물어본 것");
  });

  it("이슈를 열고 리더를 세우고 실제 작업자가 돈다 (UC-ORCHESTRATION-ISSUE-LEAD)", async () => {
    const orch = orchestrator();
    const issue = "실제 작업자 검증";
    const out = await orch.start(
      issue,
      "space-1",
      { issue: "", leaderId: "lead-1" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-1"), brief("review-1", "issue-1")],
    );
    expect(out.ok, `거절: ${JSON.stringify(out)}`).toBe(true);
    if (!out.ok) return;

    // 실제 프로세스가 끝날 때까지 기다린 뒤 산출물을 확인한다.
    expect(await workers.settle("impl-1")).toBe("finished");
    expect(existsSync(resolve(root, "src", "impl-1.out")), "작업자가 산출물을 남기지 않았다").toBe(true);
  }, 60_000);

  it("같은 이슈에 다른 리더를 세울 수 없다 (UC-ORCHESTRATION-ISSUE-LEAD)", async () => {
    const orch = orchestrator();
    const issue = "리더 충돌";
    const first = await orch.start(
      issue,
      "space-lead-a",
      { issue: "", leaderId: "lead-A" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-x"), brief("review-1", "issue-x")],
    );
    expect(first.ok).toBe(true);
    const second = await orch.start(
      issue,
      "space-lead-b",
      { issue: "", leaderId: "lead-B" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-x"), brief("review-1", "issue-x")],
    );
    expect(second.ok, "리더가 둘이 됐다").toBe(false);
  }, 60_000);

  it("작업자의 완료 선언과 권한 요구는 반영되지 않는다 (UC-ORCHESTRATION-ISSUE-LEAD)", async () => {
    const orch = orchestrator();
    const out = await orch.start(
      "완료 선언 검증",
      "space-claim",
      { issue: "", leaderId: "lead-claim" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-c"), brief("review-1", "issue-c")],
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    await workers.settle("impl-1");

    const accepted = await orch.collect(out.state.issue, brief("impl-1", out.state.issue));
    // 증거는 실제 산출물에서 온다.
    expect(accepted.evidence.length, "실제 산출물 증거가 없다").toBeGreaterThan(0);
    expect(accepted.evidence.join(" ")).toContain("impl-1");
    // 작업자는 다 했다고 말했지만 그 말은 판정에 쓰이지 않는다.
    expect(accepted.issueComplete, "작업자의 완료 선언이 그대로 반영됐다").toBe(false);
    // 더 달라고 한 권한은 부여되지 않되, 무시했다는 사실은 기록으로 남는다 —
    // 조용히 삼키면 무엇을 거절했는지 아무도 모른다.
    expect(accepted.effectiveTiers, "요구한 권한이 부여됐다").not.toContain("production");
    expect(accepted.ignoredEscalations, "거절 사실이 기록되지 않았다").toContain("production");
  }, 60_000);

  it("소유 경로가 겹치면 아무도 시작하지 않는다 (UC-ORCHESTRATION-ISSUE-LEAD)", async () => {
    const orch = orchestrator();
    const overlapping: WorkerAssignment = { ...REVIEWER, ownedPaths: ["src/deep"] };
    const out = await orch.start(
      "소유 충돌",
      "space-overlap",
      { issue: "", leaderId: "lead-o" },
      [IMPLEMENTER, overlapping],
      [brief("impl-1", "issue-o"), brief("review-1", "issue-o")],
    );
    expect(out.ok, "경로가 겹치는데 시작했다").toBe(false);
  }, 60_000);

  it("작업자를 교체해도 이슈 증거가 유지된다 (UC-ORCHESTRATION-WORKER-REPLACE)", async () => {
    const orch = orchestrator();
    const out = await orch.start(
      "교체 검증",
      "space-replace",
      { issue: "", leaderId: "lead-r" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-r"), brief("review-1", "issue-r")],
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    await workers.settle("impl-1");
    await orch.collect(out.state.issue, brief("impl-1", out.state.issue));
    const before = orch.stateOf(out.state.issue)?.evidence.length ?? 0;
    expect(before).toBeGreaterThan(0);

    const replacement: WorkerAssignment = { ...IMPLEMENTER, workerId: "impl-2" };
    const next = await orch.replace(out.state.issue, "impl-1", replacement, brief("impl-1", out.state.issue));
    expect(next, "교체가 상태를 잃었다").not.toBeNull();
    expect(next?.evidence.length, "교체하면서 증거가 사라졌다").toBe(before);
    // 교체된 작업자는 실제로 멈춘다.
    expect(await workers.observe("impl-1")).toBe("replaced");
  }, 60_000);

  it("재시작 뒤 찾지 못하면 이어받을 수 없다고 말한다 (UC-ORCHESTRATION-RESTART-RESUME)", async () => {
    const fresh = orchestrator();
    const out = await fresh.resume("존재하지-않는-이슈");
    expect(out.stance).toBe("unresumable");
    expect(out.state).toBeNull();
  });

  it("재시작 뒤 찾으면 실제 작업자 상태로 태도를 정한다 (UC-ORCHESTRATION-RESTART-RESUME)", async () => {
    const orch = orchestrator();
    const out = await orch.start(
      "재개 검증",
      "space-resume",
      { issue: "", leaderId: "lead-res" },
      [IMPLEMENTER, REVIEWER],
      [brief("impl-1", "issue-res"), brief("review-1", "issue-res")],
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    await workers.settle("impl-1");
    await workers.settle("review-1");
    const resumed = await orch.resume(out.state.issue);
    // 실제 작업자를 관측해서 정한 태도다 — 지어낸 값이 아니다.
    expect(["resumed", "unknown-until-resynced"]).toContain(resumed.stance);
    expect(resumed.state?.assignments.length).toBe(2);
  }, 60_000);

  it("결속이 파일로 남아 재시작을 넘어간다 (UC-ORCHESTRATION-RESTART-RESUME)", async () => {
    expect(existsSync(resolve(root, "bindings.json")), "결속이 디스크에 남지 않았다").toBe(true);
    expect(existsSync(resolve(root, "issues.json")), "이슈가 디스크에 남지 않았다").toBe(true);
  });

  it("코딩 모델 작업자는 이 어댑터가 띄우지 않는다 — 띄운 척도 하지 않는다", async () => {
    const state = await workers.start(
      { workerId: "codex-1", role: "implementer", provider: "codex", ownedPaths: ["src"] },
      brief("codex-1", "issue-codex"),
    );
    expect(state).toBe("failed");
  });
});
