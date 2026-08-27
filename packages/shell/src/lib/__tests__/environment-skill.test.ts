// #502 실배선 — skill_environment 실행기 단위 테스트 (FR-ENV-LIVE.3~5).
// deps 주입 = Tauri 없이 헤르메틱. 뇌가 읽는 결과 문자열이 실패를 성공처럼 말하지 않는지 본다.
import { describe, expect, it, vi } from "vitest";
import { EnvironmentSession, WATCH_TURN_BUDGET, type EnvironmentAwareness } from "@nextain/naia-os-core/composition";
import {
	ENVIRONMENT_ACTIONS,
	SKILL_ENVIRONMENT,
	executeEnvironmentSkill,
	type EnvironmentSkillDeps,
} from "../environment-skill";

/** 결과 문자열만 보는 테스트용 얇은 감싸개. 성공 여부를 보는 테스트는 원본을 직접 부른다. */
async function runSkill(
	args: Record<string, unknown>,
	deps: EnvironmentSkillDeps,
): Promise<string> {
	return (await executeEnvironmentSkill(args, deps)).text;
}

function pane(id: string, opts: { label?: string; agent?: string; focused?: boolean } = {}) {
	return {
		pane_id: id,
		...(opts.label !== undefined ? { label: opts.label } : {}),
		...(opts.agent !== undefined ? { agent: opts.agent } : {}),
		focused: opts.focused === true,
	};
}

function deps(
	panes: unknown[],
	opts: {
		terminalInput?: boolean;
		fail?: string;
		awareness?: EnvironmentAwareness;
		segmentsRideRequests?: boolean;
	} = {},
): EnvironmentSkillDeps & { calls: { command: string; args: unknown }[] } {
	const session = new EnvironmentSession();
	const calls: { command: string; args: unknown }[] = [];
	return {
		calls,
		session,
		awareness: opts.awareness ?? "auto",
		segmentsRideRequests: opts.segmentsRideRequests === true,
		refresh: async () => session.observeSnapshot({ panes } as never),
		commands: {
			invoke: async (command, args) => {
				if (opts.fail) throw new Error(opts.fail);
				calls.push({ command, args });
				return { ok: true };
			},
		},
		grants: { workspaceObserve: true, terminalInput: opts.terminalInput === true },
	};
}

describe("도구 선언 [UC-ENV-LIVE-ACT UC-ENV-LIVE-OBSERVE]", () => {
	it("이름과 동작 목록이 실제 구현과 같다", () => {
		expect(SKILL_ENVIRONMENT.name).toBe("skill_environment");
		expect(SKILL_ENVIRONMENT.parameters?.properties?.action).toMatchObject({
			enum: [...ENVIRONMENT_ACTIONS],
		});
	});

	it("표면 손잡이를 지어내지 말라고 명시한다", () => {
		expect(SKILL_ENVIRONMENT.description).toContain("지어내지 않는다");
	});
});

describe("observe (FR-ENV-LIVE.1)", () => {
	it("표면 목록을 손잡이와 함께 낸다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" }), pane("p2", { label: "zsh" })]);
		const out = await runSkill({ action: "observe" }, d);
		expect(out).toContain("작업 표면 2개");
		expect(out).toContain("빌더");
		expect(out).not.toContain("p1"); // pane 어휘는 올라가지 않는다
	});

	it("표면이 없으면 없다고 말한다 — 빈 목록을 표면인 척하지 않는다", async () => {
		expect(await runSkill({ action: "observe" }, deps([]))).toContain(
			"열려 있는 작업 표면이 없다",
		);
	});

	it("환경이 응답하지 않으면 관측 불가라고 말한다", async () => {
		const session = new EnvironmentSession();
		const out = await runSkill(
			{ action: "observe" },
			{
				session,
				awareness: "auto",
				segmentsRideRequests: true,
				refresh: async () => null, // 스냅샷 실패 = 관측 갱신 없음
				commands: { invoke: async () => ({}) },
				grants: { workspaceObserve: true, terminalInput: false },
			},
		);
		expect(out).toContain("관측 불가");
	});
});

