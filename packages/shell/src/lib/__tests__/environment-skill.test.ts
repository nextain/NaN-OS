// #502 실배선 — skill_environment 실행기 단위 테스트 (FR-ENV-LIVE.3~5).
// deps 주입 = Tauri 없이 헤르메틱. 뇌가 읽는 결과 문자열이 실패를 성공처럼 말하지 않는지 본다.
import { describe, expect, it, vi } from "vitest";
import { EnvironmentSession } from "@nextain/naia-os-core/composition";
import {
	ENVIRONMENT_ACTIONS,
	SKILL_ENVIRONMENT,
	executeEnvironmentSkill,
	type EnvironmentSkillDeps,
} from "../environment-skill";

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
	opts: { terminalInput?: boolean; fail?: string } = {},
): EnvironmentSkillDeps & { calls: { command: string; args: unknown }[] } {
	const session = new EnvironmentSession();
	const calls: { command: string; args: unknown }[] = [];
	return {
		calls,
		session,
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

describe("도구 선언", () => {
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
		const out = await executeEnvironmentSkill({ action: "observe" }, d);
		expect(out).toContain("작업 표면 2개");
		expect(out).toContain("빌더");
		expect(out).not.toContain("p1"); // pane 어휘는 올라가지 않는다
	});

	it("표면이 없으면 없다고 말한다 — 빈 목록을 표면인 척하지 않는다", async () => {
		expect(await executeEnvironmentSkill({ action: "observe" }, deps([]))).toContain(
			"열려 있는 작업 표면이 없다",
		);
	});

	it("환경이 응답하지 않으면 관측 불가라고 말한다", async () => {
		const session = new EnvironmentSession();
		const out = await executeEnvironmentSkill(
			{ action: "observe" },
			{
				session,
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
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await executeEnvironmentSkill({ action: "focus", surface: token }, d);
		expect(out).toBe("전달됨: focus");
		expect(d.calls[0]?.command).toBe("herdr_focus_agent");
	});

	it("터미널 입력 권한이 없으면 거절이고 명령이 안 나간다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: false });
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await executeEnvironmentSkill({ action: "run", surface: token, request: "ls" }, d);
		expect(out).toContain("거절:");
		expect(out).toContain("terminal-input-not-granted");
		expect(d.calls).toHaveLength(0);
	});

	it("권한이 있으면 같은 요청이 나간다 — 거절이 권한 때문임을 증명한다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: true });
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await executeEnvironmentSkill({ action: "run", surface: token, request: "ls" }, d)).toBe(
			"전달됨: run",
		);
		expect(d.calls[0]?.command).toBe("herdr_run_pane");
	});

	it("환경 오류를 성공처럼 말하지 않는다", async () => {
		const d = deps([pane("p1", { agent: "codex" })], { fail: "herdr socket closed" });
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		const out = await executeEnvironmentSkill({ action: "focus", surface: token }, d);
		expect(out).toContain("환경 오류:");
		expect(out).toContain("herdr socket closed");
	});

	it("interrupt 가 도구 경로로도 실제 전송까지 간다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: true });
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await executeEnvironmentSkill({ action: "interrupt", surface: token }, d)).toBe(
			"전달됨: interrupt",
		);
		expect(d.calls[0]?.command).toBe("herdr_send_keys");
	});

	it("권한이 꺼져 있으면 interrupt 도 거절된다", async () => {
		const d = deps([pane("t1", { label: "zsh" })], { terminalInput: false });
		await executeEnvironmentSkill({ action: "observe" }, d);
		const token = d.session.latestReport()?.surfaces[0]?.ref.token as string;
		expect(await executeEnvironmentSkill({ action: "interrupt", surface: token }, d)).toContain(
			"거절:",
		);
		expect(d.calls).toHaveLength(0);
	});

	it("지어낸 손잡이는 환경에 닿지 못한다", async () => {
		const d = deps([pane("p1", { agent: "codex" })]);
		const out = await executeEnvironmentSkill({ action: "focus", surface: "s-999" }, d);
		expect(out).toContain("거절:");
		expect(d.calls).toHaveLength(0);
	});

	it("손잡이 없는 조작은 환경을 건드리기 전에 거절된다", async () => {
		const d = deps([pane("p1", { agent: "codex" })]);
		const refresh = vi.spyOn(d, "refresh");
		expect(await executeEnvironmentSkill({ action: "focus" }, d)).toContain("거절:");
		expect(refresh).not.toHaveBeenCalled();
	});

	it("모르는 동작은 거절한다", async () => {
		const out = await executeEnvironmentSkill({ action: "delete_everything" }, deps([]));
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
			refresh: async () => session.observeSnapshot({ panes } as never),
			commands: {
				invoke: async (command) => {
					calls.push(command);
					return {};
				},
			},
			grants: { workspaceObserve: true, terminalInput: true },
		};
		await executeEnvironmentSkill({ action: "observe" }, d);
		const gone = session.latestReport()?.surfaces.find((s) => s.label === "claude")?.ref.token as string;

		panes = [pane("p1", { agent: "codex" })]; // 그 사이 터미널이 닫혔다
		const out = await executeEnvironmentSkill({ action: "focus", surface: gone }, d);
		expect(out).toContain("거절:");
		expect(calls, "죽은 손잡이인데 명령이 나갔다").toHaveLength(0);
	});
});
