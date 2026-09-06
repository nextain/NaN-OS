// 앞 세션이 흘린 agent 자식을 회수한다 (#541 · #547 후속).
//
// 왜 이것이 e2e 의 생사를 가르는가. 네이티브는 기동할 때 실행 자리의
// `agent-child-lease.json` 을 보고, 그 PID 가 아직 살아 있으면 agent 를 **아예
// 띄우지 않는다** — `agent_lease_live_blocked`(lib.rs 의
// `reconcile_agent_child_lease_with`). 셸은 그래도 뜨기 때문에 스펙은 계속
// 돌지만, 그 앱에는 뇌가 없다.
//
// 2026-09-05 자격증명 등급 실측이 정확히 그 모습이다. 서른여덟 스펙 중 첫
// 스펙만 agent 를 띄웠고 나머지 서른일곱이 전부 그 줄에서 막혔다. 증상은
// 엉뚱한 데서 났다 — 매 턴 앞에서 앱 스킬을 등록하는 화면 코드가
// `skill_youtube_bgm_registration_failed` 로 죽어 그 문자열이 대화 답변으로
// 나왔고(120회), 판정 모델은 그것을 "AI 가 도구를 못 쓴다" 로 읽었다(99회).
// 원인 한 줄이 실패 이백 몇 개로 번졌다.
//
// 정리 대상은 **리스가 가리키고 표식까지 맞는 프로세스 하나**뿐이다. 이름으로
// 훑어 죽이면 사람이 지금 쓰고 있는 앱의 agent 까지 잡는다.
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

export const AGENT_CHILD_LEASE_FILE = "agent-child-lease.json";

export interface AgentChildLease {
	pid?: number;
	marker?: string;
}

export function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * 회수가 바깥세상에 묻고 시키는 것 전부. 계약이 진짜 프로세스를 건드리지 않고
 * 두 플랫폼의 갈래를 다 재려면 이 자리가 주입 가능해야 한다.
 */
export interface ProcessSystem {
	platform: NodeJS.Platform;
	/** 명령을 돌리고 표준출력을 돌려준다. 실패는 던진다. */
	run(command: string): string;
	/** 신호를 보낸다(POSIX). 윈도우에서는 쓰지 않는다. */
	signal(pid: number, signal: NodeJS.Signals | 0): void;
	/** 대상이 아직 살아 있는지 확인한다. 계약 테스트가 이 판정을 주입한다. */
	alive(pid: number): boolean;
	/** 계약 테스트가 재시도 deadline을 기다리지 않고 진행하도록 시계를 주입한다. */
	now(): number;
	wait(ms: number): void;
}

export const realProcessSystem: ProcessSystem = {
	platform: process.platform,
	run: (command) =>
		execSync(command, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 8_000,
		}),
	signal: (pid, signal) => {
		process.kill(pid, signal as NodeJS.Signals);
	},
	alive: processAlive,
	now: Date.now,
	wait: sleepSync,
};

function cimQuery(pid: number, property: string): string {
	return `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').${property}"`;
}

function commandLineCarriesMarker(commandLine: string, marker: string): boolean {
	return commandLine.split(/[\0\s]+/u).some((argument) => argument === marker);
}

export function processCarriesMarker(
	pid: number,
	marker: string,
	system: ProcessSystem = realProcessSystem,
): boolean | undefined {
	if (system.platform !== "win32") {
		const cmdline = resolve("/proc", String(pid), "cmdline");
		if (!existsSync(cmdline)) return undefined;
		try {
			return commandLineCarriesMarker(readFileSync(cmdline, "utf8"), marker);
		} catch {
			return undefined;
		}
	}
	try {
		const commandLine = system.run(cimQuery(pid, "CommandLine"));
		if (typeof commandLine !== "string") return undefined;
		return commandLineCarriesMarker(commandLine, marker);
	} catch {
		return undefined;
	}
}

/**
 * 부모 조회가 고아라는 증거가 될 수 있는지 진단한다.
 *
 * 이 값은 회수 허가에 사용하지 않는다. 윈도우 CIM 조회의 빈 출력은 부모가
 * 없다는 뜻인지 조회가 실패했다는 뜻인지 이 창구만으로 구별할 수 없으므로,
 * 양성 증거가 없으면 항상 `undefined` 를 돌려준다.
 */
export function processIsOrphan(
	pid: number,
	system: ProcessSystem = realProcessSystem,
): boolean | undefined {
	if (system.platform !== "win32") return undefined;
	try {
		const rawParent = system.run(cimQuery(pid, "ParentProcessId")).trim();
		if (!/^\d+$/.test(rawParent)) return undefined;
		const parent = Number(rawParent);
		if (!Number.isSafeInteger(parent) || parent <= 0) return undefined;
		const parentResult = system.run(cimQuery(parent, "ProcessId")).trim();
		if (!/^\d+$/.test(parentResult)) return undefined;
		return Number(parentResult) !== parent ? undefined : false;
	} catch {
		return undefined;
	}
}

