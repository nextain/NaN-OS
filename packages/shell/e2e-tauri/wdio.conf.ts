import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execPath } from "node:process";
import { resolvePairedAgent } from "../scripts/agent-pairing.mjs";

// Enable debug logging for Tauri app — Rust logs all agent events to stderr + naia.log
process.env.CAFE_DEBUG_E2E = "1";
process.env.NAIA_E2E_MODE = "1";
// E2E mock: bypass GitHub clone + agent-kill-before-delete so ADK setup
// scenarios run in milliseconds without network/process flakiness (#328).
process.env.NAIA_E2E_MOCK_CLONE = "1";

// Load shell/.env.e2e first (e2e-only knobs like VITE_NAIA_DEV_GATEWAY_URL),
// then shell/.env (shared defaults). first-match-wins per key so .env.e2e
// values take precedence. Keeping the dev-gateway URL out of .env is what
// prevents `pnpm run tauri:dev` from breaking a prod OAuth login (#333).
function loadEnvFile(filePath: string): void {
	try {
		const content = readFileSync(filePath, "utf-8");
		for (const line of content.split("\n")) {
			const match = line.match(/^([^#=]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				const rawVal = match[2].trim();
				const val = rawVal.replace(/^['"]|['"]$/g, "");
				if (!process.env[key]) process.env[key] = val;
			}
		}
	} catch {
		/* file not found — keep going */
	}
}
loadEnvFile(resolve(import.meta.dirname, "../.env.e2e"));
loadEnvFile(resolve(import.meta.dirname, "../.env"));

// ── Platform constants ────────────────────────────────────────────────────────
// Linux uses WebKit2GTK + WebKitWebDriver; Windows uses WebView2 + msedgedriver.
// Keep Linux behavior identical to the original config and branch for win32.
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? ".exe" : "";

const SHELL_DIR = resolve(import.meta.dirname, "..");
// 짝 저장소를 찾는 규칙은 빌드와 하나여야 한다 (#539). 빌드가 어느 워크트리를
// 골라 바이너리에 박아 두면, 실행이 다른 것을 넘길 때 앱이 자기 짝이 아니라며
// 거절한다. 예전에는 두 규칙이 달라 그 어긋남이 실제로 났다.
const {
	pairedAgent: PAIRED_AGENT_DIR,
	agentScript: PAIRED_AGENT_SCRIPT,
	agentProtoDir: PAIRED_AGENT_PROTO_DIR,
} = resolvePairedAgent();
// The test launches the debug executable directly, bypassing tauri-with-mode.
// Inject the same verified pair used by `pnpm run tauri:dev`; without this the
// app opens but deliberately disables chat because no agent script is present.
process.env.NAIA_AGENT_SCRIPT = PAIRED_AGENT_SCRIPT;
process.env.NAIA_AGENT_PROTO_DIR = PAIRED_AGENT_PROTO_DIR;
// `build:e2e:tauri` 는 개발 타깃과 섞이지 않도록 target-e2e 에 짓는다 (#539).
// 여기서 개발 타깃을 띄우면 지금 고친 코드가 아니라 예전 빌드를 재게 된다 —
// 실제로 짝 저장소가 어긋난 것처럼 보이던 실패가 이것이었다.
const E2E_TARGET_DIR = resolve(
	process.env.NAIA_E2E_TARGET_DIR ?? resolve(SHELL_DIR, "src-tauri/target-e2e"),
);
const TAURI_BINARY = process.env.TAURI_BINARY
	? resolve(process.env.TAURI_BINARY)
	: resolve(E2E_TARGET_DIR, `debug/naia-shell${EXE}`);

// Vosk 의 공유 라이브러리는 빌드 산출물 안에 놓인다. 기본 타깃에서는 바이너리
// 옆으로 복사되지만 e2e 타깃에서는 그렇지 않아, 앱이 libvosk.so 를 못 찾고
// 세션 생성 단계에서 죽는다 (#539). 그 자리를 로더에게 알려 준다.
if (!IS_WINDOWS) {
	const buildDir = resolve(E2E_TARGET_DIR, "debug", "build");
	if (existsSync(buildDir)) {
		for (const entry of readdirSync(buildDir)) {
			const candidate = resolve(buildDir, entry, "out", "vosk-lib");
			if (!existsSync(resolve(candidate, "libvosk.so"))) continue;
			const existing = process.env.LD_LIBRARY_PATH ?? "";
			process.env.LD_LIBRARY_PATH = existing
				? `${candidate}:${existing}`
				: candidate;
			break;
		}
	}
}
const TAURI_DRIVER = resolve(homedir(), `.cargo/bin/tauri-driver${EXE}`);
const NATIVE_DRIVER = IS_WINDOWS
	? resolve(SHELL_DIR, "e2e-tauri/.drivers/msedgedriver.exe")
	: "/usr/bin/WebKitWebDriver";
// Run Vite via node directly — avoids `pnpm.cmd` (which Windows' CreateProcess
// refuses to spawn without a shell, producing `spawn EINVAL`) and also avoids
// the `shell:true + args[]` DEP0190 warning introduced in Node 22.
const VITE_ENTRY = resolve(SHELL_DIR, "node_modules/vite/bin/vite.js");
/**
 * dev 서버는 e2e 바이너리가 실제로 찾아가는 주소에 떠야 한다.
 * 그 주소의 정본은 `tauri.e2e.conf.json` 의 devUrl 이므로 거기서 읽는다 — 여기 상수로
 * 적어 두면 둘이 갈라진다(2026-08-26: conf 는 1420 에 띄우는데 바이너리는 1422 를 봤다).
 *
 * ⚠️ 호스트도 맞춰야 한다. Vite 는 기본으로 `[::1]`(IPv6) 에만 바인드하는데 devUrl 이
 *    `127.0.0.1`(IPv4) 이면 앱이 붙지 못하고 about:blank 에 머문다. 그러면 origin 이 null 이라
 *    Tauri IPC 가 모든 호출을 "Origin header is not a valid URL" 로 거절한다 —
 *    실패가 스펙이 아니라 하네스에서 나므로 원인을 찾기 어렵다.
 */
const E2E_DEV_URL = new URL(
	(
		JSON.parse(
			readFileSync(
				resolve(SHELL_DIR, "src-tauri", "tauri.e2e.conf.json"),
				"utf8",
			),
		) as { build?: { devUrl?: string } }
	).build?.devUrl ?? "http://127.0.0.1:1420",
);
const VITE_PORT = Number(E2E_DEV_URL.port || "1420");
const VITE_HOST = E2E_DEV_URL.hostname;

let tauriDriver: ChildProcess;
let viteServer: ChildProcess;
let permissionPoller: { dispose: () => void } | undefined;

// ── Process cleanup helpers ───────────────────────────────────────────────────

/**
 * Kill processes by image name.
 * Linux: `pkill [-9] -x <name>` (matches the executable name exactly).
 * Windows: `taskkill /F /IM <name>.exe` (matches against image name only).
 *
 * Always swallows errors — "no such process" is the common case.
 */
/**
 * 앞선 실행이 흘린 agent 자식을 회수한다 (#541).
 *
 * 셸은 종료해도 자기가 띄운 agent 를 함께 데려가지 못할 때가 있다. 그 고아가
 * lease 를 쥔 채 남으면 다음 실행의 셸이 `agent_lease_live_blocked` 로 대화를
 * 아예 못 하고, 화면에는 스킬 등록 실패로만 보인다 — 원인과 증상이 멀다.
 *
 * lease 파일이 가리키는 것만 정리한다. 이름으로 훑어 죽이면 사람이 쓰고 있는
 * 앱의 agent 까지 잡는다.
 */
function reclaimLeakedAgentChild(): void {
	const leasePath = resolve(homedir(), ".naia", "agent-child-lease.json");
	if (!existsSync(leasePath)) return;
	try {
		const lease = JSON.parse(readFileSync(leasePath, "utf8")) as {
			pid?: number;
			marker?: string;
		};
		if (!lease.pid) return;
		// 그 PID 가 정말 agent 자식인지 표식으로 확인하고 나서 정리한다.
		const cmdline = resolve("/proc", String(lease.pid), "cmdline");
		if (existsSync(cmdline)) {
			const args = readFileSync(cmdline, "utf8");
			if (lease.marker && !args.includes(lease.marker)) return;
			process.kill(lease.pid, "SIGTERM");
		}
	} catch {
		// 이미 사라졌거나 읽을 수 없으면 할 일이 없다.
	}
}

function killByName(name: string, force = false): void {
	try {
		if (IS_WINDOWS) {
			const exe = name.endsWith(".exe") ? name : `${name}.exe`;
			execSync(`taskkill /F /IM ${exe}`, { stdio: "ignore" });
		} else {
			const flag = force ? "-9 " : "";
			// Never use `-f` here. Every WDIO worker command line contains the
			// repository path `.../naia-shell/...`, so broad matching kills the
			// Node worker itself before it can report a test result.
			execSync(`pkill ${flag}-x ${name} 2>/dev/null || true`, {
				stdio: "ignore",
			});
		}
	} catch {
		/* ignore — no matching processes */
	}
}

/**
 * Kill processes listening on a TCP port.
 * Linux: kill only the listening process. Matching every socket also matches
 * the WDIO worker's outbound connection and kills the test reporter itself.
 * Windows: parse `netstat -ano -p tcp` and `taskkill /F /PID`.
 */
function killByPort(port: number): void {
	try {
		if (IS_WINDOWS) {
			const out = execSync("netstat -ano -p tcp", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			const pids = new Set<string>();
			for (const rawLine of out.split(/\r?\n/)) {
				const line = rawLine.trim();
				// e.g. "TCP    0.0.0.0:4444   0.0.0.0:0   LISTENING   12345"
				const match = line.match(/^TCP\s+\S+:(\d+)\s+\S+\s+\S+\s+(\d+)$/);
				if (match && Number(match[1]) === port) pids.add(match[2]);
			}
			for (const pid of pids) {
				try {
					execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
				} catch {
					/* ignore */
				}
			}
		} else {
			execSync(
				`lsof -tiTCP:${port} -sTCP:LISTEN | xargs -r kill -9 2>/dev/null || true`,
				{ stdio: "ignore" },
			);
		}
	} catch {
		/* ignore */
	}
}

/** Wait until a port is accepting connections. */
function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
	return new Promise((ok, fail) => {
		const deadline = Date.now() + timeoutMs;
		const tryConnect = () => {
			const hosts = ["127.0.0.1", "::1", "localhost"] as const;
			let attempts = hosts.length;
			let connected = false;
			for (const host of hosts) {
				const sock = connect(port, host);
				sock.once("connect", () => {
					if (connected) return;
					connected = true;
					sock.destroy();
					ok();
				});
				sock.once("error", () => {
					sock.destroy();
					attempts -= 1;
					if (connected) return;
					if (attempts > 0) return;
					if (Date.now() > deadline) {
						fail(new Error(`Port ${port} not ready within ${timeoutMs}ms`));
					} else {
						setTimeout(tryConnect, 500);
					}
				});
			}
		};
		tryConnect();
	});
}

/** Wait until a previously-owned test port is actually released before reuse. */
function waitForPortClosed(port: number, timeoutMs = 10_000): Promise<void> {
	return new Promise((ok, fail) => {
		const deadline = Date.now() + timeoutMs;
		const tryConnect = () => {
			const sock = connect(port, "127.0.0.1");
			sock.once("connect", () => {
				sock.destroy();
				if (Date.now() > deadline) {
					fail(
						new Error(`Port ${port} was not released within ${timeoutMs}ms`),
					);
				} else {
					setTimeout(tryConnect, 150);
				}
			});
			sock.once("error", () => {
				sock.destroy();
				ok();
			});
		};
		tryConnect();
	});
}

export const config = {
	runner: "local" as const,

	specs: ["./specs/**/*.spec.ts"],
	maxInstances: 1,
	capabilities: [
		{
			maxInstances: 1,
			// ★ WebKitWebDriver(webkit2gtk 2.52.3)는 wdio 9 가 W3C 세션에 자동 활성하는 BiDi 프로토콜을
			//   제대로 지원 안 해, 응답이 깨진 JSON 으로 와 `Could not parse response body`(JSON.parse 실패)로
			//   모든 execute/세션이 깨진다 → classic WebDriver 만 쓰도록 강제(BiDi 비활성). e2e-tauri 핵심 fix.
			"wdio:enforceWebDriverClassic": true,
			// 헤드리스(cage/WebKitWebDriver)에서 browser.refresh()/url() 의 page-load 대기가
			// 완료 응답을 못 받아 "aborted due to timeout" 으로 세션이 끊기는 문제 → 'eager' 로
			// DOMContentLoaded 까지만 대기(전체 load 이벤트 대기 안 함). 준비 판정은 명시적 waitUntil 이 담당.
			pageLoadStrategy: "eager",
			"tauri:options": {
				application: TAURI_BINARY,
			},
		},
	],

	logLevel: "warn",
	bail: 0,
	waitforTimeout: 30_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 3,
	// Node 26 exposes its global fetch dispatcher through an undici compatibility
	// wrapper. webdriverio 9 precomputes Content-Length before that wrapper, which
	// rejects the otherwise valid session request as UND_ERR_INVALID_ARG. Let fetch
	// compute the byte length from the unchanged JSON body instead.
	transformRequest: (request) => {
		request.headers.delete("Content-Length");
		return request;
	},

	port: 4448,
	hostname: "127.0.0.1",

	framework: "mocha",
	mochaOpts: {
		ui: "bdd",
		timeout: 180_000,
	},

	reporters: ["spec"],

	async onPrepare() {
		// Kill orphaned processes from previous runs
		killByPort(1420);
		killByPort(VITE_PORT);
		killByPort(4448);
		killByPort(4449);
		killByName("tauri-driver");
		if (IS_WINDOWS) {
			killByName("msedgedriver");
		} else {
			killByName("WebKitWebDriver");
		}
		killByName("naia-shell");
		reclaimLeakedAgentChild();
		await waitForPortClosed(1420);
		await waitForPortClosed(VITE_PORT);
		await waitForPortClosed(4448);
		await waitForPortClosed(4449);

		// Start Vite dev server (debug binary loads from devUrl localhost:1420).
		viteServer = spawn(execPath, [VITE_ENTRY, "--host", VITE_HOST], {
			cwd: SHELL_DIR,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				BROWSER: "none",
				PLAYWRIGHT_PORT: String(VITE_PORT),
			},
		});
		viteServer.stdout?.on("data", (d: Buffer) => {
			const line = d.toString();
			if (line.includes("error") || line.includes("Error")) {
				process.stderr.write(`[vite] ${line}`);
			}
		});
		viteServer.stderr?.on("data", (d: Buffer) =>
			process.stderr.write(`[vite:err] ${d.toString()}`),
		);
		await waitForPort(VITE_PORT, 30_000);
		console.log(
			`[e2e] Vite dev server started on ${VITE_HOST}:${VITE_PORT} (devUrl=${E2E_DEV_URL.href})`,
		);
	},

	async beforeSession() {
		// The native drivers are an external boundary. Clear only leftovers before
		// creating a fresh session; the previous session is never killed mid-start.
		killByName("naia-shell", true);
		if (!IS_WINDOWS) killByName("naia-node", true);
		killByName("tauri-driver", true);
		if (IS_WINDOWS) killByName("msedgedriver", true);
		else killByName("WebKitWebDriver", true);
		killByPort(4448);
		killByPort(4449);
		await waitForPortClosed(4448);
		await waitForPortClosed(4449);

		tauriDriver = spawn(
			TAURI_DRIVER,
			["--port", "4448", "--native-driver", NATIVE_DRIVER],
			{
				stdio: [null, process.stdout, process.stderr],
				env: {
					...process.env,
					RUST_LOG: process.env.RUST_LOG ?? "tauri_driver=debug",
				},
			},
		);
		await waitForPort(4448, 30_000);
	},

	async before() {
		// Each spec runs in its own session (fresh app).
		// On Windows/WebView2 the session returns before the webview has
		// navigated from about:blank to devUrl — touching localStorage on an
		// opaque origin throws "Access is denied". Wait until the document is
		// on an http origin AND localStorage is actually writable before any
		// spec-level hook runs. Linux/WebKitGTK already blocks on navigation
		// so this wait is a no-op there.
		await browser.waitUntil(
			async () => {
				try {
					return await browser.execute(() => {
						if (!document.location.href.startsWith("http")) return false;
						try {
							const probe = "__naia_e2e_probe__";
							localStorage.setItem(probe, "1");
							localStorage.removeItem(probe);
							return true;
						} catch {
							return false;
						}
					});
				} catch {
					return false;
				}
			},
			{
				timeout: 30_000,
				timeoutMsg:
					"webview never reached an http origin with writable localStorage",
			},
		);

		// Ensure base config is set so the app bypasses onboarding.
		const { ensureAppReady } = await import("./helpers/settings.js");
		await ensureAppReady();

		// Auto-approve permission modals globally for all specs.
		// Prevents tool-call hangs when AI tries to use a tool not yet approved.
		const { autoApprovePermissions } = await import("./helpers/permissions.js");
		permissionPoller = autoApprovePermissions();
	},

	after() {
		permissionPoller?.dispose();
		permissionPoller = undefined;
	},

	afterSession() {
		// The service owns the driver processes. Only clean the app/legacy child
		// after a session so the next native spec starts from a known state.
		if (!IS_WINDOWS) {
			killByName("naia-node");
		}
		killByName("naia-shell");
		if (IS_WINDOWS) {
			killByName("msedgedriver");
		} else {
			killByName("WebKitWebDriver");
		}
		killByName("tauri-driver");
		killByPort(4448);
		killByPort(4449);
	},

	async onComplete() {
		viteServer?.kill();
	},
};
