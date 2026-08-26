// #502 실배선 계약 테스트 (FR-ENV-LIVE.1·2·5, FR-ENV-STICKY.1~3).
//
// 왜 있는가: 관측·번역·전달이 각각 순수하게 있었지만 이어 주는 것이 없어서 프로덕션
// 호출자가 0이었다. 이 파일은 그 이음매(EnvironmentSession)가 실제로 이어 주는지,
// 그리고 이어 보고서야 드러난 손잡이 재사용 위험이 닫혔는지를 본다.
import { describe, it, expect } from "vitest";
import { EnvironmentSession } from "../main/app/control/environment-session.js";
import { surfaceRef } from "../main/domain/environment-intent.js";
import type { EnvironmentCommandPort } from "../main/ports/environment-dispatch.js";

/** pane 하나. Herdr 스냅샷에서 이 슬라이스가 읽는 필드만. */
function pane(id: string, opts: { label?: string; agent?: string; status?: string; focused?: boolean } = {}) {
  return {
    pane_id: id,
    ...(opts.label !== undefined ? { label: opts.label } : {}),
    ...(opts.agent !== undefined ? { agent: opts.agent } : {}),
    ...(opts.status !== undefined ? { agent_status: opts.status } : {}),
    focused: opts.focused === true,
  };
}

function recorder(): { port: EnvironmentCommandPort; calls: { command: string; args: unknown }[] } {
  const calls: { command: string; args: unknown }[] = [];
  return {
    calls,
    port: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        return { ok: true };
      },
    },
  };
}

const ALL_GRANTS = { workspaceObserve: true, terminalInput: true };

describe("관측이 대화에 실린다 (FR-ENV-LIVE.1·2) [UC-ENV-LIVE-OBSERVE UC-ENV-STICKY FR-ENV-LIVE.2 FR-ENV-STICKY.2 FR-ENV-STICKY.3]", () => {
  it("표면이 있으면 세그먼트를 만든다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { label: "빌더", agent: "codex", status: "working" })] });
    const seg = session.segment();
    expect(seg?.kind).toBe("environmentSurfaces");
    expect(seg?.surfaces).toHaveLength(1);
    expect(seg?.surfaces[0]?.label).toBe("빌더");
  });

  it("아직 관측한 적 없으면 세그먼트를 만들지 않는다", () => {
    expect(new EnvironmentSession().segment()).toBeNull();
  });

  it("표면이 하나도 없으면 세그먼트를 만들지 않는다 — 빈 목록으로 단언하지 않는다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [] });
    expect(session.segment()).toBeNull();
  });

  it("Herdr 형태가 어긋나도 터지지 않고 아무것도 모르는 상태가 된다", () => {
    const session = new EnvironmentSession();
    expect(() => session.observeSnapshot({ panes: "이건 배열이 아니다" } as never)).not.toThrow();
    expect(session.segment()).toBeNull();
  });

  it("세그먼트에 pane 어휘가 실리지 않는다 — 손잡이만 올라간다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("pane-abc-123", { label: "zsh" })] });
    expect(JSON.stringify(session.segment())).not.toContain("pane-abc-123");
  });
});

describe("손잡이가 표면에 고정된다 (FR-ENV-STICKY.1~3)", () => {
  it("표면 하나가 사라져도 나머지 손잡이가 옮겨 가지 않는다", () => {
    // 이것이 실배선에서 드러난 위험이다. 순서로 발행하면 p3 의 손잡이가 p2 를 가리키게 된다.
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1"), pane("p2"), pane("p3")] });
    const before = new Map(session.latestReport()?.surfaces.map((s) => [s.ref.token, s.label]));

    session.observeSnapshot({ panes: [pane("p1"), pane("p3")] });
    for (const s of session.latestReport()?.surfaces ?? []) {
      expect(before.get(s.ref.token), `손잡이 ${s.ref.token} 이 다른 표면으로 옮겨 갔다`).toBe(s.label);
    }
  });

  it("사라진 표면의 손잡이로 온 의도는 거절된다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" }), pane("p2", { agent: "claude" })] });
    const gone = session.latestReport()?.surfaces.find((s) => s.label === "claude")?.ref.token;
    expect(gone).toBeDefined();

    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" })] });
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "focus", surface: surfaceRef(gone as string) }, port, ALL_GRANTS);

    expect(outcome.ok).toBe(false);
    expect(calls, "죽은 손잡이인데 환경에 명령이 나갔다").toHaveLength(0);
    if (!outcome.ok && "rejections" in outcome) {
      expect(outcome.rejections[0]?.code).toBe("unknown-surface");
    }
  });

  it("목록 순서가 바뀌어도 손잡이는 그대로다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { label: "하나" }), pane("p2", { label: "둘", focused: true })] });
    const first = new Map(session.latestReport()?.surfaces.map((s) => [s.label, s.ref.token]));
    // 주시 대상이 바뀌면 표시 순서가 뒤집힌다.
    session.observeSnapshot({ panes: [pane("p1", { label: "하나", focused: true }), pane("p2", { label: "둘" })] });
    for (const s of session.latestReport()?.surfaces ?? []) {
      expect(s.ref.token).toBe(first.get(s.label));
    }
  });

  it("표면이 다시 나타나도 원래 손잡이를 되찾는다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1"), pane("p2")] });
    const p2 = session.latestReport()?.surfaces.find((s) => s.label === "p2")?.ref.token;
    session.observeSnapshot({ panes: [pane("p1")] });
    session.observeSnapshot({ panes: [pane("p1"), pane("p2")] });
    expect(session.latestReport()?.surfaces.find((s) => s.label === "p2")?.ref.token).toBe(p2);
  });

  it("사라진 표면의 손잡이를 새 표면에 물려주지 않는다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1"), pane("p2")] });
    const issued = new Set((session.latestReport()?.surfaces ?? []).map((s) => s.ref.token));
    session.observeSnapshot({ panes: [pane("p1")] });
    session.observeSnapshot({ panes: [pane("p1"), pane("p9")] });
    const p9 = session.latestReport()?.surfaces.find((s) => s.label === "p9")?.ref.token;
    expect(issued.has(p9 as string), "죽은 손잡이가 새 표면에 재사용됐다").toBe(false);
  });
});

