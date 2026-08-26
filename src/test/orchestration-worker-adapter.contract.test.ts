// #500 작업자 어댑터 계약 테스트 (P02) — FR-ORCHESTRATION.8.
// 제공자가 달라도 같은 생명주기 의미를 노출하는가.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canWorkerTransition, type WorkerProvider, type WorkerState } from "../main/domain/orchestration.js";
import { assignment, brief, fakeWorkers } from "./helpers/orchestration-fixture.js";

const PORT_SOURCE = readFileSync(resolve(__dirname, "..", "main", "ports", "orchestration.ts"), "utf8");
const PROVIDERS: readonly WorkerProvider[] = ["codex", "claude", "opencode", "shell"];

describe("어댑터 표면 (FR-ORCHESTRATION.8) [UC-ORCHESTRATION-WORKER-REPLACE]", () => {
  it("어댑터는 시작·관측·중단·수집만 노출한다 — 제공자별 특수 진입점이 없다", () => {
    const methods = [...PORT_SOURCE.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(["ensureIssue", "bind", "list", "start", "observe", "interrupt", "collect"]));
  });

  it("제공자 이름이 어댑터 표면에 새지 않는다", () => {
    for (const p of PROVIDERS) expect(PORT_SOURCE).not.toMatch(new RegExp(`${p}\\w*\\(`, "i"));
  });
});

describe("생명주기 의미 (FR-ORCHESTRATION.8)", () => {
  it("시작에서 실행으로, 실행에서 종료로 간다", () => {
    expect(canWorkerTransition("starting", "running")).toBe(true);
    expect(canWorkerTransition("running", "finished")).toBe(true);
  });

  it("멈춘 작업자는 되살리거나 교체할 수 있다", () => {
    expect(canWorkerTransition("stalled", "running")).toBe(true);
    expect(canWorkerTransition("stalled", "replaced")).toBe(true);
  });

  it("실패한 작업자는 교체만 된다 — 조용히 되살아나지 않는다", () => {
    expect(canWorkerTransition("failed", "replaced")).toBe(true);
    expect(canWorkerTransition("failed", "running")).toBe(false);
  });

  it("끝난 작업자는 어디로도 가지 않는다", () => {
    for (const to of ["running", "stalled", "replaced", "failed"] as WorkerState[]) {
      expect(canWorkerTransition("finished", to)).toBe(false);
    }
  });

  it.each(PROVIDERS)("%s 작업자도 같은 상태를 돌려준다", async (provider) => {
    const workers = fakeWorkers();
    const a = assignment(`w-${provider}`, "implementer", ["src/main"], provider);
    expect(await workers.start(a, brief(a.workerId))).toBe("running");
    expect(await workers.observe(a.workerId)).toBe("running");
    expect(await workers.interrupt(a.workerId)).toBe("replaced");
  });
});
