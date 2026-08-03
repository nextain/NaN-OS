import { sendMessage } from "../helpers/chat.js";

describe("6GB VoxCPM2 voice profile through the real Tauri Shell", () => {
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

	after(async () => {
		try {
			await tauriInvoke("stop_cascade");
		} catch {
			// A failed startup has no managed process to stop.
		}
	});

	it("starts voice-only cascade, renders VRM, and speaks an external LLM reply", async () => {
		await browser.waitUntil(
			() => browser.execute(() => document.querySelector(".app-root") !== null),
			{ timeout: 45_000, timeoutMsg: "Shell app root did not render" },
		);
		const detectedVramGb = await tauriInvoke<number | null>("detect_gpu_vram");
		expect(detectedVramGb).toBeGreaterThanOrEqual(6);

		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const avatar = document.querySelector<HTMLElement>(
						"[data-avatar-loaded]",
					);
					return avatar?.dataset.avatarLoaded === "true";
				}),
			{
				timeout: 90_000,
				timeoutMsg: "Shell 3D VRM did not become visible",
			},
		);
		expect(await $("[data-video-avatar]").isExisting()).toBe(false);
		expect(
			await $("[data-avatar-loaded]").getAttribute("data-avatar-model-path"),
		).toMatch(/[\\/]01-OL_Woman\.vrm$/);

		// The saved profile must restore after the secure credential is hydrated;
		// a direct start below is then only an idempotent readiness read.
		await browser.waitUntil(() => tauriInvoke<boolean>("cascade_status"), {
			timeout: 90_000,
			timeoutMsg: "6GB cascade did not restore from the saved member profile",
		});

		const installation = await tauriInvoke<{
			canStart: boolean;
			steps: Array<{
				id: string;
				state: string;
				failure?: { code: string };
			}>;
		}>("cascade_installation_status");
		if (!installation.canStart) {
			throw new Error(`cascade prerequisites: ${JSON.stringify(installation)}`);
		}
		const ready = JSON.parse(
			await tauriInvoke<string>("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			}),
		) as {
			services?: Array<{ id: string; port: number }>;
		};
		expect(new Set(ready.services?.map((service) => service.id))).toEqual(
			new Set(["voxcpm2_trt_tts", "cascade_facade"]),
		);
		expect(ready.services?.some((service) => service.port === 8902)).toBe(false);

		const health = (await fetch("http://127.0.0.1:8910/health").then((response) =>
			response.json(),
		)) as {
			tts_enabled: boolean;
			avatar_enabled: boolean;
			mode: string;
		};
		expect(health).toMatchObject({
			tts_enabled: true,
			avatar_enabled: false,
			mode: "tts_only",
		});
		await expect(fetch("http://127.0.0.1:8902/health")).rejects.toThrow();

		await browser.execute(() => {
			const shell = window as typeof window & {
				__voice6gFetches?: Array<{ path: string; status: number }>;
			};
			shell.__voice6gFetches = [];
			const original = window.fetch.bind(window);
			window.fetch = async (...args) => {
				const response = await original(...args);
				const request = args[0];
				const raw =
					typeof request === "string"
						? request
						: request instanceof Request
							? request.url
							: String(request);
				try {
					shell.__voice6gFetches?.push({
						path: new URL(raw).pathname,
						status: response.status,
					});
				} catch {
					// Non-URL fetches are irrelevant to the cascade assertion.
				}
				return response;
			};
		});

		await sendMessage(
			"Respond with exactly: 6GB voice profile is ready. Do not add anything else.",
		);
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const events =
						(window as typeof window & {
							__voice6gFetches?: Array<{ path: string; status: number }>;
						}).__voice6gFetches ?? [];
					return events.some(
						(event) =>
							event.path === "/v1/audio/speech" && event.status === 200,
					);
				}),
			{
				timeout: 180_000,
				timeoutMsg: "Shell chat never synthesized the external LLM reply",
			},
		);
		const paths = await browser.execute(
			() =>
				(window as typeof window & {
					__voice6gFetches?: Array<{ path: string; status: number }>;
				}).__voice6gFetches ?? [],
		);
		expect(paths.some((event) => event.path === "/stream")).toBe(false);
		await browser.waitUntil(
			async () =>
				(await $("[data-avatar-loaded]").getAttribute("data-avatar-loaded")) ===
				"true",
			{
				timeout: 30_000,
				timeoutMsg: "Shell 3D VRM did not remain visible after speech",
			},
		);
		if (process.env.NAIA_E2E_VOICE_SCREENSHOT) {
			await browser.saveScreenshot(process.env.NAIA_E2E_VOICE_SCREENSHOT);
		}
	});
});