describe("조작이 실제 명령까지 간다 (FR-ENV-LIVE.3·5)", () => {
  it("에이전트가 붙은 표면 포커스가 명령으로 나간다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "focus", surface: surfaceRef(token) }, port, ALL_GRANTS);
    expect(outcome.ok).toBe(true);
    expect(calls[0]?.command).toBe("herdr_focus_agent");
    expect(calls[0]?.args).toEqual({ paneId: "p1" });
  });

  it("일반 터미널 실행이 pane.run 으로 나간다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("t1", { label: "zsh" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "run", surface: surfaceRef(token), request: "ls" }, port, ALL_GRANTS);
    expect(outcome.ok).toBe(true);
    expect(calls[0]?.command).toBe("herdr_run_pane");
    expect(calls[0]?.args).toEqual({ paneId: "t1", command: "ls" });
  });

  it("터미널 입력 권한이 없으면 명령을 만들지 않는다 (FR-ENV-LIVE.4)", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("t1", { label: "zsh" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    const outcome = await session.act(
      { kind: "run", surface: surfaceRef(token), request: "rm -rf /" },
      port,
      { workspaceObserve: true, terminalInput: false },
    );
    expect(outcome.ok).toBe(false);
    expect(calls, "권한이 없는데 환경에 명령이 나갔다").toHaveLength(0);
  });

  it("interrupt 가 실제 키 전송까지 간다", async () => {
    // 이 경로는 배선 감사 전까지 어디에서도 검증되지 않았다(2026-08-26). 하필 키 표기법이
    // 실제 환경에서 확인되지 않은(verified:false) 경로라, 안 밟아 보면 형태조차 모른다.
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("t1", { label: "zsh" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "interrupt", surface: surfaceRef(token) }, port, ALL_GRANTS);
    expect(outcome.ok).toBe(true);
    expect(calls[0]?.command).toBe("herdr_send_keys");
    expect(calls[0]?.args).toEqual({ paneId: "t1", keys: ["C-c"] });
  });

  it("interrupt 도 터미널 입력 권한을 요구한다 — 멈추는 것도 타이핑이다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("t1", { label: "zsh" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "interrupt", surface: surfaceRef(token) }, port, {
      workspaceObserve: true,
      terminalInput: false,
    });
    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("에이전트가 붙은 표면도 interrupt 는 키로 간다 — 구조화 경로가 없다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const { port, calls } = recorder();
    await session.act({ kind: "interrupt", surface: surfaceRef(token) }, port, ALL_GRANTS);
    expect(calls[0]?.command).toBe("herdr_send_keys");
  });

  it("환경이 던진 오류를 성공으로 바꾸지 않는다 (FR-ENV-LIVE.5)", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" })] });
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const failing: EnvironmentCommandPort = {
      invoke: async () => {
        throw new Error("herdr socket closed");
      },
    };
    const outcome = await session.act({ kind: "focus", surface: surfaceRef(token) }, failing, ALL_GRANTS);
    expect(outcome.ok).toBe(false);
    expect(outcome).toHaveProperty("environmentError", "herdr socket closed");
  });

  it("뇌가 지어낸 손잡이는 환경에 닿지 못한다", async () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { agent: "codex" })] });
    const { port, calls } = recorder();
    const outcome = await session.act({ kind: "focus", surface: surfaceRef("s-999") }, port, ALL_GRANTS);
    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
