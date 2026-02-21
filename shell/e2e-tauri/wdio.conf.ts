import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Load shell/.env
const envPath = resolve(import.meta.dirname, "../.env");
try {
	const envContent = readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const match = line.match(/^([^#=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const rawVal = match[2].trim();
			const val = rawVal.replace(/^['"]|['"]$/g, "");
			if (!process.env[key]) process.env[key] = val;
		}
	}
} catch { /* .env not found — rely on env vars */ }

const SHELL_DIR = resolve(import.meta.dirname, "..");
const TAURI_BINARY = resolve(SHELL_DIR, "src-tauri/target/debug/naia-shell");

let tauriDriver: ChildProcess;
let viteServer: ChildProcess;

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

export const config = {
	runner: "local" as const,

	specs: ["./specs/**/*.spec.ts"],
	maxInstances: 1,
	capabilities: [
		{
			maxInstances: 1,
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

	port: 4444,
	hostname: "127.0.0.1",

	framework: "mocha",
	mochaOpts: {
		ui: "bdd",
		timeout: 180_000,
	},

	reporters: [
		"spec",
	],

	async onPrepare() {
		// Kill orphaned processes from previous runs
		try {
			execSync("lsof -ti:1420 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4444 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4445 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f tauri-driver 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f WebKitWebDriver 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f naia-shell 2>/dev/null || true", { stdio: "ignore" });
		} catch { /* ignore */ }
		// Brief pause to let ports release
		await new Promise((r) => setTimeout(r, 500));

		// Start Vite dev server (debug binary loads from devUrl localhost:1420)
		viteServer = spawn("pnpm", ["dev"], {
			cwd: SHELL_DIR,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, BROWSER: "none" },
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
		await waitForPort(1420, 30_000);
		console.log("[e2e] Vite dev server started on :1420");
	},

	async beforeSession() {
		// Kill leftover processes from previous spec's session.
		// Each spec runs in its own worker process; we must ensure
		// ports and app processes from the previous worker are fully dead.
		try {
			execSync("pkill -9 -f naia-shell 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -9 -f openclaw-node 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -9 -f tauri-driver 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -9 -f WebKitWebDriver 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4444 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4445 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
		} catch { /* ignore */ }
		await new Promise((r) => setTimeout(r, 1_500));

		const driverPath = resolve(homedir(), ".cargo/bin/tauri-driver");
		tauriDriver = spawn(
			driverPath,
			[
				"--port", "4444",
				"--native-driver", "/usr/bin/WebKitWebDriver",
				"--native-port", "4445",
			],
			{ stdio: [null, process.stdout, process.stderr] },
		);
		await waitForPort(4444, 30_000);
	},

	async before() {
		// Each spec runs in its own session (fresh app).
		// Ensure base config is set so the app bypasses onboarding.
		const { ensureAppReady } = await import("./helpers/settings.js");
		await ensureAppReady();

		// Auto-approve permission modals globally for all specs.
		// Prevents tool-call hangs when AI tries to use a tool not yet approved.
		const { autoApprovePermissions } = await import("./helpers/permissions.js");
		autoApprovePermissions();
	},

	afterSession() {
		tauriDriver?.kill();

		// Kill ALL processes spawned by Tauri app and E2E infrastructure.
		// Without this, ports 4444/4445 stay occupied and next spec's session fails.
		try {
			execSync("pkill -f openclaw-node 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f naia-shell 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f WebKitWebDriver 2>/dev/null || true", { stdio: "ignore" });
			execSync("pkill -f tauri-driver 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4444 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti:4445 | xargs -r kill -9 2>/dev/null || true", { stdio: "ignore" });
		} catch { /* ignore — no processes to kill */ }
	},

	async onComplete() {
		viteServer?.kill();
	},
};