/**
 * 그 PID 와 **그 아래 자식까지** 끝낸다.
 *
 * 윈도우에서 `process.kill` 은 그 프로세스 하나만 끝낸다. 에이전트는 자식 node 를
 * 더 띄울 수 있으므로 부모만 죽이면 자손이 남을 수 있다.
 * `taskkill /PID <pid> /T /F` 가 트리를 내린다. `/IM`(이름으로)은 쓰지 않는다.
 */
export function killProcessTree(
	pid: number,
	system: ProcessSystem = realProcessSystem,
	hard = false,
): boolean {
	try {
		if (system.platform === "win32") {
			system.run(`taskkill /PID ${pid} /T /F`);
			return true;
		}
		system.signal(pid, hard ? "SIGKILL" : "SIGTERM");
		return true;
	} catch {
		return false;
	}
}

/**
 * 네이티브가 "아직 이 자리를 쥐고 있다" 고 판정하는 것과 **같은 기준**으로 본다 —
 * `/proc/<pid>/cmdline` 에 표식이 있는가(platform/linux.rs 의 `agent_process_marker`).
 * 신호 0 으로 살아 있는지만 보면 안 된다. 좀비는 신호 0 에 응답하지만 cmdline 이
 * 비어 있어 네이티브 쪽에서는 이미 없는 것으로 읽힌다 — 두 기준이 갈라지면
 * 하네스는 "아직 안 죽었다" 며 헛되이 기다린다.
 */
function holdsLease(
	pid: number,
	marker: string,
	system: ProcessSystem = realProcessSystem,
): boolean {
	// 윈도우에서 표식 조회는 PowerShell 한 번이라 100ms 간격으로 부르면 기다림이
	// 조회 시간에 잡아먹힌다. soft wait 동안에는 살아 있는지만 보고, hard 재시도
	// 직전에 표식을 다시 확인해 PID 재사용을 종료 권한으로 착각하지 않는다.
	if (system.platform === "win32") return system.alive(pid);
	return processCarriesMarker(pid, marker, system) === true;
}

export function readAgentChildLease(
	runtimeDir: string,
): AgentChildLease | undefined {
	const leasePath = resolve(runtimeDir, AGENT_CHILD_LEASE_FILE);
	if (!existsSync(leasePath)) return undefined;
	try {
		return JSON.parse(readFileSync(leasePath, "utf8")) as AgentChildLease;
	} catch {
		return undefined;
	}
}

export interface ReclaimResult {
	/** 정말 걷어 냈는가. 회수할 것이 없었으면 false. */
	reclaimed: boolean;
	pid?: number;
	reason:
		| "no-lease"
		| "not-alive"
		| "marker-unverified"
		| "terminated"
		| "killed"
		| "still-alive";
}

/**
 * 리스가 가리키는 agent 자식을 끝내고, **정말 사라질 때까지 기다린다.**
 *
 * 기다리는 것이 핵심이다. SIGTERM 만 보내고 곧장 앱을 띄우면 리스 검사가 아직
 * 살아 있는 것으로 읽어 그 세션도 뇌 없이 뜬다 — 신호를 보냈다는 것과 자리가
 * 비었다는 것은 다르다.
 */
export function reclaimLeakedAgentChild(
	runtimeDir: string,
	system: ProcessSystem = realProcessSystem,
): ReclaimResult {
	const lease = readAgentChildLease(runtimeDir);
	const pid = lease?.pid;
	const marker = lease?.marker;
	if (!pid || !marker) return { reclaimed: false, reason: "no-lease" };
	if (!system.alive(pid)) return { reclaimed: false, pid, reason: "not-alive" };

	const carries = processCarriesMarker(pid, marker, system);
	// PID 는 재사용될 수 있다. 플랫폼과 무관하게 양성 표식 증명이 없으면
	// 종료하지 않는다. 부모가 없다는 추정은 이 허가를 대체하지 못한다.
	if (carries !== true) return { reclaimed: false, pid, reason: "marker-unverified" };

	if (!killProcessTree(pid, system)) {
		return system.alive(pid)
			? { reclaimed: false, pid, reason: "still-alive" }
			: { reclaimed: true, pid, reason: "terminated" };
	}
	const softDeadline = system.now() + 5_000;
	while (system.now() < softDeadline) {
		if (!holdsLease(pid, marker, system)) {
			return {
				reclaimed: true,
				pid,
				reason: "terminated",
			};
		}
		system.wait(100);
	}
	if (!system.alive(pid)) return { reclaimed: true, pid, reason: "terminated" };
	if (processCarriesMarker(pid, marker, system) !== true) {
		return { reclaimed: false, pid, reason: "marker-unverified" };
	}
	killProcessTree(pid, system, true);
	for (let i = 0; i < 20 && holdsLease(pid, marker, system); i += 1) system.wait(100);
	return holdsLease(pid, marker, system)
		? { reclaimed: false, pid, reason: "still-alive" }
		: { reclaimed: true, pid, reason: "killed" };
}
