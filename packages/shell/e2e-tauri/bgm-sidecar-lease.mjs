// 죽은 실행이 남긴 BGM 사이드카를 회수한다 (#577).
//
// 왜 이것이 필요한가. 네이티브는 BGM 사이드카를 자식으로 띄우고 그 PID 를 실행
// 자리의 `bgm-server.pid` 에 적는다(lib.rs 의 `write_pid_file("bgm-server", …)`).
// 정상 종료 경로에서는 앱이 그 자식을 데려가고 PID 파일을 지운다. 그런데 실행이
// 비정상으로 끝나면 — 한도로 죽은 에이전트, 강제 종료, `onComplete` 가 못 도는
// 경우 — 사이드카만 남는다. 남은 사이드카는 포트를 물고 있어서 다음 실행의
// 사이드카가 뜨지 못한다.
//
// 2026-09-06 실측: 이 기계에 사이드카 여덟이 살아 있었고 그 `NAIA_E2E_RUNTIME_DIR`
// 은 전부 이미 사라진 자리였다. 아무도 그것을 걷어 가지 않았다 — 회수 단계가
// 에이전트 자식만 봤기 때문이다(agent-child-lease.ts).
//
// **무엇을 정리하고 무엇을 두는가.** 이름으로 훑어 죽이면(`pkill -f bgm-server-bin`)
// 사람이 지금 쓰고 있는 앱의 사이드카까지 잡는다. 그래서 소유를 두 겹으로 묻는다.
//
//   1. 그 프로세스의 명령줄에 사이드카 표식이 있는가 (`/proc/<pid>/cmdline`).
//   2. 그 프로세스의 환경에 `NAIA_E2E_RUNTIME_DIR` 이 있고, 그것이 우리가 아는
//      자리인가 (`/proc/<pid>/environ`).
//
// 둘째가 핵심이다. 그 변수는 e2e 하네스만 넣는다 — 제품 실행과 개발 실행에는
// 없다. 그래서 변수가 없는 사이드카는 우리 것이 아니고, 건드리지 않는다. 실측에서
// 그런 것이 하나 있었다(9월 4일에 뜬 실행의 사이드카, 지금도 살아 있다).
//
// 자리가 **사라졌다는 것**이 고아의 정의다. 자리가 아직 있으면 그것을 만든 실행이
// 아직 돌고 있을 수 있으므로 두고, 자리가 없으면 그 실행은 이미 끝난 것이다.
//
// 왜 `.mjs` 인가: 이 회수는 두 곳에서 돈다 — wdio 설정(TypeScript, tsx 가 읽는다)과
// 러너 `scripts/run-regression.mjs`(맨 노드). 한쪽만 쓰는 형식으로 적으면 다른
// 쪽에 사본이 생기고, 사본은 갈라진다. `agent-pairing.mjs`·`notify-webhook-stub.mjs`
// 가 같은 이유로 이 자리에 `.mjs` 로 있다.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** 네이티브가 적는 PID 파일 이름. lib.rs 의 `write_pid_file("bgm-server", …)`. */
export const BGM_SIDECAR_PID_FILE = "bgm-server.pid";
/** 사이드카의 명령줄에 반드시 들어 있는 조각. */
export const BGM_SIDECAR_MARKER = "bgm-server-bin";
/** 하네스만 넣는 환경 변수. 이것이 소유의 근거다. */
export const RUNTIME_DIR_ENV = "NAIA_E2E_RUNTIME_DIR";

/**
 * @typedef {"no-pid-file"|"not-alive"|"marker-unverified"|"not-ours"
 *   |"runtime-dir-alive"|"terminated"|"killed"|"still-alive"} SidecarReason
 *
 * @typedef {{ reclaimed: boolean, pid?: number, runtimeDir?: string,
 *   reason: SidecarReason }} SidecarOutcome
 *
 * 프로세스를 들여다보는 창구. 계약 테스트가 가짜 `/proc` 을 끼워 넣을 수 있게
 * 밖으로 뺐다 — 살아 있는 프로세스를 죽여야만 검증되는 회수 로직은 아무도
 * 검증하지 않게 된다.
 *
 * @typedef {{
 *   listPids(): number[],
 *   commandLine(pid: number): string | undefined,
 *   environment(pid: number): Record<string, string> | undefined,
 *   directoryExists(path: string): boolean,
 *   readPidFile(path: string): number | undefined,
 *   alive(pid: number): boolean,
 *   signal(pid: number, signal: string): void,
 *   wait(ms: number): void,
 * }} SidecarSystem
 */

