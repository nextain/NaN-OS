// 세션 경계 회수는 윈도우에서도 자식 **트리**를 내린다.
//
// 왜 이 테스트가 있는가: 리눅스 회수(c5db4130)는 `/proc/<pid>/cmdline` 로 표식을 보고
// `process.kill` 로 끝낸다. 윈도우에서 `process.kill` 은 **그 프로세스 하나만** 끝내는데
// 에이전트는 자식 node 를 더 띄우므로 손자가 남는다. 실제로 win-rtx4060 에 e2e
// 고아 agent node 가 남으면 전체 실행의 전제가 무너질 수 있다.
//
// 이 기계는 리눅스라 진짜 윈도우 실행으로는 잴 수 없다. 그래서 플랫폼과 명령 실행을
// 주입해 **어떤 명령이 실제로 불리는지**를 잰다. 형태 검사가 아니라 호출 검사다.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

interface LeaseModule {
	reclaimLeakedAgentChild(
		runtimeDir: string,
		system: {
			platform: string;
			run(command: string): string;
			signal(pid: number, signal: string | 0): void;
			alive(pid: number): boolean;
			now(): number;
			wait(ms: number): void;
		},
	): { reclaimed: boolean; pid?: number; reason: string };
	processIsOrphan(
		pid: number,
		system: {
			platform: string;
			run(command: string): string;
			signal(pid: number, signal: string | 0): void;
			alive(pid: number): boolean;
			now(): number;
			wait(ms: number): void;
		},
	): boolean | undefined;
	killProcessTree(
		pid: number,
		system: { platform: string; run(c: string): string; signal(p: number, s: unknown): void; wait(m: number): void },
		hard?: boolean,
	): boolean;
	AGENT_CHILD_LEASE_FILE: string;
}

let lease: LeaseModule;
const created: string[] = [];

function leaseDir(payload: Record<string, unknown>): string {
	const dir = mkdtempSync(resolve(tmpdir(), "naia-lease-contract-"));
	created.push(dir);
	writeFileSync(
		resolve(dir, lease.AGENT_CHILD_LEASE_FILE),
		JSON.stringify(payload),
	);
	return dir;
}

/** 이 프로세스 자신을 대상으로 쓴다 — 살아 있음이 보장되고, 죽이지는 않는다. */
const SELF = process.pid;

function fakeSystem(
	platform: string,
	answers: (command: string) => string,
	initiallyAlive = true,
	terminateOnTaskkill = true,
) {
	const commands: string[] = [];
	const signals: Array<[number, unknown]> = [];
	let alive = initiallyAlive;
	let clock = 0;
	return {
		commands,
		signals,
		system: {
			platform,
			run(command: string) {
				commands.push(command);
				const output = answers(command);
				if (command.startsWith("taskkill ") && terminateOnTaskkill) alive = false;
				return output;
			},
			signal(pid: number, signal: unknown) {
				signals.push([pid, signal]);
				alive = false;
			},
			alive(_pid: number) {
				return alive;
			},
			now() {
				return clock;
			},
			wait(ms: number) {
				clock += ms;
			},
		},
	};
}

beforeAll(async () => {
	lease = (await import(
		fileURLToPath(
			new URL("../../packages/shell/e2e-tauri/agent-child-lease.ts", import.meta.url),
		)
	)) as unknown as LeaseModule;
});

afterEach(() => {
	while (created.length) rmSync(created.pop() as string, { recursive: true, force: true });
});

