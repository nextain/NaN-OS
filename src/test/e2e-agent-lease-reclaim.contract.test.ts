// 스펙 사이에 흘린 agent 자식을 회수한다 — 안 하면 그 뒤 스펙 전부가 뇌 없이 돈다.
//
// 네이티브는 기동할 때 실행 자리의 `agent-child-lease.json` 을 보고, 그 PID 가
// 아직 살아 있으면 agent 를 아예 띄우지 않는다(`agent_lease_live_blocked`).
// 셸은 그래도 뜨므로 스펙은 계속 돌지만 그 앱에는 뇌가 없고, 실패는 엉뚱한
// 곳에서 난다 — 2026-09-05 자격증명 등급 실측에서 서른여덟 중 서른일곱이 그랬다.
//
// 그래서 여기서는 문자열을 세지 않고 **진짜 프로세스**를 띄워 잰다. 표식을 단
// 자식을 만들고 리스를 써 둔 뒤, 회수 함수가 그것을 끝내고 자리가 빌 때까지
// 기다리는지 본다. 그리고 표식이 다르면 손대지 않는지도 함께 잰다.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * 회수 모듈의 겉모습만 여기 적는다. 정적 import 로 끌어오면 그 파일이 이 저장소
 * 루트의 `rootDir` 밖이라 `tsc --noEmit` 이 TS6059 로 붉어지고, 그 실행이 소스
 * 옆에 `.js`/`.d.ts` 를 흘린다. 다른 계약 테스트들과 같은 방식으로 파일 URL
 * 동적 import 를 쓴다.
 */
interface LeaseModule {
	readonly AGENT_CHILD_LEASE_FILE: string;
	processAlive(pid: number): boolean;
	processCarriesMarker(pid: number, marker: string): boolean | undefined;
	reclaimLeakedAgentChild(runtimeDir: string): {
		reclaimed: boolean;
		pid?: number;
		reason: string;
	};
}

let lease: LeaseModule;
const cleanups: (() => void)[] = [];

function spawnMarkedChild(marker: string): number {
	// 계속 살아 있으면서 명령줄에 표식을 지닌 프로세스. 실제 agent 자식과 같은
	// 모양이다(node + `--naia-agent-child=<nonce>`).
	const child = spawn(
		process.execPath,
		["-e", "setInterval(() => {}, 1000)", marker],
		{ stdio: "ignore", detached: false },
	);
	cleanups.push(() => {
		try {
			process.kill(child.pid as number, "SIGKILL");
		} catch {
			/* 이미 끝났다 */
		}
	});
	return child.pid as number;
}

function runtimeDirWithLease(pid: number, marker: string): string {
	const dir = mkdtempSync(resolve(tmpdir(), "naia-lease-contract-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(
		resolve(dir, lease.AGENT_CHILD_LEASE_FILE),
		JSON.stringify({ pid, marker, nonce: "contract" }),
	);
	return dir;
}

beforeAll(async () => {
	lease = (await import(
		fileURLToPath(
			new URL(
				"../../packages/shell/e2e-tauri/agent-child-lease.ts",
				import.meta.url,
			),
		)
	)) as LeaseModule;
});

afterEach(() => {
	while (cleanups.length) (cleanups.pop() as () => void)();
});

describe("고아 agent 자식 회수", () => {
	it.runIf(process.platform !== "win32")(
		"표식이 맞는 자식을 끝내고 자리가 빌 때까지 기다린다",
		() => {
			const marker = "--naia-agent-child=contract-nonce";
			const pid = spawnMarkedChild(marker);
			expect(lease.processAlive(pid)).toBe(true);

			const outcome = lease.reclaimLeakedAgentChild(
				runtimeDirWithLease(pid, marker),
			);

			expect(outcome.reclaimed).toBe(true);
			expect(outcome.pid).toBe(pid);
			// 신호를 보냈다는 것과 자리가 비었다는 것은 다르다. 함수가 돌아온
			// 시점에 이미 비어 있어야 다음 세션의 리스 검사가 통과한다. 자리가
			// 비었는지는 네이티브와 **같은 기준**으로 본다 — cmdline 의 표식이다.
			// (여기서 부모는 vitest 라 프로세스가 좀비로 남을 수 있는데, 좀비의
			//  cmdline 은 비어 있어 네이티브도 없는 것으로 읽는다.)
			expect(lease.processCarriesMarker(pid, marker)).not.toBe(true);
		},
	);

	it.runIf(process.platform !== "win32")(
		"표식이 다르면 손대지 않는다 — PID 는 재사용된다",
		() => {
			const pid = spawnMarkedChild("--naia-agent-child=someone-else");
			const outcome = lease.reclaimLeakedAgentChild(
				runtimeDirWithLease(pid, "--naia-agent-child=contract-nonce"),
			);
			expect(outcome.reclaimed).toBe(false);
			expect(outcome.reason).toBe("marker-unverified");
			expect(lease.processAlive(pid)).toBe(true);
		},
	);

	it("리스가 없으면 아무것도 하지 않는다", () => {
		const dir = mkdtempSync(resolve(tmpdir(), "naia-lease-contract-"));
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		expect(lease.reclaimLeakedAgentChild(dir)).toEqual({
			reclaimed: false,
			reason: "no-lease",
		});
	});

	it("기본 설정이 스펙 사이에도 회수한다", async () => {
		// onPrepare 한 번으로는 스펙 사이를 못 막는다. 세션 경계 양쪽에 배선이
		// 서 있어야 한다 — 지우면 여기가 붉어진다.
		const source = await import("node:fs/promises").then((fs) =>
			fs.readFile(
				fileURLToPath(
					new URL(
						"../../packages/shell/e2e-tauri/wdio.conf.ts",
						import.meta.url,
					),
				),
				"utf8",
			),
		);
		const beforeSession = source.slice(
			source.indexOf("async beforeSession()"),
			source.indexOf("async afterSession()"),
		);
		expect(beforeSession).toMatch(/reclaimLeakedAgentChild\(\)/);
		const afterSession = source.slice(source.lastIndexOf("afterSession() {"));
		expect(afterSession).toMatch(/reclaimLeakedAgentChild\(\)/);
	});
});
