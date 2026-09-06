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
 * 그 PID 의 명령줄에 표식이 들어 있는가. 확인할 수 없으면 `undefined` —
 * 그때는 죽이지 않는다. PID 는 재사용되므로 "살아 있다" 만으로는 부족하다.
 */
export function processCarriesMarker(
	pid: number,
	marker: string,
): boolean | undefined {
	if (process.platform !== "win32") {
		const cmdline = resolve("/proc", String(pid), "cmdline");
		if (!existsSync(cmdline)) return undefined;
		try {
			return readFileSync(cmdline, "utf8").includes(marker);
		} catch {
			return undefined;
		}
	}
	try {
		const out = execSync(
			`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8_000 },
		);
		return out.includes(marker);
	} catch {
		return undefined;
	}
}

/**
 * 네이티브가 "아직 이 자리를 쥐고 있다" 고 판정하는 것과 **같은 기준**으로 본다 —
 * `/proc/<pid>/cmdline` 에 표식이 있는가(platform/linux.rs 의 `agent_process_marker`).
 * 신호 0 으로 살아 있는지만 보면 안 된다. 좀비는 신호 0 에 응답하지만 cmdline 이
 * 비어 있어 네이티브 쪽에서는 이미 없는 것으로 읽힌다 — 두 기준이 갈라지면
 * 하네스는 "아직 안 죽었다" 며 헛되이 기다린다.
 */
function holdsLease(pid: number, marker: string): boolean {
	return processCarriesMarker(pid, marker) === true;
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
export function reclaimLeakedAgentChild(runtimeDir: string): ReclaimResult {
	const lease = readAgentChildLease(runtimeDir);
	const pid = lease?.pid;
	const marker = lease?.marker;
	if (!pid || !marker) return { reclaimed: false, reason: "no-lease" };
	if (!processAlive(pid)) return { reclaimed: false, pid, reason: "not-alive" };
	if (processCarriesMarker(pid, marker) !== true) {
		return { reclaimed: false, pid, reason: "marker-unverified" };
	}
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return { reclaimed: false, pid, reason: "not-alive" };
	}
	const softDeadline = Date.now() + 5_000;
	while (Date.now() < softDeadline) {
		if (!holdsLease(pid, marker)) {
			return { reclaimed: true, pid, reason: "terminated" };
		}
		sleepSync(100);
	}
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		/* 그 사이 끝났다 */
	}
	for (let i = 0; i < 20 && holdsLease(pid, marker); i += 1) sleepSync(100);
	return holdsLease(pid, marker)
		? { reclaimed: false, pid, reason: "still-alive" }
		: { reclaimed: true, pid, reason: "killed" };
}