describe("회수는 플랫폼마다 제 손을 쓴다", () => {
	it("윈도우에서는 트리를 내린다 — `taskkill /PID <pid> /T /F`", () => {
		const { commands, system } = fakeSystem("win32", (command) => {
			// 표식이 보이고, 종료 뒤에는 그 PID 가 사라진 것으로 답한다.
			if (command.includes("CommandLine")) return "node agent --marker=abc";
			return "";
		});
		// 대상이 살아 있어야 회수 경로를 탄다 — 자기 PID 를 쓰되 taskkill 은 가짜다.
		const dir = leaseDir({ pid: SELF, marker: "--marker=abc" });
		const result = lease.reclaimLeakedAgentChild(dir, system);

		expect(commands.some((c) => c === `taskkill /PID ${SELF} /T /F`)).toBe(true);
		// 이름으로 훑지 않는다 — 그것은 남의 프로세스를 죽인다.
		expect(commands.some((c) => c.includes("/IM"))).toBe(false);
		expect(result).toMatchObject({ reclaimed: true, pid: SELF, reason: "terminated" });
		expect(system.alive(SELF)).toBe(false);
	});

	it("윈도우에서도 표식이 없으면 부모 추정과 무관하게 죽이지 않는다", () => {
		const { commands, system } = fakeSystem("win32", (command) => {
			if (command.includes("CommandLine")) return "";
			if (command.includes("ParentProcessId")) return "4242";
			if (command.includes("ProcessId")) return "";
			return "";
		});
		const dir = leaseDir({ pid: SELF, marker: "--marker=abc" });
		const result = lease.reclaimLeakedAgentChild(dir, system);

		expect(result).toMatchObject({ reclaimed: false, pid: SELF, reason: "marker-unverified" });
		expect(commands.some((c) => c.includes("ParentProcessId"))).toBe(false);
		expect(commands.some((c) => c.startsWith("taskkill "))).toBe(false);
	});

	it.each([
		["false", () => "node agent --marker=other"],
		["prefix collision", () => "node agent --marker=abc-extra"],
		["unknown", () => undefined as unknown as string],
		["empty", () => ""],
		["malformed", () => null as unknown as string],
		["fetch failure", () => {
			throw new Error("CIM unavailable");
		}],
	])("윈도우 marker %s 상태는 taskkill을 허용하지 않는다", (_label, answer) => {
		const { commands, system } = fakeSystem("win32", (command) => {
			if (command.includes("CommandLine")) return answer();
			return "";
		});
		const result = lease.reclaimLeakedAgentChild(
			leaseDir({ pid: SELF, marker: "--marker=abc" }),
			system,
		);

		expect(result).toMatchObject({ reclaimed: false, pid: SELF, reason: "marker-unverified" });
		expect(commands.some((c) => c.startsWith("taskkill "))).toBe(false);
		expect(system.alive(SELF)).toBe(true);
	});

	it.each(["", "garbled", "0", "-1", "123abc", "NaN"])(
		"malformed parent marker %s is never orphan proof",
		(rawParent) => {
			const { system } = fakeSystem("win32", (command) => {
				if (command.includes("ParentProcessId")) return rawParent;
				return "";
			});
			expect(lease.processIsOrphan(SELF, system)).toBeUndefined();
		},
	);

	it("실제 marker 확인 뒤에는 taskkill 후 주입된 liveness로 종료를 확인한다", () => {
		const { commands, system } = fakeSystem("win32", (command) =>
			command.includes("CommandLine") ? "node agent --marker=abc" : "",
		);
		const result = lease.reclaimLeakedAgentChild(
			leaseDir({ pid: SELF, marker: "--marker=abc" }),
			system,
		);
		expect(result).toEqual({ reclaimed: true, pid: SELF, reason: "terminated" });
		expect(commands).toEqual([
			`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${SELF}').CommandLine"`,
			`taskkill /PID ${SELF} /T /F`,
		]);
		expect(system.alive(SELF)).toBe(false);
	});

	it("taskkill 실패 뒤에도 살아 있으면 회수 성공으로 보고하지 않는다", () => {
		const { commands, system } = fakeSystem("win32", (command) => {
			if (command.includes("CommandLine")) return "node agent --marker=abc";
			if (command.startsWith("taskkill ")) throw new Error("access denied");
			return "";
		});
		const result = lease.reclaimLeakedAgentChild(
			leaseDir({ pid: SELF, marker: "--marker=abc" }),
			system,
		);
		expect(result).toEqual({ reclaimed: false, pid: SELF, reason: "still-alive" });
		expect(commands).toContain(`taskkill /PID ${SELF} /T /F`);
		expect(system.alive(SELF)).toBe(true);
	});

	it.each([
		["marker changed", () => "node agent --marker=other"],
		["marker unavailable", () => undefined as unknown as string],
	])("hard taskkill 직전 %s 재확인이 실패하면 추가 종료하지 않는다", (_label, secondAnswer) => {
		let commandLineReads = 0;
		const { commands, system } = fakeSystem(
			"win32",
			(command) => {
				if (!command.includes("CommandLine")) return "";
				commandLineReads += 1;
				return commandLineReads === 1 ? "node agent --marker=abc" : secondAnswer();
			},
			true,
			false,
		);
		const result = lease.reclaimLeakedAgentChild(
			leaseDir({ pid: SELF, marker: "--marker=abc" }),
			system,
		);

		expect(result).toEqual({ reclaimed: false, pid: SELF, reason: "marker-unverified" });
		expect(commands.filter((command) => command.startsWith("taskkill "))).toHaveLength(1);
		expect(system.alive(SELF)).toBe(true);
	});

	it("리눅스에서는 표식을 못 보면 죽이지 않는다 — 고아 대체 판정은 없다", () => {
		const { commands, system } = fakeSystem("linux", () => "");
		// 이 PID 는 살아 있지만(자기 자신) 표식이 없다.
		const dir = leaseDir({ pid: SELF, marker: "--marker-that-cannot-match-xyz" });
		const result = lease.reclaimLeakedAgentChild(dir, system);

		expect(result.reclaimed).toBe(false);
		expect(result.reason).toBe("marker-unverified");
		expect(commands).toEqual([]);
	});

	it("리스가 없거나 그 PID 가 죽었으면 아무것도 하지 않는다", () => {
		const { commands, system } = fakeSystem("win32", () => "", false);
		expect(lease.reclaimLeakedAgentChild(leaseDir({}), system).reason).toBe("no-lease");
		// 절대 존재하지 않는 PID.
		expect(
			lease.reclaimLeakedAgentChild(leaseDir({ pid: 2 ** 30, marker: "m" }), system)
				.reason,
		).toBe("not-alive");
		expect(commands).toEqual([]);
	});

	it("POSIX 는 신호를, 윈도우는 명령을 쓴다", () => {
		const posix = fakeSystem("linux", () => "");
		lease.killProcessTree(1234, posix.system);
		expect(posix.signals).toEqual([[1234, "SIGTERM"]]);
		lease.killProcessTree(1234, posix.system, true);
		expect(posix.signals[1]).toEqual([1234, "SIGKILL"]);
		expect(posix.commands).toEqual([]);

		const win = fakeSystem("win32", () => "");
		lease.killProcessTree(1234, win.system);
		expect(win.commands).toEqual(["taskkill /PID 1234 /T /F"]);
		expect(win.signals).toEqual([]);
	});
});

