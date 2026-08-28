import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execPath } from "node:process";

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
const pairedAgent = JSON.parse(
	readFileSync(resolve(SHELL_DIR, "agent-pairing.json"), "utf8"),
) as { agentCommit: string };
const PAIRED_AGENT_DIR = resolve(
	process.env.NAIA_E2E_AGENT_ROOT ??
		resolve(
			SHELL_DIR,
			"../../../..",
			"naia-agent-worktrees",
			`shell-pair-${pairedAgent.agentCommit.slice(0, 7)}`,
		),
);
const PAIRED_AGENT_SCRIPT = resolve(
	PAIRED_AGENT_DIR,
	"scripts/builds/agent-stdio-entry.mjs",
);
const PAIRED_AGENT_PROTO_DIR = resolve(
	PAIRED_AGENT_DIR,
	"src/main/adapters/grpc",
);
if (
	!existsSync(PAIRED_AGENT_SCRIPT) ||
	!existsSync(resolve(PAIRED_AGENT_PROTO_DIR, "naia_agent.proto"))
) {
	throw new Error(
		`paired naia-agent checkout is unavailable: ${PAIRED_AGENT_DIR}`,
	);
}
// The test launches the debug executable directly, bypassing tauri-with-mode.
// Inject the same verified pair used by `pnpm run tauri:dev`; without this the
// app opens but deliberately disables chat because no agent script is present.
process.env.NAIA_AGENT_SCRIPT = PAIRED_AGENT_SCRIPT;
process.env.NAIA_AGENT_PROTO_DIR = PAIRED_AGENT_PROTO_DIR;
const TAURI_BINARY = process.env.TAURI_BINARY
	? resolve(process.env.TAURI_BINARY)
	: resolve(SHELL_DIR, `src-tauri/target/debug/naia-shell${EXE}`);
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
			readFileSync(resolve(SHELL_DIR, "src-tauri", "tauri.e2e.conf.json"), "utf8"),
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
		await waitForPortClosed(1420);
		await waitForPortClosed(VITE_PORT);
		await waitForPortClosed(4448);
		await waitForPortClosed(4449);

		// Start Vite dev server (debug binary loads from devUrl localhost:1420).
		viteServer = spawn(execPath, [VITE_ENTRY, "--host", VITE_HOST], {
			cwd: SHELL_DIR,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, BROWSER: "none", PLAYWRIGHT_PORT: String(VITE_PORT) },
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
		console.log(`[e2e] Vite dev server started on ${VITE_HOST}:${VITE_PORT} (devUrl=${E2E_DEV_URL.href})`);
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
