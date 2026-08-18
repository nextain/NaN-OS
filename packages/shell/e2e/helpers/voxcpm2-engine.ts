/**
 * Spawn the REAL VoxCPM2 TensorRT engine for e2e specs that must prove actual
 * sound / voice behaviour (not a mocked facade). The engine loads the model +
 * TensorRT LocDiT on the local GPU (~30-40s), serves loopback :8910, and is
 * reachable from the Playwright webview once its allowed origin includes the
 * dev server. Returns the per-launch bearer so the spec's Tauri IPC mock can
 * hand the webview the same token the real Shell would.
 *
 * Requires: an installed dev runtime at ~/.naia-dev/voxcpm2-runtime (model +
 * checkpoints + the CC0 voice palette) and a live Naia member key. When either
 * is absent the caller should skip the spec rather than fail the suite.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RealEngine {
	proc: ChildProcessWithoutNullStreams;
	token: string;
	port: number;
	origin: string;
}

const RUNTIME_ROOT =
	process.env.NAIA_VOXCPM2_RUNTIME_ROOT ||
	join(homedir(), ".naia-dev", "voxcpm2-runtime");
const BUNDLE_ROOT =
	process.env.NAIA_VOXCPM2_BUNDLE_ROOT ||
	join(
		process.cwd(),
		"src-tauri",
		"voxcpm2-runtime",
	);
const PYTHON =
	process.env.NAIA_VOXCPM2_PYTHON ||
	join(BUNDLE_ROOT, "artifact", "python", "python.exe");
const NAIA_KEY = process.env.NAIA_E2E_KEY || "";

export function realEnginePrereqsMet(): { ok: boolean; reason?: string } {
	if (!existsSync(PYTHON)) return { ok: false, reason: `python missing: ${PYTHON}` };
	if (!existsSync(join(RUNTIME_ROOT, "models", "VoxCPM2", "config.json")))
		return { ok: false, reason: "model not installed in runtime root" };
	if (
		!existsSync(join(RUNTIME_ROOT, "checkpoints", "voxcpm2_trt", "locdit_fp16.engine"))
	)
		return { ok: false, reason: "TRT engine not built in runtime root" };
	if (!NAIA_KEY) return { ok: false, reason: "NAIA_E2E_KEY not set" };
	return { ok: true };
}

/** The webview origin the engine must allow — follows PLAYWRIGHT_PORT so specs
 *  run identically on the default (1420) and the isolated (e.g. 14200) port. */
export function webviewOrigin(): string {
	const port = process.env.PLAYWRIGHT_PORT || "1420";
	const host = process.env.PLAYWRIGHT_HOST || "localhost";
	return `http://${host}:${port}`;
}

export async function startRealEngine(
	origin = webviewOrigin(),
	port = 8910,
): Promise<RealEngine> {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		VOXCPM2_VOICE_DIR: join(RUNTIME_ROOT, "voices"),
		VOXCPM2_STATE_DIR: join(RUNTIME_ROOT, "state"),
		VOXCPM2_ALLOWED_ORIGINS: origin,
		VOXCPM2_PORT: String(port),
		VOXCPM_MODEL: "openbmb/VoxCPM2",
		VOXCPM_MODEL_DIR: join(RUNTIME_ROOT, "models", "VoxCPM2"),
		VOXCPM_TRT_ENGINE_DIR: join(RUNTIME_ROOT, "checkpoints", "voxcpm2_trt"),
		VOXCPM_BACKEND: "tensorrt_locdit",
		VOXCPM2_DEBUG: "1",
		PYTHONUTF8: "1",
		PYTHONIOENCODING: "utf-8",
		PYTHONDONTWRITEBYTECODE: "1",
	};
	const proc = spawn(
		PYTHON,
		["-B", "-s", "-c", "from voxcpm2_tensorrt.http_server import main; main()"],
		{ env },
	) as ChildProcessWithoutNullStreams;

	// Hand it the member key + a fresh loopback token exactly like start_voxcpm2.
	const token = randomHex(32);
	proc.stdin.write(
		`${JSON.stringify({ naia_key: NAIA_KEY, local_access_token: token })}\n`,
	);

	// Drain stdout continuously (merged TRT logs) so the pipe can never fill and
	// stall the server mid-load, and resolve on the READY announcement.
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("engine did not become READY in 180s")),
			180_000,
		);
		let buf = "";
		const onData = (chunk: Buffer) => {
			buf += chunk.toString("utf8");
			let nl: number;
			// biome-ignore lint/suspicious/noAssignInExpressions: line splitter
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (line.startsWith("VOXCPM2_READY ")) {
					clearTimeout(timer);
					resolve();
					return;
				}
			}
		};
		proc.stdout.on("data", onData);
		// Keep the engine's stderr ([voxsrv] request trace + TRT progress) — when
		// a sentence silently never arrives at the client, this file is the only
		// server-side truth (scratch: e2e-engine-stderr.log next to test-results).
		const stderrPath = join(process.cwd(), "test-results", "e2e-engine-stderr.log");
		try {
			mkdirSync(dirname(stderrPath), { recursive: true });
		} catch {
			/* best-effort */
		}
		const stderrStream = createWriteStream(stderrPath, { flags: "a" });
		stderrStream.write(`\n===== engine spawn ${new Date().toISOString()} =====\n`);
		proc.stderr.on("data", (chunk: Buffer) => stderrStream.write(chunk));
		proc.on("exit", (code) =>
			reject(new Error(`engine exited before READY (code ${code})`)),
		);
	});

	return { proc, token, port, origin };
}

export function stopRealEngine(engine: RealEngine | null): void {
	if (!engine) return;
	try {
		engine.proc.kill();
	} catch {
		// best-effort
	}
}

function randomHex(bytes: number): string {
	let s = "";
	for (let i = 0; i < bytes; i++)
		s += Math.floor(Math.random() * 256)
			.toString(16)
			.padStart(2, "0");
	return s;
}
