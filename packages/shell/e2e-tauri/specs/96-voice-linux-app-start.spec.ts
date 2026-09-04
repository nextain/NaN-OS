import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureAppReady } from "../helpers/settings.js";

/**
 * Linux local voice through the real Tauri Shell, main harness (#537).
 *
 * The Shell — not a test helper — verifies the bundle, resolves this
 * machine's profile, starts the compiled sidecar with the securely stored
 * member key, and reports it ready. The last step synthesizes from the
 * webview's own origin, the way the chat path does, so the allowed-origin
 * and per-launch token contract is exercised too. What it does not do is ask
 * an LLM for a reply; that path is covered by 95-voice-linux-shell.
 */
const NAIA_KEY = process.env.NAIA_E2E_NAIA_KEY ?? "";
const ADK_PATH = process.env.NAIA_E2E_ADK_PATH ?? "";
const ARTIFACTS = process.env.NAIA_E2E_VOICE_ARTIFACTS ?? "";
const TEXT = "안녕하세요. 리눅스 셸에서 처음으로 제 목소리로 말하고 있어요.";

async function tauriInvoke<T>(
	command: string,
	args: Record<string, unknown> = {},
): Promise<T> {
	return (await browser.execute(
		async (name: string, payload: Record<string, unknown>) => {
			const shell = window as unknown as {
				__TAURI_INTERNALS__?: {
					invoke: (command: string, value: unknown) => Promise<unknown>;
				};
			};
			if (!shell.__TAURI_INTERNALS__?.invoke)
				throw new Error("Tauri invoke unavailable");
			return shell.__TAURI_INTERNALS__.invoke(name, payload);
		},
		command,
		args,
	)) as T;
}

describe("Linux local voice starts through the real Tauri Shell", () => {
	before(async () => {
		if (!NAIA_KEY.startsWith("gw-"))
			throw new Error("NAIA_E2E_NAIA_KEY must be a Naia member gateway key");
		if (!ADK_PATH) throw new Error("NAIA_E2E_ADK_PATH must point to a workspace");
		await browser.setTimeout({ script: 900_000 });
		await ensureAppReady();
	});

	after(async () => {
		try {
			await tauriInvoke("stop_voxcpm2");
		} catch {
			// A failed startup has no managed process to stop.
		}
	});

	it("resolves linux_trt_6g, starts the sidecar with the stored key, and speaks from the app origin", async () => {
		const host = await tauriInvoke<{
			profile: string | null;
			gpus: { index: number; freeMib: number }[];
			defaultGpuIndex: number | null;
		}>("voice_host_profile");
		expect(host.profile).toBe("linux_trt_6g");
		expect(host.gpus.length).toBeGreaterThanOrEqual(1);

		// The saved slot profile the Shell consults before starting.
		await tauriInvoke("write_slots_manifest", {
			adkPath: ADK_PATH,
			json: JSON.stringify({
				version: 1,
				gate: { naiaAccount: true, mode: "naia" },
				slots: {
					main: { provider: "gemini", model: "gemini-2.5-flash" },
					sub: { provider: "none" },
					embedding: { provider: "none" },
					stt: {},
					tts: { provider: "naia-local-voice" },
					avatar: { provider: "vrm" },
				},
				gpu: {
					detectedVramGb: 24,
					tier: "linux-voice-6g",
					loaderProfile: host.profile,
				},
			}),
		});
		await tauriInvoke("e2e_seed_secure_naia_key", { naiaKey: NAIA_KEY });

		const installation = await tauriInvoke<{
			canStart: boolean;
			steps: { id: string; state: string; failure?: { code: string } }[];
		}>("voxcpm2_installation_status");
		if (!installation.canStart) {
			await tauriInvoke("install_voxcpm2_runtime", {});
		}
		const after = await tauriInvoke<{ canStart: boolean; steps: unknown[] }>(
			"voxcpm2_installation_status",
		);
		expect(after.canStart).toBe(true);

		const startedAt = Date.now();
		const ready = JSON.parse(
			await tauriInvoke<string>("start_voxcpm2", {
				expectedLoaderProfile: host.profile,
			}),
		) as {
			service?: string;
			capabilities?: string[];
			port?: number;
			profile?: string;
			local_access_token?: string;
		};
		const startSeconds = (Date.now() - startedAt) / 1000;
		expect(ready).toMatchObject({
			service: "voxcpm2-tensorrt",
			capabilities: ["tts"],
			port: 8910,
			profile: "linux_trt_6g",
		});
		expect(ready.local_access_token).toMatch(/^[a-f0-9]{64}$/);
		expect(await tauriInvoke<boolean>("voxcpm2_status")).toBe(true);

		const health = (await fetch("http://127.0.0.1:8910/health").then((r) =>
			r.json(),
		)) as { ready: boolean; profile?: string; warming?: boolean };
		expect(health).toMatchObject({ ready: true, profile: "linux_trt_6g" });
		// Let the default-voice prime finish so the timing below is the steady state.
		await browser.waitUntil(
			async () => {
				const h = (await fetch("http://127.0.0.1:8910/health").then((r) =>
					r.json(),
				)) as { warming?: boolean };
				return h.warming !== true;
			},
			{ timeout: 180_000, timeoutMsg: "default voice prime did not finish" },
		);

		// Synthesize from inside the webview: same origin, same token, same
		// endpoint the chat path uses.
		const result = await browser.execute(
			async (token: string, text: string) => {
				const started = performance.now();
				const response = await fetch("http://127.0.0.1:8910/v1/audio/speech", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ model: "voxcpm2", input: text, voice: "default" }),
				});
				const buffer = await response.arrayBuffer();
				const bytes = new Uint8Array(buffer);
				let binary = "";
				for (let i = 0; i < bytes.length; i += 0x8000)
					binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
				return {
					status: response.status,
					contentType: response.headers.get("content-type"),
					bytes: bytes.length,
					seconds: (performance.now() - started) / 1000,
					base64: btoa(binary),
				};
			},
			ready.local_access_token as string,
			TEXT,
		);
		expect(result.status).toBe(200);
		expect(result.contentType).toBe("audio/wav");
		expect(result.bytes).toBeGreaterThan(100_000);
		if (ARTIFACTS) {
			mkdirSync(ARTIFACTS, { recursive: true });
			writeFileSync(
				resolve(ARTIFACTS, "app-origin-synthesis.wav"),
				Buffer.from(result.base64, "base64"),
			);
			writeFileSync(
				resolve(ARTIFACTS, "app-start.json"),
				JSON.stringify(
					{
						host,
						ready: { ...ready, local_access_token: "<redacted>" },
						health,
						startSeconds,
						synthesis: {
							status: result.status,
							bytes: result.bytes,
							seconds: result.seconds,
							chars: TEXT.length,
						},
					},
					null,
					2,
				),
			);
		}
	});
});