/** `/proc/<pid>/environ` 은 NUL 로 갈라 둔 `KEY=VALUE` 목록이다. */
function parseEnviron(raw) {
	const out = {};
	for (const entry of raw.split("\0")) {
		if (!entry) continue;
		const at = entry.indexOf("=");
		if (at <= 0) continue;
		out[entry.slice(0, at)] = entry.slice(at + 1);
	}
	return out;
}

function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 실제 프로세스 표를 읽는 창구.
 *
 * 리눅스가 아니면 프로세스 표를 훑지 않는다(`listPids` 가 빈 목록). 환경을 읽는
 * 표준적인 길이 없어서, 소유를 증명하지 못한 채 죽이게 되기 때문이다. PID 파일을
 * 짚어 가는 쪽(`reclaimSidecarForRuntimeDir`)은 어느 플랫폼에서나 돈다.
 *
 * @returns {SidecarSystem}
 */
export function procSystem() {
	const linux = process.platform === "linux";
	return {
		listPids() {
			if (!linux) return [];
			try {
				return readdirSync("/proc")
					.filter((name) => /^\d+$/.test(name))
					.map((name) => Number(name));
			} catch {
				return [];
			}
		},
		commandLine(pid) {
			if (linux) {
				try {
					return readFileSync(resolve("/proc", String(pid), "cmdline"), "utf8");
				} catch {
					return undefined;
				}
			}
			// 윈도우에는 `/proc` 이 없다. agent-child-lease.ts 의
			// `processCarriesMarker` 가 쓰는 것과 같은 길로 묻는다.
			try {
				return execSync(
					`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
					{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8_000 },
				);
			} catch {
				return undefined;
			}
		},
		environment(pid) {
			if (!linux) return undefined;
			try {
				return parseEnviron(
					readFileSync(resolve("/proc", String(pid), "environ"), "utf8"),
				);
			} catch {
				return undefined;
			}
		},
		directoryExists(path) {
			try {
				return statSync(path).isDirectory();
			} catch {
				return false;
			}
		},
		readPidFile(path) {
			if (!existsSync(path)) return undefined;
			try {
				const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
				return Number.isInteger(pid) && pid > 0 ? pid : undefined;
			} catch {
				return undefined;
			}
		},
		alive(pid) {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		},
		signal(pid, signal) {
			process.kill(pid, signal);
		},
		wait(ms) {
			sleepSync(ms);
		},
	};
}

/**
 * 이 PID 가 사이드카인가. 명령줄을 못 읽으면 아니라고 답한다 — 못 본 것을 우리
 * 것으로 세면, 남의 프로세스를 죽이는 쪽으로 틀린다.
 *
 * @param {number} pid @param {SidecarSystem} system
 */
export function carriesSidecarMarker(pid, system) {
	return (system.commandLine(pid) ?? "").includes(BGM_SIDECAR_MARKER);
}

/**
 * 이 PID 가 어느 실행 자리의 것인가. 환경을 못 읽거나 변수가 없으면 `undefined`.
 *
 * @param {number} pid @param {SidecarSystem} system
 * @returns {string | undefined}
 */
export function sidecarRuntimeDir(pid, system) {
	const value = system.environment(pid)?.[RUNTIME_DIR_ENV];
	return value && value.trim() ? resolve(value.trim()) : undefined;
}

/**
 * 끝내고 **정말 사라질 때까지 기다린다.** 신호를 보냈다는 것과 포트가 비었다는
 * 것은 다르다 — 곧장 다음 사이드카를 띄우면 그 포트를 못 잡는다.
 *
 * @param {number} pid @param {string | undefined} runtimeDir
 * @param {SidecarSystem} system @returns {SidecarOutcome}
 */
function terminate(pid, runtimeDir, system) {
	try {
		system.signal(pid, "SIGTERM");
	} catch {
		return { reclaimed: false, pid, runtimeDir, reason: "not-alive" };
	}
	for (let i = 0; i < 50; i += 1) {
		if (!system.alive(pid))
			return { reclaimed: true, pid, runtimeDir, reason: "terminated" };
		system.wait(100);
	}
	try {
		system.signal(pid, "SIGKILL");
	} catch {
		/* 그 사이 끝났다 */
	}
	for (let i = 0; i < 20 && system.alive(pid); i += 1) system.wait(100);
	return system.alive(pid)
		? { reclaimed: false, pid, runtimeDir, reason: "still-alive" }
		: { reclaimed: true, pid, runtimeDir, reason: "killed" };
}

/**
 * 이 실행 자리를 **다시 쓰기 직전에** 그 자리의 사이드카를 걷어 낸다.
 *
 * 자리를 먼저 지우면 `bgm-server.pid` 가 함께 사라져, 고아를 가리키던 유일한
 * 단서를 우리가 없앤다 — 그렇게 쌓인 것이 실측의 여덟이다. 그래서 `onPrepare` 의
 * 회수는 자리를 지우기 **전에** 이 함수를 부른다.
 *
 * @param {string} runtimeDir @param {SidecarSystem} [system]
 * @returns {SidecarOutcome}
 */
export function reclaimSidecarForRuntimeDir(runtimeDir, system = procSystem()) {
	const owned = resolve(runtimeDir);
	const pid = system.readPidFile(resolve(owned, BGM_SIDECAR_PID_FILE));
	if (!pid) return { reclaimed: false, reason: "no-pid-file" };
	if (!system.alive(pid)) return { reclaimed: false, pid, reason: "not-alive" };
	if (!carriesSidecarMarker(pid, system))
		return { reclaimed: false, pid, reason: "marker-unverified" };
	// 환경을 읽을 수 있으면 그것이 이 자리를 가리켜야 한다. PID 는 재사용되므로
	// "그 자리에 파일이 있었다" 만으로는 부족하다. 환경을 읽을 수 없는 플랫폼에서는
	// 우리가 소유한 자리 안의 PID 파일과 표식까지를 근거로 삼는다.
	const claimed = sidecarRuntimeDir(pid, system);
	if (claimed !== undefined && claimed !== owned)
		return { reclaimed: false, pid, runtimeDir: claimed, reason: "not-ours" };
	return terminate(pid, owned, system);
}

/**
 * 살아 있는 사이드카를 셋으로 가른다 — 아무것도 죽이지 않는다.
 *
 * 가르는 일과 죽이는 일을 나눠 두면 `--dry-run` 이 무엇을 걷어 갈지 **먼저 보여
 * 줄 수 있다.** 판정과 실행이 한 함수에 붙어 있으면 그 미리보기는 진짜 정리를
 * 한 번 해 보는 것이 되어, 마른 실행이 마르지 않는다.
 *
 * @param {SidecarSystem} [system]
 * @returns {Array<{ pid: number, runtimeDir?: string,
 *   verdict: "stranded" | "runtime-dir-alive" | "not-ours" }>}
 */
export function surveyStrandedSidecars(system = procSystem()) {
	const out = [];
	for (const pid of system.listPids()) {
		if (pid === process.pid) continue;
		if (!carriesSidecarMarker(pid, system)) continue;
		const claimed = sidecarRuntimeDir(pid, system);
		// 하네스가 넣은 자리가 없으면 우리 것이 아니다. 제품·개발 실행의 사이드카가
		// 여기 걸린다 — 그것을 죽이면 사람이 듣던 음악이 끊긴다.
		if (!claimed) {
			out.push({ pid, verdict: "not-ours" });
			continue;
		}
		out.push({
			pid,
			runtimeDir: claimed,
			verdict: system.directoryExists(claimed) ? "runtime-dir-alive" : "stranded",
		});
	}
	return out;
}

/**
 * 자리가 **사라진** 사이드카 전부를 걷어 낸다. 러너가 시작할 때 한 번 돈다.
 *
 * 프로세스 표를 훑되 이름으로 죽이지 않는다 — 표식과 환경이 둘 다 맞고, 그 환경이
 * 가리키는 자리가 이미 없을 때에만 손댄다.
 *
 * @param {SidecarSystem} [system] @returns {SidecarOutcome[]}
 */
export function reclaimStrandedSidecars(system = procSystem()) {
	return surveyStrandedSidecars(system).map((candidate) =>
		candidate.verdict === "stranded"
			? terminate(candidate.pid, candidate.runtimeDir, system)
			: {
					reclaimed: false,
					pid: candidate.pid,
					runtimeDir: candidate.runtimeDir,
					reason: candidate.verdict === "not-ours" ? "not-ours" : "runtime-dir-alive",
				},
	);
}

/**
 * 러너와 `onPrepare` 가 함께 쓰는 한 줄 보고. 걷어 낸 것만 적는다.
 *
 * @param {SidecarOutcome[]} outcomes @returns {string[]}
 */
export function describeReclaimed(outcomes) {
	return outcomes
		.filter((outcome) => outcome.reclaimed)
		.map(
			(outcome) =>
				`[e2e] reclaimed stranded BGM sidecar (pid ${outcome.pid}, ${outcome.reason}` +
				`${outcome.runtimeDir ? `, 사라진 자리: ${outcome.runtimeDir}` : ""})`,
		);
}
