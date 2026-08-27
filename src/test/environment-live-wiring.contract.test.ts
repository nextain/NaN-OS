// #502 실배선 계약 테스트 (FR-ENV-LIVE.1·2·5, FR-ENV-STICKY.1~3).
//
// 왜 있는가: 관측·번역·전달이 각각 순수하게 있었지만 이어 주는 것이 없어서 프로덕션
// 호출자가 0이었다. 이 파일은 그 이음매(EnvironmentSession)가 실제로 이어 주는지,
// 그리고 이어 보고서야 드러난 손잡이 재사용 위험이 닫혔는지를 본다.
import { describe, it, expect } from "vitest";
import { EnvironmentSession, WATCH_TURN_BUDGET } from "../main/app/control/environment-session.js";
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
  it("지켜보는 동안에는 표면 목록이 세그먼트에 실린다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { label: "빌더", agent: "codex", status: "working" })] });
    session.watch();
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
    session.watch();
    expect(JSON.stringify(session.segment())).not.toContain("pane-abc-123");
  });
});

// 왜 이 블록이 있는가: 표면 목록을 요청마다 싣는 것은 두 가지 값을 치른다 — 토큰이 붙고,
// 사용자의 터미널 이름이 늘 뇌로 간다. 늘 필요한 정보가 아니므로 나이아가 스스로 켜고 끈다.
// 여기서 보는 것은 "켜고 끌 수 있다"가 아니라 "꺼져 있는 동안 실제로 아무것도 안 나간다"이다.
describe("주의를 나이아가 쥔다 (FR-ENV-ATTENTION.1~4) [UC-ENV-ATTENTION FR-ENV-ATTENTION.1 FR-ENV-ATTENTION.2 FR-ENV-ATTENTION.3 FR-ENV-ATTENTION.4]", () => {
  function watching(panes: unknown[]): EnvironmentSession {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes } as never);
    return session;
  }

  it("관측이 끊기면 마지막 목록을 계속 싣지 않는다 (FR-ENV-ATTENTION.6)", () => {
    // 한 번 성공한 뒤 Herdr 이 죽으면 갱신은 실패만 하고 옛 보고서가 남는다.
    // 그러면 이미 닫힌 터미널 이름이 계속 뇌로 가고, 죽은 손잡이가 살아 있어 보인다.
    const session = watching([pane("p1", { label: "사내-비밀-저장소" })]);
    session.watch();
    expect(session.segment()?.surfaces).toHaveLength(1);

    session.markUnavailable();
    expect(session.segment(), "환경이 끊겼는데 세그먼트가 남아 있다").toBeNull();
    expect(session.segment("always")).toBeNull();
    expect(session.latestReport()).toBeNull();
  });

  it("관측이 끊기면 그때까지 준 손잡이도 죽는다 (FR-ENV-ATTENTION.6)", async () => {
    // ⚠️ 대상은 반드시 focus 가 실제로 닿을 수 있는 표면이어야 한다. 에이전트 없는
    //    터미널을 쓰면 번역 단계에서 어차피 거절되어, 끊김과 무관하게 통과한다
    //    (2026-08-27 변이 탐침에서 실제로 그랬다).
    const session = watching([pane("p1", { label: "빌더", agent: "codex" })]);
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;

    const before = recorder();
    expect(
      (await session.act({ kind: "focus", surface: surfaceRef(token) }, before.port, ALL_GRANTS)).ok,
      "끊기기 전에도 안 닿는 손잡이라면 이 테스트는 공허하다",
    ).toBe(true);
    expect(before.calls).toHaveLength(1);

    const after = recorder();
    session.markUnavailable();
    const out = await session.act({ kind: "focus", surface: surfaceRef(token) }, after.port, ALL_GRANTS);
    expect(out.ok).toBe(false);
    expect(after.calls, "환경이 끊겼는데 명령이 나갔다").toHaveLength(0);
  });

  it("아무도 시키지 않았으면 지켜보지 않는다", () => {
    expect(new EnvironmentSession().watching()).toBe(false);
  });

  it("지켜보지 않는 동안 이름도 손잡이도 나가지 않는다 — 개수만 나간다", () => {
    const session = watching([pane("p1", { label: "사내-비밀-저장소" }), pane("p2", { label: "zsh" })]);
    const seg = session.segment();
    expect(seg?.surfaces).toEqual([]);
    expect(seg?.omitted).toBe(2);
    expect(JSON.stringify(seg)).not.toContain("사내-비밀-저장소");
  });

  it("개수는 상한에 걸려 못 실은 것까지 더한다 — 조용히 줄이지 않는다", () => {
    const session = new EnvironmentSession(2);
    session.observeSnapshot({ panes: [pane("p1"), pane("p2"), pane("p3"), pane("p4")] } as never);
    expect(session.segment()?.omitted).toBe(4);
  });

  it("watch 뒤에는 목록이 실리고 unwatch 뒤에는 다시 개수만 실린다", () => {
    const session = watching([pane("p1", { label: "빌더", agent: "codex" })]);
    session.watch();
    expect(session.segment()?.surfaces).toHaveLength(1);
    session.unwatch();
    expect(session.segment()?.surfaces).toEqual([]);
  });

  it("표면이 없으면 지켜보든 말든 세그먼트가 없다 — 개수 0 을 올려 단언하지 않는다", () => {
    const session = watching([]);
    session.watch();
    expect(session.segment()).toBeNull();
  });

  it("사용자가 off 로 두면 지켜보고 있어도 아무것도 실리지 않는다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch();
    expect(session.segment("off")).toBeNull();
  });

  it("사용자가 always 로 두면 지켜보지 않아도 목록이 실린다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    expect(session.watching()).toBe(false);
    expect(session.segment("always")?.surfaces).toHaveLength(1);
  });

  it("숨긴 개수와 잘린 개수를 구별한다 (FR-ENV-ATTENTION.8)", () => {
    // 뇌 입장에서 둘은 할 수 있는 일이 다르다. 잘린 것은 어쩔 수 없고,
    // 숨긴 것은 나이아가 직접 걷을 수 있다.
    const hidden = watching([pane("p1"), pane("p2")]);
    expect(hidden.segment()?.listWithheld, "숨긴 것인데 표시가 없다").toBe(true);

    const capped = new EnvironmentSession(1);
    capped.observeSnapshot({ panes: [pane("p1"), pane("p2"), pane("p3")] } as never);
    capped.watch();
    const seg = capped.segment();
    expect(seg?.surfaces).toHaveLength(1);
    expect(seg?.omitted).toBe(2);
    expect(seg?.listWithheld, "상한 절단인데 숨김으로 표시됐다").not.toBe(true);
  });

  it("지켜보기가 예산을 다 쓰면 저절로 풀린다 (FR-ENV-ATTENTION.7)", () => {
    // 나이아가 unwatch 를 부르리라고 기대하는 것으로는 비용도 노출도 보장되지 않는다.
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch();
    for (let i = 0; i < WATCH_TURN_BUDGET; i += 1) {
      session.noteTurn();
      expect(session.watching(), `${i + 1}번째 턴에서 벌써 풀렸다`).toBe(true);
      expect(session.segment()?.surfaces).toHaveLength(1);
    }
    session.noteTurn();
    expect(session.watching(), "예산을 다 썼는데 계속 지켜본다").toBe(false);
    expect(session.segment()?.surfaces).toEqual([]);
  });

  it("다시 watch 하면 예산이 새로 찬다 — 더 봐야 하면 다시 부르면 된다", () => {
    const session = watching([pane("p1")]);
    session.watch();
    for (let i = 0; i <= WATCH_TURN_BUDGET; i += 1) session.noteTurn();
    expect(session.watching()).toBe(false);
    session.watch();
    expect(session.watchTurnsRemaining()).toBe(WATCH_TURN_BUDGET);
    expect(session.segment()?.surfaces).toHaveLength(1);
  });

  it("지켜보지 않는 동안에는 턴이 흘러도 아무 일도 없다", () => {
    const session = watching([pane("p1")]);
    for (let i = 0; i < 100; i += 1) session.noteTurn();
    expect(session.watching()).toBe(false);
    expect(session.segment()?.omitted).toBe(1);
  });

  it("목록을 싣는 요청에는 숨김 키가 아예 없다 — 쓸모없는 바이트를 더하지 않는다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch();
    expect(Object.keys(session.segment() as object).sort()).toEqual(["kind", "omitted", "surfaces"]);
  });

  it("주인이 붙은 지켜보기는 그 주인만 끈다 (FR-ENV-ATTENTION.13)", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch("voice-1");
    session.unwatchIfOwner("voice-2");
    expect(session.watching(), "남의 표를 보고 껐다").toBe(true);
    session.unwatchIfOwner("voice-1");
    expect(session.watching()).toBe(false);
  });

  it("주인 없이 켠 지켜보기는 통화가 끄지 못한다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch(); // 텍스트 경로 — 주인 없음
    session.unwatchIfOwner("voice-1");
    expect(session.watching(), "텍스트가 켠 것을 통화가 껐다").toBe(true);
  });

  it("통화 중에 다른 경로가 다시 켜면 주인이 바뀐다 — 옛 통화가 지우지 못한다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch("voice-1");
    session.watch(); // 통화 도중 텍스트가 새로 켰다
    session.unwatchIfOwner("voice-1");
    expect(session.watching(), "통화가 자기 것이 아닌 지켜보기를 지웠다").toBe(true);
    expect(session.watchedBy()).toBeUndefined();
  });

  it("옛 통화의 늦은 종료가 새 통화의 지켜보기를 지우지 못한다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch("voice-1");
    session.watch("voice-2"); // 재연결
    session.unwatchIfOwner("voice-1"); // 옛 세션의 종료가 뒤늦게 도착
    expect(session.watching(), "옛 세션이 새 세션의 것을 지웠다").toBe(true);
    expect(session.watchedBy()).toBe("voice-2");
  });

  it("예산으로 저절로 풀리면 주인 표도 사라진다", () => {
    const session = watching([pane("p1", { label: "빌더" })]);
    session.watch("voice-1");
    for (let i = 0; i <= WATCH_TURN_BUDGET; i += 1) session.noteTurn();
    expect(session.watching()).toBe(false);
    expect(session.watchedBy(), "꺼졌는데 주인 표가 남았다").toBeUndefined();
  });

  it("지켜보기는 조작 권한과 무관하다 — 주의는 권한이 아니다", async () => {
    const session = watching([pane("t1", { label: "zsh" })]);
    session.watch();
    const token = session.latestReport()?.surfaces[0]?.ref.token as string;
    const rec = recorder();
    const out = await session.act({ kind: "run", surface: surfaceRef(token), request: "ls" }, rec.port, {
      workspaceObserve: true,
      terminalInput: false,
    });
    expect(out.ok).toBe(false);
    expect(rec.calls, "지켜본다고 터미널 입력이 열렸다").toHaveLength(0);
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

describe("비용이 실제로 줄었는가 (FR-ENV-ATTENTION.15)", () => {
  // 지금까지의 테스트는 "스위치가 젖혀지는가"만 잰다. 사용자가 지적한 것은 비용이므로,
  // 줄어든 양을 직접 재는 것이 하나는 있어야 한다. 재지 않으면 "줄였다"는 말은 주장일 뿐이다.
  const MANY = Array.from({ length: 12 }, (_, i) =>
    pane(`p${i}`, { label: `사내-저장소-${i}-빌드-감시`, agent: i % 2 === 0 ? "codex" : undefined }),
  );

  function bytesOf(seg: unknown): number {
    return new TextEncoder().encode(JSON.stringify(seg)).length;
  }

  // ⚠️ 임계는 실측치에 바짝 붙인다. "20% 미만" 같은 느슨한 조건은 3배 부풀어도 통과하므로
  //    요구사항이 적어 둔 93.5% 감소를 지키지 못한다(2026-08-27 14차 적대리뷰 지적).
  //    아래 상수는 이 고정 표본에서 실제로 측정된 값이다. 바뀌면 왜 바뀌었는지 적어야 한다.
  const MEASURED_FULL = 1187;
  const MEASURED_WITHHELD = 77;
  const MEASURED_ALWAYS_40 = 47_480;
  const MEASURED_AUTO_40 = 13_070;
  // 표본(라벨 포함)이 이 파일 안에서 고정되므로 폭이 넓을 이유가 없다. 8% 는 수십~수백
  // 바이트를 조용히 통과시킨다(2026-08-28 실측). 표본이나 형태를 바꾸면 이 상수도 함께
  // 고쳐야 한다 — 그것이 이 게이트의 뜻이다.
  const TOLERANCE = 0.02;

  /**
   * 실측치 주변으로 **위아래 모두** 묶는다.
   *
   * 한쪽만 묶으면 반대 방향의 회귀가 그대로 통과한다 — 목록 쪽에 상한이 없으면 부가 필드를
   * 얼마든지 더할 수 있고, 총량 쪽에 하한이 없으면 예산을 줄여 수치만 좋게 만들 수 있다.
   * 두 경우 다 "줄였다"는 주장과 무관한 변화이고, 그것이 조용히 지나가면 이 측정은
   * 지키는 것이 없다 (2026-08-27 15차 적대리뷰 지적).
   */
  function pinned(actual: number, measured: number, what: string): void {
    expect(actual, `${what}가 부풀었다: ${actual} (실측 ${measured})`).toBeLessThanOrEqual(
      Math.ceil(measured * (1 + TOLERANCE)),
    );
    expect(actual, `${what}가 줄었다: ${actual} (실측 ${measured})`).toBeGreaterThanOrEqual(
      Math.floor(measured * (1 - TOLERANCE)),
    );
  }

  it("지켜보지 않는 동안의 세그먼트 크기가 실측치에 머문다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: MANY } as never);
    pinned(bytesOf(session.segment("auto")), MEASURED_WITHHELD, "숨김 세그먼트");
    pinned(bytesOf(session.segment("always")), MEASURED_FULL, "목록 세그먼트");
  });

  it("한 대화에서 실제로 오가는 총량을 잰다 — 지켜보기는 예산만큼만 비싸다", () => {
    const TURNS = 40;
    const always = new EnvironmentSession();
    const auto = new EnvironmentSession();
    let alwaysBytes = 0;
    let autoBytes = 0;
    always.observeSnapshot({ panes: MANY } as never);
    auto.observeSnapshot({ panes: MANY } as never);
    auto.watch(); // 나이아가 한 번 켠 뒤 잊었다 — 최악의 경우
    for (let t = 0; t < TURNS; t += 1) {
      alwaysBytes += bytesOf(always.segment("always"));
      autoBytes += bytesOf(auto.segment("auto"));
      always.noteTurn();
      auto.noteTurn();
    }
    // 실측치: always 47480 / auto 13070 (72.5% 감소). 둘 다 위아래로 묶는다.
    pinned(alwaysBytes, MEASURED_ALWAYS_40, "40턴 always 총량");
    pinned(autoBytes, MEASURED_AUTO_40, "40턴 auto 총량");
    // 감소율 자체도 확인한다 — 두 값이 같이 움직여 비율만 유지되는 경우를 막는다.
    expect(1 - autoBytes / alwaysBytes).toBeGreaterThan(0.7);
  });

  it("지켜보지 않는 동안에는 터미널 이름이 한 글자도 나가지 않는다", () => {
    const session = new EnvironmentSession();
    const report = session.observeSnapshot({ panes: MANY } as never);
    const wire = JSON.stringify(session.segment("auto"));
    for (const s of report.surfaces) {
      expect(wire).not.toContain(s.label);
    }
  });
});

describe("always 는 예산과 무관하다 — 출력만이 아니라 상태도 (FR-ENV-ATTENTION.7)", () => {
  // always 를 쓰는 동안 잠복한 지켜보기가 소진되면, 사용자가 auto 로 되돌릴 때
  // 나이아가 끈 적 없는데 목록이 사라진다 (2026-08-27 13차 적대리뷰 지적).
  // 셸은 always 에서 noteTurn 을 부르지 않는다. 그 규칙이 실제로 상태를 지키는지 본다.
  it("always 동안 턴을 세지 않으면 auto 로 돌아왔을 때 지켜보기가 남아 있다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { label: "빌더", agent: "codex" })] } as never);
    session.watch();
    // always 구간 — 셸이 noteTurn 을 부르지 않는다.
    for (let t = 0; t < WATCH_TURN_BUDGET * 3; t += 1) {
      expect(session.segment("always")?.surfaces).toHaveLength(1);
    }
    // auto 로 되돌아왔다.
    expect(session.watching(), "always 를 쓰는 동안 잠복한 지켜보기가 사라졌다").toBe(true);
    expect(session.segment("auto")?.surfaces).toHaveLength(1);
  });

  it("auto 로 돌아온 뒤에는 예산이 정상으로 흐른다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot({ panes: [pane("p1", { label: "빌더", agent: "codex" })] } as never);
    session.watch();
    for (let t = 0; t <= WATCH_TURN_BUDGET; t += 1) session.noteTurn();
    expect(session.watching(), "auto 에서는 예산이 흘러야 한다").toBe(false);
  });
});
