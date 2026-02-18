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
			const val = match[2].trim();
			if (!process.env[key]) process.env[key] = val;
		}
	}
} catch { /* .env not found — rely on env vars */ }

const SHELL_DIR = resolve(import.meta.dirname, "..");
const TAURI_BINARY = resolve(SHELL_DIR, "src-tauri/target/debug/cafelua-shell");

let tauriDriver: ChildProcess;
let viteServer: ChildProcess;

/** Wait until a port is accepting connections. */
function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
	return new Promise((ok, fail) => {
		const deadline = Date.now() + timeoutMs;
		const tryConnect = () => {
			const sock = connect(port, "127.0.0.1");
			sock.once("connect", () => {
				sock.destroy();
				ok();
			});
			sock.once("error", () => {
				sock.destroy();
				if (Date.now() > deadline) {
					fail(new Error(`Port ${port} not ready within ${timeoutMs}ms`));
				} else {
					setTimeout(tryConnect, 500);
				}
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
			"tauri:options": {
				application: TAURI_BINARY,
			},
		},
	],

	logLevel: "warn",
	bail: 1,
	waitforTimeout: 30_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 0,

	port: 4444,
	hostname: "127.0.0.1",

	framework: "mocha",
	mochaOpts: {
		ui: "bdd",
		timeout: 180_000,
	},

	reporters: ["spec"],

	async onPrepare() {
		// Check if Vite dev server is already running
		const alreadyRunning = await waitForPort(1420, 1_000).then(
			() => true,
			() => false,
		);

		if (alreadyRunning) {
			console.log("[e2e] Vite dev server already running on :1420");
			return;
		}

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

	beforeSession() {
		const driverPath = resolve(homedir(), ".cargo/bin/tauri-driver");
		tauriDriver = spawn(driverPath, ["--port", "4444"], {
			stdio: [null, process.stdout, process.stderr],
		});
	},

	afterSession() {
		tauriDriver?.kill();

		// Kill orphaned openclaw-node / gateway processes spawned by Tauri app.
		// When the test app window doesn't close cleanly, WindowEvent::Destroyed
		// may not fire, leaving Node Host processes as zombies.
		try {
			execSync("pkill -f openclaw-node 2>/dev/null || true", {
				stdio: "ignore",
			});
		} catch { /* ignore — no processes to kill */ }
	},

	async onComplete() {
		viteServer?.kill();
	},
};