describe("조작 (FR-ENV-LIVE.3~5)", () => {
	it("focus 가 실제 명령까지 간다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await runSkill({ action: "focus", surface: token }, d);
		expect(out).toBe("전달됨: focus");
		expect(d.calls[0]?.command).toBe("herdr_focus_agent");
	});

	it("터미널 입력 권한이 없으면 거절이고 명령이 안 나간다 (FR-ENV-LIVE.4)", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: false });
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await runSkill({ action: "run", surface: token, request: "ls" }, d);
		expect(out).toContain("거절:");
		expect(out).toContain("terminal-input-not-granted");
		expect(d.calls).toHaveLength(0);
	});

	it("권한이 있으면 같은 요청이 나간다 — 거절이 권한 때문임을 증명한다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: true });
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await runSkill({ action: "run", surface: token, request: "ls" }, d)).toBe(
			"전달됨: run",
		);
		expect(d.calls[0]?.command).toBe("herdr_run_pane");
	});

	it("환경 오류를 성공처럼 말하지 않는다 (FR-ENV-LIVE.5)", async () => {
		const d = deps([pane("p1", { agent: "codex" })], { fail: "herdr socket closed" });
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await runSkill({ action: "focus", surface: token }, d);
		expect(out).toContain("환경 오류:");
		expect(out).toContain("herdr socket closed");
	});

	it("interrupt 가 도구 경로로도 실제 전송까지 간다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: true });
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await runSkill({ action: "interrupt", surface: token }, d)).toBe(
			"전달됨: interrupt",
		);
		expect(d.calls[0]?.command).toBe("herdr_send_keys");
	});

	it("권한이 꺼져 있으면 interrupt 도 거절된다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: false });
		await runSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await runSkill({ action: "interrupt", surface: token }, d)).toContain(
			"거절:",
		);
		expect(d.calls).toHaveLength(0);
	});

	it("지어낸 손잡이는 환경에 닿지 못한다", async () => {
		const d = deps([pane("p1", { agent: "codex" })]);
		const out = await runSkill({ action: "focus", surface: "s-999" }, d);
		expect(out).toContain("거절:");
		expect(d.calls).toHaveLength(0);
	});

	it("손잡이 없는 조작은 환경을 건드리기 전에 거절된다", async () => {
		const d = deps([pane("p1", { agent: "codex" })]);
		const refresh = vi.spyOn(d, "refresh");
		expect(await runSkill({ action: "focus" }, d)).toContain("거절:");
		expect(refresh).not.toHaveBeenCalled();
	});

	it("모르는 동작은 거절한다", async () => {
		const out = await runSkill({ action: "delete_everything" }, deps([]));
		expect(out).toContain("모르는 동작");
	});
});

describe("조작 전 관측 갱신 (FR-ENV-STICKY.2)", () => {
	it("사이에 표면이 사라졌으면 그 손잡이는 거절된다", async () => {
		const session = new EnvironmentSession();
		const calls: unknown[] = [];
		let panes: unknown[] = [pane("p1", { agent: "codex" }), pane("p2", { agent: "claude" })];
		const d: EnvironmentSkillDeps = {
			session,
			awareness: "auto",
			segmentsRideRequests: true,
			refresh: async () => session.observeSnapshot({ panes } as never),
			commands: {
				invoke: async (command) => {
					calls.push(command);
					return {};
				},
			},
			grants: { workspaceObserve: true, terminalInput: true },
		};
		await runSkill({ action: "observe" }, d);
		const gone = session.latestReport()?.surfaces.find((s) => s.label === "claude")?.ref.token as string;

		panes = [pane("p1", { agent: "codex" })]; // 그 사이 터미널이 닫혔다
		const out = await runSkill({ action: "focus", surface: gone }, d);
		expect(out).toContain("거절:");
		expect(calls, "죽은 손잡이인데 명령이 나갔다").toHaveLength(0);
	});
});

