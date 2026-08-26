// #502 슬라이스 1 전달 계약 테스트 (P02) — FR-ENV-DISPATCH.1~7.
// 무엇이 열렸고 무엇이 열리지 않았는가, 터미널 입력이 구조화 전달과 같은 권한으로 나가는가,
// 환경이 거절했을 때 성공으로 바뀌지 않는가.
import { describe, it, expect, vi } from "vitest";
import {
  ALLOWED_METHODS,
  EnvironmentDispatcher,
  isAllowed,
  toInvocation,
  type DispatchGrants,
} from "../main/app/control/environment-dispatch.js";
import { mintRegistry, translate, type EnvironmentCall } from "../main/domain/environment-translation.js";
import { surfaceRef } from "../main/domain/environment-intent.js";
import type { EnvironmentCommandPort } from "../main/ports/environment-dispatch.js";

const FULL: DispatchGrants = { workspaceObserve: true, terminalInput: true };
const OBSERVE_ONLY: DispatchGrants = { workspaceObserve: true, terminalInput: false };

function fakeCommands(impl?: (command: string, args: Record<string, unknown>) => unknown): EnvironmentCommandPort & {
  readonly calls: { command: string; args: Record<string, unknown> }[];
} {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    async invoke(command, args) {
      calls.push({ command, args: { ...args } });
      return impl ? impl(command, args as Record<string, unknown>) : undefined;
    },
  };
}

// 번역기가 실제로 내는 호출만 쓴다 — 손으로 지어낸 호출로 검증하지 않는다.
const registry = mintRegistry([{ surfaceId: "w1:p1", agentTarget: "w1:p1" }, { surfaceId: "w1:p2" }]);
function callFor(intent: Parameters<typeof translate>[0]): EnvironmentCall {
  const out = translate(intent, registry);
  if (!out.ok) throw new Error("번역 실패 — 테스트 전제가 깨졌다");
  return out.call;
}

const OBSERVE = callFor({ kind: "observe" });
const AGENT_FOCUS = callFor({ kind: "focus", surface: surfaceRef("s-1") });
const AGENT_PROMPT = callFor({ kind: "run", surface: surfaceRef("s-1"), request: "테스트 돌려" });
const PANE_RUN = callFor({ kind: "run", surface: surfaceRef("s-2"), request: "pnpm test" });
const PANE_KEYS = callFor({ kind: "interrupt", surface: surfaceRef("s-2") });

describe("열린 것과 열리지 않은 것 (FR-ENV-DISPATCH.1)", () => {
  it("이 슬라이스가 여는 호출은 다섯 가지뿐이다", () => {
    expect([...ALLOWED_METHODS]).toEqual([
      "session.snapshot",
      "agent.focus",
      "agent.prompt",
      "pane.run",
      "pane.send_keys",
    ]);
  });

  it("번역기가 내는 호출은 전부 열려 있다 — 번역되는데 전달 못 하는 구멍이 없다", () => {
    for (const call of [OBSERVE, AGENT_FOCUS, AGENT_PROMPT, PANE_RUN, PANE_KEYS]) {
      expect(isAllowed(call.method), call.method).toBe(true);
    }
  });

  it.each(["workspace.close", "pane.split", "server.stop", "plugin.link", "worktree.remove"])(
    "프로토콜에 있어도 열지 않은 %s 는 도달할 수 없다",
    (method) => {
      expect(isAllowed(method)).toBe(false);
    },
  );

  it("열지 않은 호출은 명령을 만들지 않는다", async () => {
    const commands = fakeCommands();
    const dispatcher = new EnvironmentDispatcher(commands, FULL);
    const out = await dispatcher.dispatch({
      method: "server.stop",
      params: {},
      delivery: "structured",
      verified: true,
      quotingOwnedByCaller: false,
    });
    expect(out.ok).toBe(false);
    expect(commands.calls).toEqual([]);
  });
});

describe("구조화 전달 (FR-ENV-DISPATCH.2)", () => {
  it.each([
    ["관측", OBSERVE, "herdr_snapshot", {}],
    ["에이전트 포커스", AGENT_FOCUS, "herdr_focus_agent", { paneId: "w1:p1" }],
    ["에이전트 프롬프트", AGENT_PROMPT, "herdr_prompt_agent", { paneId: "w1:p1", text: "테스트 돌려" }],
  ])("%s 는 셸 명령으로 간다", async (_label, call, command, args) => {
    const commands = fakeCommands();
    const out = await new EnvironmentDispatcher(commands, OBSERVE_ONLY).dispatch(call as EnvironmentCall);
    expect(out.ok).toBe(true);
    expect(commands.calls).toEqual([{ command, args }]);
  });

  it("구조화 전달은 터미널 입력 권한 없이도 나간다", async () => {
    const commands = fakeCommands();
    const out = await new EnvironmentDispatcher(commands, OBSERVE_ONLY).dispatch(AGENT_PROMPT);
    expect(out.ok).toBe(true);
  });
});

