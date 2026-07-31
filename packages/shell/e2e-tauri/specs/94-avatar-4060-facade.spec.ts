import { sendMessage } from "../helpers/chat.js";

describe("4060 local voice and Ditto avatar through the real Tauri Shell", () => {
	after(async () => {
		// The facade is a real user-owned process, not an E2E fixture. It was
		// pointed at the isolated copied bundle during this acceptance, so restore
		// its configured source before the E2E root is cleaned up.
		const source = process.env.NAIA_E2E_NVA_SOURCE;
		if (!source) return;
		const response = await fetch("http://127.0.0.1:8910/load_nva", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ dir: source }),
		});
		if (!response.ok) {
			throw new Error(
				`failed to restore the live NVA after E2E: HTTP ${response.status}`,
			);
		}
	});

	async function tauriInvoke<T>(
		command: string,
		args: Record<string, unknown>,
	): Promise<T> {
		return (await browser.execute(
			async (name: string, payload: Record<string, unknown>) => {
				const w = window as unknown as {
					__TAURI_INTERNALS__?: {
						invoke: (command: string, value: unknown) => Promise<unknown>;
					};
					__TAURI__?: {
						core?: {
							invoke: (command: string, value: unknown) => Promise<unknown>;
						};
					};
				};
				const invoke =
					w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke;
				if (!invoke) throw new Error("Tauri invoke unavailable");
				return invoke(name, payload);
			},
			command,
			args,
		)) as T;
	}

	it("loads the copied NVA in the live facade and exposes the rendered avatar", async () => {
		await browser.waitUntil(
			() => browser.execute(() => document.querySelector(".app-root") !== null),
			{ timeout: 45_000, timeoutMsg: "Shell app root did not render" },
		);
		// The App listener that reflects persisted settings into its avatar state is
		// registered after the first shell paint.
		await browser.pause(1_000);
		const adkPath = process.env.NAIA_E2E_ADK_PATH;
		expect(adkPath).toBeTruthy();
		const bootUiJson = await tauriInvoke<string>("read_naia_ui_config", {
			adkPath: adkPath ?? "",
		});
		const bootUi = JSON.parse(bootUiJson) as Record<string, unknown>;
		const bootConfigJson = await tauriInvoke<string>("read_naia_config", {
			adkPath: adkPath ?? "",
		});
		const bootFileConfig = JSON.parse(bootConfigJson) as Record<string, unknown>;
		const detectedVramGb = await tauriInvoke<number | null>(
			"detect_gpu_vram",
			{},
		);
		expect(detectedVramGb).toBeGreaterThanOrEqual(8);
		// A normal shell boot must not let early BGM/default UI state replace the
		// stored 4060 voice/avatar selection before the renderer hydrates.
		expect(bootUi).toMatchObject({
			avatarProvider: "naia-video-avatar",
			nvaModel: "naia",
			ttsProvider: "naia-local-voice",
		});
		expect(new URL(String(bootUi.vllmTtsHost)).port).toBe("8910");
		expect(["127.0.0.1", "localhost"]).toContain(
			new URL(String(bootUi.vllmTtsHost)).hostname,
		);
		try {
			await browser.waitUntil(
				async () => {
				const bootConfig = await browser.execute(
					() =>
						JSON.parse(localStorage.getItem("naia-config") ?? "{}") as Record<
							string,
							unknown
						>,
				);
				return (
					bootConfig.avatarProvider === "naia-video-avatar" &&
					bootConfig.nvaModel === "naia" &&
					bootConfig.ttsProvider === "naia-local-voice" &&
					typeof bootConfig.vllmTtsHost === "string" &&
					(() => {
						const host = new URL(bootConfig.vllmTtsHost).hostname;
						return host === "127.0.0.1" || host === "localhost";
					})()
				);
				},
				{
					timeout: 20_000,
					timeoutMsg:
						"file-backed 4060 voice/avatar settings never hydrated into Shell",
				},
			);
		} catch (error) {
			const observed = await browser.execute(() =>
				JSON.parse(localStorage.getItem("naia-config") ?? "{}"),
			);
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}; observed=${JSON.stringify(observed)}; bootFileConfig=${JSON.stringify(bootFileConfig)}; bootUi=${JSON.stringify(bootUi)}; detectedVramGb=${detectedVramGb}`,
			);
		}
		await browser.waitUntil(
			() =>
				browser.execute(
					() => document.querySelector("[data-video-avatar]") !== null,
				),
			{
				timeout: 45_000,
				timeoutMsg: "video avatar did not mount from persisted settings",
			},
		);
		const avatar = await $("[data-video-avatar]");
		await browser.waitUntil(
			async () =>
				(await avatar.getAttribute("data-video-avatar-loaded")) === "true",
			{
				timeout: 90_000,
				timeoutMsg: "4060 cascade never loaded the selected NVA",
			},
		);
		expect(await avatar.getAttribute("data-video-avatar-mode")).toBe("cascade");
		const video = await avatar.$("video");
		await video.waitForExist({ timeout: 30_000 });
		await browser.waitUntil(
			async () => Boolean(await video.getAttribute("src")),
			{
				timeout: 30_000,
				timeoutMsg: "cascade avatar did not receive its idle media",
			},
		);
		await browser.waitUntil(
			() => browser.execute(() => !document.querySelector(".splash-screen")),
			{
				timeout: 30_000,
				timeoutMsg: "splash overlay did not dismiss after NVA became ready",
			},
		);
		if (process.env.NAIA_E2E_IDLE_SCREENSHOT) {
			await browser.saveScreenshot(process.env.NAIA_E2E_IDLE_SCREENSHOT);
		}

		// Keep this a real Shell path: observe the live browser fetches but forward
		// every request unchanged. The LLM response must be synthesized by the
		// local facade and its resulting PCM must be sent to Ditto's /stream route.
		await browser.execute(() => {
			const w = window as typeof window & {
				__naiaCascadeFetches?: Array<{ url: string; status: number }>;
				__naiaOriginalFetch?: typeof fetch;
				__naiaOutputStages?: Array<{ stage: string; at: number; text: string }>;
				__naiaAvatarPlaybackStarts?: number[];
			};
			w.__naiaCascadeFetches = [];
			w.__naiaOutputStages = [];
			w.__naiaAvatarPlaybackStarts = [];
			let lastStage = "";
			let lastText = "";
			const captureOutput = () => {
				const stage =
					document.querySelector<HTMLElement>(".chat-output-stage[data-stage]")
						?.dataset.stage ?? "";
				const messages = Array.from(
					document.querySelectorAll<HTMLElement>(
						".chat-message.assistant .message-content",
					),
				);
				const text = messages.at(-1)?.innerText.trim() ?? "";
				if (stage !== lastStage || text !== lastText) {
					w.__naiaOutputStages?.push({ stage, at: performance.now(), text });
					lastStage = stage;
					lastText = text;
				}
			};
			new MutationObserver(captureOutput).observe(document.body, {
				attributes: true,
				childList: true,
				characterData: true,
				subtree: true,
				attributeFilter: ["data-stage"],
			});
			const avatarVideos = Array.from(
				document.querySelectorAll<HTMLVideoElement>(
				"[data-video-avatar] video",
				),
			);
			const backVideo =
				avatarVideos.find((candidate) => candidate.style.zIndex === "1") ??
				avatarVideos.at(-1);
			backVideo?.addEventListener("playing", () => {
					w.__naiaAvatarPlaybackStarts?.push(performance.now());
			});
			captureOutput();
			if (!w.__naiaOriginalFetch) {
				w.__naiaOriginalFetch = window.fetch.bind(window);
				window.fetch = async (...args) => {
					const response = await w.__naiaOriginalFetch!(...args);
					const request = args[0];
					const url =
						typeof request === "string"
							? request
							: request instanceof Request
								? request.url
								: String(request);
					w.__naiaCascadeFetches?.push({ url, status: response.status });
					return response;
				};
			}
		});
		await sendMessage(
			"Respond with exactly 안녕. and nothing else.",
		);
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const events = (window as typeof window & {
						__naiaCascadeFetches?: Array<{ url: string; status: number }>;
					}).__naiaCascadeFetches ?? [];
					const hasPath = (path: string) =>
						events.some((event) => {
							try {
								return new URL(event.url).pathname === path && event.status === 200;
							} catch {
								return false;
							}
						});
					return (
						events.some(
							(event) =>
								event.url.endsWith("/v1/audio/speech") && event.status === 200,
						) &&
						hasPath("/stream")
					);
				}),
			{
				timeout: 90_000,
				timeoutMsg:
					"Shell chat did not complete both local VoxCPM2 synthesis and Ditto lip-sync streaming",
			},
		);
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const events = (window as typeof window & {
						__naiaOutputStages?: Array<{ text: string }>;
					}).__naiaOutputStages ?? [];
					return events.some((event) => event.text.includes("안녕."));
				}),
			{
				timeout: 30_000,
				timeoutMsg: "assistant text was not revealed with avatar playback",
			},
		);
		const syncEvidence = await browser.execute(() => {
			const w = window as typeof window & {
				__naiaCascadeFetches?: Array<{ url: string; status: number }>;
				__naiaOutputStages?: Array<{ stage: string; at: number; text: string }>;
				__naiaAvatarPlaybackStarts?: number[];
			};
			return {
				fetches: w.__naiaCascadeFetches ?? [],
				events: w.__naiaOutputStages ?? [],
				playbackStarts: w.__naiaAvatarPlaybackStarts ?? [],
			};
		});
		process.stdout.write(
			`[avatar-4060-evidence] ${JSON.stringify(syncEvidence)}\n`,
		);
		const stages = syncEvidence.events
			.map((event) => event.stage)
			.filter((stage, index, all) => stage && stage !== all[index - 1]);
		const thinkingIndex = stages.indexOf("thinking");
		const ttsIndex = stages.indexOf("tts", thinkingIndex + 1);
		const renderIndex = stages.indexOf("render", ttsIndex + 1);
		expect(thinkingIndex).toBeGreaterThanOrEqual(0);
		expect(ttsIndex).toBeGreaterThan(thinkingIndex);
		expect(renderIndex).toBeGreaterThan(ttsIndex);
		const renderWhileMasked = syncEvidence.events.find(
			(event) => event.stage === "render" && event.text === "",
		);
		expect(renderWhileMasked).toBeTruthy();
		const firstRevealed = syncEvidence.events.find((event) =>
			event.text.includes("안녕."),
		);
		expect(firstRevealed).toBeTruthy();
		expect(syncEvidence.playbackStarts.length).toBeGreaterThan(0);
		expect(firstRevealed!.at).toBeGreaterThanOrEqual(
			Math.min(...syncEvidence.playbackStarts),
		);
		if (process.env.NAIA_E2E_SPEAKING_SCREENSHOT) {
			await browser.saveScreenshot(process.env.NAIA_E2E_SPEAKING_SCREENSHOT);
		}
	});
});