describe("나이아가 스스로 켜고 끈다 (FR-ENV-ATTENTION.1~3)", () => {
	it("기본은 안 지켜보는 상태다 — 아무도 시키지 않았는데 목록이 실리지 않는다", () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		expect(d.session.watching()).toBe(false);
	});

	it("watch 가 다음 요청부터 목록을 싣게 만든다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		await runSkill({ action: "observe" }, d);
		expect(d.session.segment("auto")?.surfaces, "지켜보기 전인데 목록이 실렸다").toEqual([]);

		const out = await runSkill({ action: "watch" }, d);
		expect(out).toContain("지켜본다");
		expect(d.session.watching()).toBe(true);
		expect(d.session.segment("auto")?.surfaces).toHaveLength(1);
	});

	it("watch 가 목록을 같이 준다 — 지켜보려고 두 번 부르지 않게", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		const out = await runSkill({ action: "watch" }, d);
		expect(out).toContain("빌더");
		expect(out).toContain("작업 표면 1개");
	});

	it("unwatch 가 다시 개수만 싣는 상태로 되돌린다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], {
			segmentsRideRequests: true,
		});
		await runSkill({ action: "watch" }, d);
		const out = await runSkill({ action: "unwatch" }, d);
		expect(out).toContain("개수만");
		expect(d.session.watching()).toBe(false);
		expect(d.session.segment("auto")?.surfaces).toEqual([]);
	});

	it("지켜보지 않는 동안에도 개수는 알려 준다 — 볼 것이 있다는 사실은 알아야 부를 수 있다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" }), pane("p2", { label: "zsh" })]);
		await runSkill({ action: "observe" }, d);
		const seg = d.session.segment("auto");
		expect(seg?.omitted).toBe(2);
		expect(seg?.surfaces).toEqual([]);
	});

	it("지켜보지 않는 동안에는 이름도 손잡이도 나가지 않는다", async () => {
		const d = deps([pane("p1", { label: "비밀사내프로젝트", agent: "codex" })]);
		await runSkill({ action: "observe" }, d);
		expect(JSON.stringify(d.session.segment("auto"))).not.toContain("비밀사내프로젝트");
	});

	it("표면이 아예 없으면 지켜보든 말든 세그먼트를 만들지 않는다", async () => {
		const d = deps([]);
		await runSkill({ action: "watch" }, d);
		expect(d.session.segment("auto")).toBeNull();
	});

	it("지켜보기는 조작을 열지 않는다 — 권한은 그대로다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: false });
		await runSkill({ action: "watch" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await runSkill({ action: "run", surface: token, request: "ls" }, d);
		expect(out).toContain("거절:");
		expect(d.calls, "지켜본다고 터미널 입력이 열렸다").toHaveLength(0);
	});

	it("도구 설명이 계속 켜 두는 값을 알려 준다 — 모르면 끄지 않는다", () => {
		expect(SKILL_ENVIRONMENT.description).toContain("unwatch");
		expect(SKILL_ENVIRONMENT.description).toContain("터미널 이름이 실린다");
	});
});

describe("사용자 설정이 나이아를 이긴다 (FR-ENV-ATTENTION.4)", () => {
	it("off 면 관측도 조작도 거절이다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], { awareness: "off" });
		expect(await runSkill({ action: "observe" }, d)).toContain("꺼 두었다");
		expect(await runSkill({ action: "watch" }, d)).toContain("꺼 두었다");
		expect(d.session.watching(), "꺼 두었는데 지켜보기가 켜졌다").toBe(false);
	});

	it("off 면 표면이 있어도 세그먼트를 만들지 않는다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		await runSkill({ action: "observe" }, d);
		d.session.watch();
		expect(d.session.segment("off")).toBeNull();
	});

	it("always 면 나이아가 끄지 못한다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], { awareness: "always" });
		const out = await runSkill({ action: "unwatch" }, d);
		expect(out).toContain("무시됨");
		await runSkill({ action: "observe" }, d);
		expect(d.session.segment("always")?.surfaces).toHaveLength(1);
	});

	it("always 는 지켜보기 상태와 무관하게 목록을 싣는다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], { awareness: "always" });
		await runSkill({ action: "observe" }, d);
		expect(d.session.watching()).toBe(false);
		expect(d.session.segment("always")?.surfaces).toHaveLength(1);
	});
});

describe("환경이 끊기면 옛것을 계속 보여 주지 않는다 (FR-ENV-ATTENTION.6)", () => {
	it("스냅샷 실패가 마지막 관측을 지운다", async () => {
		const session = new EnvironmentSession();
		let ok = true;
		const d: EnvironmentSkillDeps = {
			session,
			awareness: "auto",
			segmentsRideRequests: true,
			refresh: async () => {
				if (!ok) {
					// 라이브 refreshEnvironment 가 하는 것과 같다 — 실패하면 모르는 상태로 되돌린다.
					session.markUnavailable();
					return null;
				}
				return session.observeSnapshot({ panes: [pane("p1", { label: "빌더", agent: "codex" })] } as never);
			},
			commands: { invoke: async () => ({}) },
			grants: { workspaceObserve: true, terminalInput: false },
		};
		await runSkill({ action: "watch" }, d);
		expect(session.segment("auto")?.surfaces).toHaveLength(1);

		ok = false;
		const out = await runSkill({ action: "observe" }, d);
		expect(out).toContain("관측 불가");
		expect(session.segment("auto"), "환경이 끊겼는데 세그먼트가 남았다").toBeNull();
	});
});

describe("지켜보기가 저절로 풀린다 (FR-ENV-ATTENTION.7)", () => {
	it("나이아가 끄지 않아도 예산을 다 쓰면 목록이 빠진다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		await runSkill({ action: "watch" }, d);
		for (let i = 0; i < WATCH_TURN_BUDGET; i += 1) d.session.noteTurn();
		expect(d.session.segment("auto")?.surfaces).toHaveLength(1);
		d.session.noteTurn();
		expect(d.session.segment("auto")?.surfaces, "켜 둔 채 잊었는데 목록이 계속 실린다").toEqual([]);
	});

	it("always 는 예산과 무관하다 — 사용자가 정한 것은 저절로 풀리지 않는다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], { awareness: "always" });
		await runSkill({ action: "observe" }, d);
		for (let i = 0; i < WATCH_TURN_BUDGET + 5; i += 1) d.session.noteTurn();
		expect(d.session.segment("always")?.surfaces).toHaveLength(1);
	});
});

