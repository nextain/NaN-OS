// #499 경계 계약 테스트 (P02) — FR-ENV-TOOL.7.
// 명령이 워크스페이스 경계를 명시적 권한 없이 벗어나지 못하는가, 거부가 명시적인가.
import { describe, it, expect } from "vitest";
import { EnvironmentToolService } from "../main/app/control/env-tool.js";
import { admitEnvOperation } from "../main/domain/env-tool.js";
import { envRequest, fakeBrowser, fakeCancellation, fakeTerminal } from "./helpers/env-tool-fixture.js";

const GRANTED = ["observe", "workspace-write"] as const;
const CONTEXT = { grantedTiers: [...GRANTED] };

describe("작업 디렉터리 경계 (FR-ENV-TOOL.7) [UC-ENV-TOOL-TERMINAL-EXEC]", () => {
  it.each(["packages/shell", "src", "./docs", "a/b/../c"])("경계 안 %s 는 통과한다", (cwd) => {
    expect(admitEnvOperation(envRequest({ capability: "workspace-write", cwd }), CONTEXT)).toEqual([]);
  });

  it.each(["..", "../밖", "../../etc", "/etc", "C:/Windows", "a/../../b"])("경계 밖 %s 는 거부한다", (cwd) => {
    const r = admitEnvOperation(envRequest({ capability: "workspace-write", cwd }), CONTEXT);
    expect(r.map((x) => x.code)).toEqual(["workspace-escape"]);
  });

  it("작업 디렉터리를 지정하지 않은 요청은 경계 검사 대상이 아니다", () => {
    expect(admitEnvOperation(envRequest({ capability: "workspace-write" }), CONTEXT)).toEqual([]);
  });

  it("거부는 조용한 무시가 아니라 경로를 짚는다", () => {
    const r = admitEnvOperation(envRequest({ capability: "workspace-write", cwd: "../밖" }), CONTEXT);
    expect(r[0]?.detail).toContain("../밖");
  });

  it("경계를 벗어난 실행은 포트에 닿지 않는다", async () => {
    const terminal = fakeTerminal();
    const svc = new EnvironmentToolService(fakeBrowser(), terminal, fakeCancellation(), [...GRANTED]);
    const out = await svc.exec(envRequest({ capability: "workspace-write", cwd: "../밖" }), "t1", {
      executable: "pnpm",
      args: [],
      cwd: "../밖",
      env: {},
    });
    expect(out.ok).toBe(false);
    expect(terminal.execs).toEqual([]);
  });
});

describe("상한 없는 작업은 없다 (FR-ENV-TOOL.9)", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("timeoutMs=%s 는 거부한다", (timeoutMs) => {
    const r = admitEnvOperation(envRequest({ timeoutMs }), CONTEXT);
    expect(r.map((x) => x.code)).toContain("timeout-unbounded");
  });

  it("양의 상한은 통과한다", () => {
    expect(admitEnvOperation(envRequest({ timeoutMs: 1 }), CONTEXT)).toEqual([]);
  });
});
