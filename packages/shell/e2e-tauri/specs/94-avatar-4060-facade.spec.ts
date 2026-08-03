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

	async function submitText(text: string): Promise<number> {
		const input = await $(".chat-input");
		await input.waitForEnabled({ timeout: 30_000 });
		await input.setValue(text);
		const submittedAt = await browser.execute(() => performance.now());
		// While speech is active the visible button intentionally becomes Stop.
		// Enter follows ChatArea's real typed/STT barge-in path and performs
		// interrupt -> yield -> send in one user action.
		await input.click();
		await browser.keys("Enter");
		return submittedAt;
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
		const bootFileConfig = JSON.parse(bootConfigJson) as Record<
			string,
			unknown
		>;
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
		await browser.waitUntil(
			async () =>
				(await avatar.getAttribute("data-video-avatar-mode")) === "cascade",
			{
				timeout: 30_000,
				timeoutMsg: "loaded NVA did not settle from loading into cascade mode",
			},
		);
		const video = await avatar.$("video");
		await video.waitForExist({ timeout: 30_000 });
		await browser.waitUntil(
			async () => Boolean(await video.getAttribute("src")),
			{
				timeout: 30_000,
				timeoutMsg: "cascade avatar did not receive its idle media",
			},
		);

		// Video-avatar-only mode must keep the avatar mounted when voice output is off.
		await browser.execute(() => {
			const raw = window.localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			window.localStorage.setItem(
				"naia-config",
				JSON.stringify({ ...config, ttsEnabled: false }),
			);
			window.dispatchEvent(new CustomEvent("naia-config-changed"));
		});
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const raw = window.localStorage.getItem("naia-config");
					const config = raw ? JSON.parse(raw) : {};
					const avatar = document.querySelector("[data-video-avatar]");
					const video = avatar?.querySelector("video");
					return (
						config.ttsEnabled === false &&
						avatar?.getAttribute("data-video-avatar-loaded") === "true" &&
						Boolean(video?.getAttribute("src"))
					);
				}),
			{
				timeout: 10_000,
				interval: 250,
				timeoutMsg: "video avatar disappeared after TTS was disabled",
			},
		);

		// Re-enable voice and continue with the real voice + TRT lip-sync path below.
		await browser.execute(() => {
			const raw = window.localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			window.localStorage.setItem(
				"naia-config",
				JSON.stringify({ ...config, ttsEnabled: true }),
			);
			window.dispatchEvent(new CustomEvent("naia-config-changed"));
		});
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const raw = window.localStorage.getItem("naia-config");
					return raw ? JSON.parse(raw).ttsEnabled === true : false;
				}),
			{
				timeout: 5_000,
				interval: 200,
				timeoutMsg: "TTS was not re-enabled for combined avatar + voice test",
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
		await sendMessage("Respond with exactly 안녕. and nothing else.");
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const events =
						(
							window as typeof window & {
								__naiaCascadeFetches?: Array<{ url: string; status: number }>;
							}
						).__naiaCascadeFetches ?? [];
					const hasPath = (path: string) =>
						events.some((event) => {
							try {
								return (
									new URL(event.url).pathname === path && event.status === 200
								);
							} catch {
								return false;
							}
						});
					return (
						events.some(
							(event) =>
								event.url.endsWith("/v1/audio/speech") && event.status === 200,
						) && hasPath("/stream")
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
					const events =
						(
							window as typeof window & {
								__naiaOutputStages?: Array<{ text: string }>;
							}
						).__naiaOutputStages ?? [];
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

	it("runs radio BGM, automatic TRT lipsync, track change, and user barge-in together", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			localStorage.setItem(
				"naia-config",
				JSON.stringify({
					...config,
					ttsEnabled: true,
					ttsProvider: "naia-local-voice",
					vllmTtsHost: "http://127.0.0.1:8910",
					proactiveSpeechIdleMs: 5_000,
					proactiveSpeechIntervalMs: 30_000,
					proactiveSpeechBgmAutoPlay: true,
				}),
			);
			window.dispatchEvent(new CustomEvent("naia-config-changed"));
			const w = window as typeof window & {
				__naiaCascadeFetches?: Array<{ url: string; status: number }>;
				__naiaOutputStages?: Array<{ stage: string; at: number; text: string }>;
				__naiaAvatarPlaybackStarts?: number[];
			};
			w.__naiaCascadeFetches = [];
			w.__naiaOutputStages = [];
			w.__naiaAvatarPlaybackStarts = [];
		});
		await submitText("개인 라디오 시작해");
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const raw = localStorage.getItem("naia-config");
					const config = raw ? JSON.parse(raw) : {};
					return config.proactiveSpeechProfile === "personal_radio_dj";
				}),
			{
				timeout: 30_000,
				timeoutMsg: "personal radio profile was not activated",
			},
		);

		const player = await $(".bgm-player");
		await player.waitForExist({ timeout: 30_000 });
		const iframe = await $(".app-bg-iframe");
		await browser.waitUntil(
			async () =>
				(await player.getAttribute("data-bgm-playback-status")) === "loading" &&
				Boolean(await iframe.getAttribute("src")),
			{
				timeout: 90_000,
				timeoutMsg: "radio DJ did not request the first YouTube fixture track",
			},
		);
		await browser.switchToFrame(iframe);
		await $("#report-playing").click();
		await browser.switchToParentFrame();

		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const stage = document.querySelector<HTMLElement>(
						".chat-output-stage[data-stage]",
					)?.dataset.stage;
					return stage === "tts" || stage === "render";
				}),
			{
				timeout: 90_000,
				timeoutMsg: "observed first track did not trigger automatic DJ TTS",
			},
		);
		const maskedBeforePlayback = await browser.execute(() => {
			const messages = Array.from(
				document.querySelectorAll<HTMLElement>(
					".chat-message.assistant .message-content",
				),
			);
			return messages.at(-1)?.innerText.trim() ?? "";
		});
		expect(maskedBeforePlayback).toBe("");
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const w = window as typeof window & {
						__naiaCascadeFetches?: Array<{ url: string; status: number }>;
						__naiaAvatarPlaybackStarts?: number[];
					};
					const paths = (w.__naiaCascadeFetches ?? [])
						.filter((event) => event.status === 200)
						.map((event) => {
							try {
								return new URL(event.url).pathname;
							} catch {
								return "";
							}
						});
					return (
						paths.includes("/v1/audio/speech") &&
						paths.includes("/stream") &&
						(w.__naiaAvatarPlaybackStarts?.length ?? 0) > 0
					);
				}),
			{
				timeout: 120_000,
				timeoutMsg: "automatic DJ speech did not traverse VoxCPM2 and Ditto",
			},
		);
		await browser.waitUntil(
			async () =>
				(await player.getAttribute("data-bgm-playback-status")) === "playing",
			{ timeout: 30_000, timeoutMsg: "BGM stopped during DJ speech" },
		);

		const firstSrc = await iframe.getAttribute("src");
		const firstTitle = await player.getAttribute("data-bgm-current-title");
		const firstCascadeCounts = await browser.execute(() => {
			const fetches =
				(
					window as typeof window & {
						__naiaCascadeFetches?: Array<{ url: string; status: number }>;
					}
				).__naiaCascadeFetches ?? [];
			const countPath = (path: string) =>
				fetches.filter((event) => {
					try {
						return new URL(event.url).pathname === path && event.status === 200;
					} catch {
						return false;
					}
				}).length;
			return {
				speech: countPath("/v1/audio/speech"),
				stream: countPath("/stream"),
			};
		});
		await submitText("분위기 바꿔줘");
		await browser.waitUntil(
			async () => {
				// React replaces the iframe node when playbackId changes. Re-query it
				// instead of reading the detached element retained for track A.
				const nextSrc = await (await $(".app-bg-iframe")).getAttribute("src");
				return Boolean(
					nextSrc &&
						nextSrc !== firstSrc &&
						(await player.getAttribute("data-bgm-playback-status")) ===
							"loading",
				);
			},
			{
				timeout: 90_000,
				timeoutMsg: "change-vibe did not replace the YouTube track",
			},
		);
		const replacementIframe = await $(".app-bg-iframe");
		await browser.switchToFrame(replacementIframe);
		const reportReplacementPlaying = await $("#report-playing");
		await reportReplacementPlaying.waitForClickable({ timeout: 10_000 });
		await reportReplacementPlaying.click();
		await browser.switchToParentFrame();
		await browser.waitUntil(
			async () =>
				(await player.getAttribute("data-bgm-playback-status")) === "playing",
			{
				timeout: 5_000,
				timeoutMsg: "replacement iframe did not report observed playing",
			},
		);
		const replacementTitle = await player.getAttribute(
			"data-bgm-current-title",
		);
		expect(replacementTitle).toBeTruthy();
		expect(replacementTitle).not.toBe(firstTitle);
		await browser.waitUntil(
			() =>
				browser.execute((baseline: { speech: number; stream: number }) => {
					const w = window as typeof window & {
						__naiaCascadeFetches?: Array<{ url: string; status: number }>;
					};
					const fetches = w.__naiaCascadeFetches ?? [];
					const countPath = (path: string) =>
						fetches.filter((event) => {
							try {
								return (
									new URL(event.url).pathname === path && event.status === 200
								);
							} catch {
								return false;
							}
						}).length;
					const stage = document.querySelector<HTMLElement>(
						".chat-output-stage[data-stage]",
					)?.dataset.stage;
					return (
						countPath("/v1/audio/speech") > baseline.speech &&
						countPath("/stream") > baseline.stream &&
						stage === "render"
					);
				}, firstCascadeCounts),
			{
				timeout: 120_000,
				timeoutMsg: "replacement track did not start its DJ render",
			},
		);
		const replacementSpeech = await browser.execute(() => {
			const messages = Array.from(
				document.querySelectorAll<HTMLElement>(
					".chat-message.assistant .message-content",
				),
			);
			return messages.at(-1)?.innerText.trim() ?? "";
		});
		expect(replacementSpeech).not.toContain("찾지 못했어요");

		await browser.execute(() => {
			const w = window as typeof window & {
				__naiaBargeInTiming?: { keyAt: number; clearedAt: number };
			};
			w.__naiaBargeInTiming = { keyAt: 0, clearedAt: 0 };
			const captureClear = () => {
				const stage = document.querySelector<HTMLElement>(
					".chat-output-stage[data-stage]",
				)?.dataset.stage;
				if (
					w.__naiaBargeInTiming?.keyAt &&
					stage !== "render" &&
					!w.__naiaBargeInTiming.clearedAt
				) {
					w.__naiaBargeInTiming.clearedAt = performance.now();
				}
			};
			new MutationObserver(captureClear).observe(document.body, {
				attributes: true,
				childList: true,
				subtree: true,
				attributeFilter: ["data-stage"],
			});
			document.querySelector(".chat-input")?.addEventListener(
				"keydown",
				(event) => {
					if (
						(event as KeyboardEvent).key === "Enter" &&
						w.__naiaBargeInTiming
					) {
						w.__naiaBargeInTiming.keyAt = performance.now();
					}
				},
				{ capture: true, once: true },
			);
		});
		await submitText("한 문장으로 지금 재생 상태를 알려줘.");
		await browser.waitUntil(
			() =>
				browser.execute(() =>
					Boolean(
						(
							window as typeof window & {
								__naiaBargeInTiming?: { clearedAt: number };
							}
						).__naiaBargeInTiming?.clearedAt,
					),
				),
			{
				timeout: 2_000,
				timeoutMsg:
					"user barge-in did not clear active Ditto render within 250ms",
			},
		);
		const bargeInTiming = await browser.execute(
			() =>
				(
					window as typeof window & {
						__naiaBargeInTiming?: { keyAt: number; clearedAt: number };
					}
				).__naiaBargeInTiming,
		);
		expect(bargeInTiming).toBeTruthy();
		expect(bargeInTiming!.clearedAt - bargeInTiming!.keyAt).toBeLessThanOrEqual(
			250,
		);
		expect(await player.getAttribute("data-bgm-playback-status")).toBe(
			"playing",
		);
		await browser.waitUntil(
			() =>
				browser.execute(() =>
					Array.from(
						document.querySelectorAll<HTMLElement>(".chat-message.user"),
					).some((node) => node.innerText.includes("지금 재생 상태")),
				),
			{
				timeout: 30_000,
				timeoutMsg: "barge-in question was not accepted as the priority turn",
			},
		);

		await submitText("라디오 종료");
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const raw = localStorage.getItem("naia-config");
					const config = raw ? JSON.parse(raw) : {};
					return config.proactiveSpeechProfile === "disabled";
				}),
			{ timeout: 30_000, timeoutMsg: "radio profile did not stop" },
		);
	});
});