describe("경로가 못 하는 것을 한다고 말하지 않는다 (FR-ENV-ATTENTION.10)", () => {
	it("요청마다 목록을 싣지 않는 경로에서는 watch 가 그 사실을 알린다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]);
		const out = await runSkill({ action: "watch" }, d);
		expect(out).toContain("요청마다 목록을 싣지 않는다");
		expect(out, "못 하는 것을 한다고 말했다").not.toContain("다음 요청부터 목록이 실린다");
		// 그래도 지금 목록은 준다 — 알려 줄 수 있는 것까지 막지 않는다.
		expect(out).toContain("빌더");
		expect(d.session.watching()).toBe(true);
	});

	it("목록을 싣는 경로에서는 그대로 약속한다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], {
			segmentsRideRequests: true,
		});
		const out = await runSkill({ action: "watch" }, d);
		expect(out).toContain("다음 요청부터 목록이 실린다");
	});

	it("환경이 응답하지 않아도 경로 사실은 그대로 말한다", async () => {
		const session = new EnvironmentSession();
		const out = await runSkill(
			{ action: "watch" },
			{
				session,
				awareness: "auto",
				segmentsRideRequests: false,
				refresh: async () => null,
				commands: { invoke: async () => ({}) },
				grants: { workspaceObserve: true, terminalInput: false },
			},
		);
		expect(out).toContain("요청마다 목록을 싣지 않는다");
		expect(out).toContain("응답하지 않는다");
	});
});

describe("성공 여부를 문자열에서 되짚지 않는다 (FR-ENV-LIVE.5 FR-ENV-ATTENTION.11)", () => {
	// 접두사로 판정하면 새 사유가 생길 때마다 조용히 성공으로 새어 나간다.
	// 실제로 "무시됨:"과 "관측 불가:"가 그렇게 새고 있었다(11차 적대리뷰 지적).
	it("always 에서 거부된 unwatch 는 성공이 아니다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], { awareness: "always" });
		const r = await executeEnvironmentSkill({ action: "unwatch" }, d);
		expect(r.text).toContain("무시됨");
		expect(r.ok, "상태가 안 바뀌었는데 성공이라고 보고했다").toBe(false);
	});

	it("관측 불가는 성공이 아니다", async () => {
		const session = new EnvironmentSession();
		const r = await executeEnvironmentSkill(
			{ action: "observe" },
			{
				session,
				awareness: "auto",
				segmentsRideRequests: true,
				refresh: async () => null,
				commands: { invoke: async () => ({}) },
				grants: { workspaceObserve: true, terminalInput: false },
			},
		);
		expect(r.text).toContain("관측 불가");
		expect(r.ok, "아무것도 못 봤는데 성공이라고 보고했다").toBe(false);
	});

	it("지켜보기는 켜졌지만 볼 것을 못 받았으면 성공이 아니다", async () => {
		const session = new EnvironmentSession();
		const r = await executeEnvironmentSkill(
			{ action: "watch" },
			{
				session,
				awareness: "auto",
				segmentsRideRequests: true,
				refresh: async () => null,
				commands: { invoke: async () => ({}) },
				grants: { workspaceObserve: true, terminalInput: false },
			},
		);
		expect(r.ok, "절반만 된 것을 성공이라고 보고했다").toBe(false);
	});

	it("실제로 된 것은 성공이다 — 전부 실패로 만들어 통과하지 않는다", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })], {
			segmentsRideRequests: true,
		});
		expect((await executeEnvironmentSkill({ action: "observe" }, d)).ok).toBe(true);
		expect((await executeEnvironmentSkill({ action: "watch" }, d)).ok).toBe(true);
		expect((await executeEnvironmentSkill({ action: "unwatch" }, d)).ok).toBe(true);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect((await executeEnvironmentSkill({ action: "focus", surface: token }, d)).ok).toBe(true);
	});

	it("모르는 경로는 겸손한 쪽으로 틀린다 — 기본값이 거짓 약속을 만들지 않는다 (FR-ENV-ATTENTION.12)", async () => {
		const d = deps([pane("p1", { label: "빌더", agent: "codex" })]); // 경로 미지정
		const out = await runSkill({ action: "watch" }, d);
		expect(out, "모르는 경로인데 실린다고 약속했다").not.toContain("다음 요청부터 목록이 실린다");
	});
});