describe("터미널 입력은 별도 권한 (FR-ENV-DISPATCH.3)", () => {
  it.each([
    ["실행", PANE_RUN],
    ["중단", PANE_KEYS],
  ])("%s 는 관측 권한만으로는 나가지 않는다", async (_label, call) => {
    const commands = fakeCommands();
    const out = await new EnvironmentDispatcher(commands, OBSERVE_ONLY).dispatch(call as EnvironmentCall);
    expect(out.ok).toBe(false);
    if (out.ok || !("rejections" in out)) return;
    expect(out.rejections.map((r) => r.code)).toEqual(["terminal-input-not-granted"]);
    expect(commands.calls).toEqual([]);
  });

  it("권한이 있으면 나간다", async () => {
    const commands = fakeCommands();
    const out = await new EnvironmentDispatcher(commands, FULL).dispatch(PANE_RUN);
    expect(out.ok).toBe(true);
    expect(commands.calls).toEqual([{ command: "herdr_run_pane", args: { paneId: "w1:p2", command: "pnpm test" } }]);
  });

  it("중단은 키 배열을 그대로 넘긴다", async () => {
    const commands = fakeCommands();
    await new EnvironmentDispatcher(commands, FULL).dispatch(PANE_KEYS);
    expect(commands.calls[0]?.command).toBe("herdr_send_keys");
    expect(commands.calls[0]?.args["keys"]).toEqual(["C-c"]);
  });

  it("관측 권한 자체가 없으면 아무것도 나가지 않는다", async () => {
    const commands = fakeCommands();
    const out = await new EnvironmentDispatcher(commands, { workspaceObserve: false, terminalInput: true }).dispatch(OBSERVE);
    expect(out.ok).toBe(false);
    expect(commands.calls).toEqual([]);
  });
});

describe("인자 검증 (FR-ENV-DISPATCH.4·5)", () => {
  it.each([
    ["표면 식별자 없는 포커스", { method: "agent.focus", params: {} }],
    ["본문 없는 프롬프트", { method: "agent.prompt", params: { target: "w1:p1" } }],
    ["명령 없는 실행", { method: "pane.run", params: { pane_id: "w1:p2" } }],
    ["빈 키 배열", { method: "pane.send_keys", params: { pane_id: "w1:p2", keys: [] } }],
  ])("%s 는 명령을 만들지 않는다", (_label, partial) => {
    const result = toInvocation({
      ...(partial as { method: string; params: Record<string, unknown> }),
      delivery: "structured",
      verified: true,
      quotingOwnedByCaller: false,
    });
    expect(result).toHaveProperty("code", "bad-params");
  });

  it("빈 문자열은 값이 아니다", () => {
    const result = toInvocation({
      method: "pane.run",
      params: { pane_id: "w1:p2", command: "" },
      delivery: "terminal-input",
      verified: true,
      quotingOwnedByCaller: true,
    });
    expect(result).toHaveProperty("code", "bad-params");
  });
});

describe("환경 오류 전파 (FR-ENV-DISPATCH.6)", () => {
  it("환경이 던진 오류를 성공으로 바꾸지 않는다", async () => {
    const commands = fakeCommands(() => {
      throw new Error("Invalid Herdr pane id");
    });
    const out = await new EnvironmentDispatcher(commands, FULL).dispatch(AGENT_FOCUS);
    expect(out.ok).toBe(false);
    if (out.ok || !("environmentError" in out)) return;
    expect(out.environmentError).toBe("Invalid Herdr pane id");
  });

  it("문자열로 던진 오류도 잃지 않는다", async () => {
    const commands = fakeCommands(() => {
      throw "Herdr API unavailable";
    });
    const out = await new EnvironmentDispatcher(commands, FULL).dispatch(OBSERVE);
    expect(out.ok).toBe(false);
    if (out.ok || !("environmentError" in out)) return;
    expect(out.environmentError).toContain("Herdr API unavailable");
  });

  it("성공 결과는 그대로 돌려준다", async () => {
    const commands = fakeCommands(() => ({ panes: [] }));
    const out = await new EnvironmentDispatcher(commands, FULL).dispatch(OBSERVE);
    expect(out.ok && out.result).toEqual({ panes: [] });
  });
});

describe("전달 계층은 판정을 다시 하지 않는다", () => {
  it("번역 결과의 전달 종류를 그대로 신뢰한다 — 두 곳에서 다르게 판단하지 않는다", async () => {
    const spy = vi.fn();
    const commands: EnvironmentCommandPort = { invoke: async (c, a) => spy(c, a) };
    // 같은 메서드라도 delivery 가 구조화로 표시되면 터미널 권한을 요구하지 않는다.
    await new EnvironmentDispatcher(commands, OBSERVE_ONLY).dispatch({
      ...PANE_RUN,
      delivery: "structured",
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