describe("위험한 종료 형태가 회수 코드에 없다", () => {
	// 이름으로 훑는 종료는 남의 프로세스를 죽인다. 이 저장소는 그 사고를 겪었다
	// (`pkill -f` 가 컨테이너 프로세스까지 죽인 일). 문자열로 찾지 않고 파서로 센다 —
	// 주석에 적힌 설명이 위반으로 잡히면 안 된다.
	const FILES = [
		"packages/shell/e2e-tauri/agent-child-lease.ts",
		"packages/shell/e2e-tauri/bgm-sidecar-lease.mjs",
	];

	it.each(FILES)("%s 에 이름으로 훑는 종료가 없다", async (relative) => {
		const { readFileSync } = await import("node:fs");
		const source = readFileSync(
			fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
			"utf8",
		);
		const tree = ts.createSourceFile(
			relative,
			source,
			ts.ScriptTarget.Latest,
			true,
			relative.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS,
		);
		const commands: string[] = [];
		const visit = (node: ts.Node): void => {
			if (ts.isStringLiteralLike(node)) commands.push(node.text);
			if (ts.isTemplateExpression(node)) {
				commands.push(
					node.head.text + node.templateSpans.map((span) => span.literal.text).join(" "),
				);
			}
			node.forEachChild(visit);
		};
		visit(tree);

		for (const command of commands) {
			expect(command, "taskkill /IM 은 이름으로 훑는다").not.toMatch(/taskkill[^"']*\/IM/i);
			expect(command, "pkill -f 는 이름으로 훑는다").not.toMatch(/\bpkill\b/);
			expect(command, "killall 은 이름으로 훑는다").not.toMatch(/\bkillall\b/);
		}
		// 윈도우 갈래가 실제로 있어야 한다 — 없으면 이 계약은 아무것도 지키지 않는다.
		expect(commands.some((command) => /taskkill/i.test(command))).toBe(true);
	});
});
