// app/control/environment-dispatch — #502 슬라이스 1 전달 (FR-ENV-DISPATCH.1~7). 포트만 사용.
// 계약: docs/progress/issue-497-universal-agent.md 의 슬라이스 1 전달 경계.
//
// 번역기가 낸 환경 호출을 실제 명령으로 보낸다. 여기가 마지막 관문이다.
//   - 번역기가 실제로 내는 호출만 받는다. 프로토콜의 나머지는 열지 않는다 (FR-ENV-DISPATCH.1).
//   - 터미널 입력은 구조화 전달과 같은 권한으로 나가지 않는다 (FR-ENV-DISPATCH.3).
//   - 환경이 거절하면 그대로 올린다 (FR-ENV-DISPATCH.6).
import type { EnvironmentCall } from "../../domain/environment-translation.js";
import type { EnvironmentCommandPort } from "../../ports/environment-dispatch.js";

/** 이 슬라이스가 여는 전부. 목록 밖은 환경에 도달할 수 없다. */
export const ALLOWED_METHODS = ["session.snapshot", "agent.focus", "agent.prompt", "pane.run", "pane.send_keys"] as const;

export type AllowedMethod = (typeof ALLOWED_METHODS)[number];

export function isAllowed(method: string): method is AllowedMethod {
  return (ALLOWED_METHODS as readonly string[]).includes(method);
}

/** 터미널 입력 전달을 허용받았는가. 구조화 전달과 별개다. */
export interface DispatchGrants {
  readonly workspaceObserve: boolean;
  readonly terminalInput: boolean;
}

export type DispatchRejectionCode = "method-not-open" | "terminal-input-not-granted" | "observe-not-granted" | "bad-params";

export interface DispatchRejection {
  readonly code: DispatchRejectionCode;
  readonly detail: string;
}

export type DispatchOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly rejections: readonly DispatchRejection[] }
  | { readonly ok: false; readonly environmentError: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface CommandInvocation {
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** 환경 호출 → 셸 명령. 인자 이름은 이 저장소의 기존 관행(camelCase)을 따른다. */
export function toInvocation(call: EnvironmentCall): CommandInvocation | DispatchRejection {
  const paneId = str(call.params["pane_id"]) ?? str(call.params["target"]);
  switch (call.method) {
    case "session.snapshot":
      return { command: "herdr_snapshot", args: {} };
    case "agent.focus":
      return paneId ? { command: "herdr_focus_agent", args: { paneId } } : { code: "bad-params", detail: "표면 식별자 없음" };
    case "agent.prompt": {
      const text = str(call.params["text"]);
      return paneId && text
        ? { command: "herdr_prompt_agent", args: { paneId, text } }
        : { code: "bad-params", detail: "표면 식별자 또는 본문 없음" };
    }
    case "pane.run": {
      const command = str(call.params["command"]);
      return paneId && command
        ? { command: "herdr_run_pane", args: { paneId, command } }
        : { code: "bad-params", detail: "표면 식별자 또는 명령 없음" };
    }
    case "pane.send_keys": {
      const keys = call.params["keys"];
      return paneId && Array.isArray(keys) && keys.length > 0
        ? { command: "herdr_send_keys", args: { paneId, keys: [...keys] } }
        : { code: "bad-params", detail: "표면 식별자 또는 키 없음" };
    }
    default:
      return { code: "method-not-open", detail: `이 슬라이스가 열지 않은 호출: ${call.method}` };
  }
}

export class EnvironmentDispatcher {
  constructor(
    private readonly commands: EnvironmentCommandPort,
    private readonly grants: DispatchGrants,
  ) {}

  /**
   * 전달. 하나라도 걸리면 명령을 만들지 않는다.
   * 환경이 던진 오류는 성공으로 바꾸지 않고 그대로 올린다.
   */
  async dispatch(call: EnvironmentCall): Promise<DispatchOutcome> {
    if (!isAllowed(call.method)) {
      return { ok: false, rejections: [{ code: "method-not-open", detail: `이 슬라이스가 열지 않은 호출: ${call.method}` }] };
    }
    if (!this.grants.workspaceObserve) {
      return { ok: false, rejections: [{ code: "observe-not-granted", detail: "워크스페이스 관측 권한이 없다" }] };
    }
    if (call.delivery === "terminal-input" && !this.grants.terminalInput) {
      return {
        ok: false,
        rejections: [
          {
            code: "terminal-input-not-granted",
            detail: "터미널 입력은 별도 권한이 필요하다 — 사용자가 직접 타이핑하는 것과 같은 일이다",
          },
        ],
      };
    }
    const invocation = toInvocation(call);
    if ("code" in invocation) return { ok: false, rejections: [invocation] };

    try {
      return { ok: true, result: await this.commands.invoke(invocation.command, invocation.args) };
    } catch (e) {
      return { ok: false, environmentError: e instanceof Error ? e.message : String(e) };
    }
  }
}
