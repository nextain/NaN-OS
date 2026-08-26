// #499 터미널 계약 테스트 (P02) — FR-ENV-TOOL.5·6.
// 생명주기를 Herdr 에 위임하는가, 구조화된 인자로 넘기는가, 종료 코드와 출력 참조가 오는가.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EnvironmentToolService } from "../main/app/control/env-tool.js";
import { hasEvidence } from "../main/domain/env-tool.js";
import { envRequest, fakeBrowser, fakeCancellation, fakeTerminal } from "./helpers/env-tool-fixture.js";

const PORT_SOURCE = readFileSync(resolve(__dirname, "..", "main", "ports", "env-tool.ts"), "utf8");
const COMMAND = { executable: "pnpm", args: ["test", "--run"], cwd: "packages/shell", env: { CI: "1" } };

function service(terminal = fakeTerminal()) {
  return { svc: new EnvironmentToolService(fakeBrowser(), terminal, fakeCancellation(), ["observe", "workspace-write"]), terminal };
}

describe("생명주기 위임 (FR-ENV-TOOL.5) [UC-ENV-TOOL-TERMINAL-EXEC]", () => {
  it("터미널 포트에는 생성도 종료도 없다 — 소유는 Herdr 에 있다", () => {
    expect(PORT_SOURCE).not.toMatch(/createTerminal|closeTerminal|killTerminal/);
    const methods = [...PORT_SOURCE.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(methods).toContain("exec");
    expect(methods).not.toContain("createTerminal");
  });

  it("실행은 기존 터미널 식별자를 참조한다", async () => {
    const { svc, terminal } = service();
    await svc.exec(envRequest({ capability: "workspace-write" }), "herdr-term-7", COMMAND);
    expect(terminal.execs[0]?.terminalId).toBe("herdr-term-7");
  });
});

describe("구조화 전달 (FR-ENV-TOOL.5)", () => {
  it("실행 파일과 인자가 분리되어 넘어간다", async () => {
    const { svc, terminal } = service();
    await svc.exec(envRequest({ capability: "workspace-write" }), "t1", COMMAND);
    expect(terminal.execs[0]).toEqual({ terminalId: "t1", executable: "pnpm", args: ["test", "--run"], cwd: "packages/shell" });
  });

  it("셸 한 줄은 포트에 닿지 못한다", async () => {
    const { svc, terminal } = service();
    const out = await svc.exec(envRequest({ capability: "workspace-write" }), "t1", { ...COMMAND, executable: "sh -c 'rm -rf /'" });
    expect(out.ok).toBe(false);
    expect(terminal.execs).toEqual([]);
  });
});

describe("터미널 증거 (FR-ENV-TOOL.6)", () => {
  it("종료 코드와 출력·산출물 참조가 함께 온다", async () => {
    const { svc } = service();
    const out = await svc.exec(envRequest({ capability: "workspace-write" }), "t1", COMMAND);
    expect(out.ok).toBe(true);
    if (!out.ok || out.operation.evidence?.kind !== "terminal") return;
    expect(out.operation.evidence.value).toEqual({ exitCode: 0, outputRef: "out:1", artifactRefs: ["artifact:1"] });
  });

  it("종료 코드가 없어도 출력 참조가 있으면 증거로 인정한다 — 아직 안 끝난 프로세스가 있다", () => {
    expect(hasEvidence("completed", { kind: "terminal", value: { exitCode: null, outputRef: "out:1", artifactRefs: [] } })).toBe(true);
  });

  it("출력 참조가 없는 완료는 받지 않는다", async () => {
    const { svc } = service(fakeTerminal({ outputRef: "" }));
    const out = await svc.exec(envRequest({ capability: "workspace-write" }), "t1", COMMAND);
    expect(out.ok).toBe(false);
  });
});
