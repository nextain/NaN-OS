import { existsSync, readFileSync } from "node:fs";
import {
	E2E_CONFIG_PATH,
	E2E_SLOTS_MANIFEST_PATH,
	E2E_UI_CONFIG_PATH,
} from "../codex-e2e-environment.js";

describe("GPU-free pre-baked NVA through the real Tauri Shell", () => {
	it("loads a local WebM in WebView2 without login, GPU, or Ditto runtime", async () => {
		await browser.waitUntil(
			() => browser.execute(() => document.querySelector(".app-root") !== null),
			{ timeout: 45_000, timeoutMsg: "Shell app root did not render" },
		);
		await browser.waitUntil(
			() =>
				browser.execute(() => {
					const avatar = document.querySelector<HTMLElement>("[data-video-avatar]");
					const video = document.querySelector<HTMLVideoElement>(
						"[data-video-avatar-prebaked]",
					);
					return (
						avatar?.dataset.videoAvatarLoaded === "true" &&
						video !== null &&
						video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
					);
				}),
			{
				timeout: 60_000,
				timeoutMsg: "local pre-baked NVA WebM did not become playable",
			},
		);

		const state = await browser.execute(() => {
			const avatar = document.querySelector<HTMLElement>("[data-video-avatar]");
			const video = document.querySelector<HTMLVideoElement>(
				"[data-video-avatar-prebaked]",
			);
			const rect = video?.getBoundingClientRect();
			return {
				mode: avatar?.dataset.videoAvatarMode,
				loaded: avatar?.dataset.videoAvatarLoaded,
				model: avatar?.dataset.nvaModel,
				error: avatar?.dataset.videoAvatarError,
				currentSrc: video?.currentSrc,
				paused: video?.paused,
				loop: video?.loop,
				muted: video?.muted,
				width: rect?.width ?? 0,
				height: rect?.height ?? 0,
				statusOverlay:
					document.querySelector("[data-video-avatar-status]") !== null,
			};
		});
		expect(state).toMatchObject({
			mode: "prebaked",
			loaded: "true",
			model: "naia-prebaked",
			error: "",
			paused: false,
			loop: true,
			muted: true,
			statusOverlay: false,
		});
		expect(state.currentSrc).toMatch(/^blob:/);
		expect(state.width).toBeGreaterThan(0);
		expect(state.height).toBeGreaterThan(0);

		const cascadeRunning = await browser.execute(async () => {
			const shell = window as unknown as {
				__TAURI_INTERNALS__?: {
					invoke: (command: string, value?: unknown) => Promise<unknown>;
				};
			};
			return shell.__TAURI_INTERNALS__?.invoke("cascade_status");
		});
		expect(cascadeRunning).toBe(false);

		const config = JSON.parse(readFileSync(E2E_CONFIG_PATH, "utf8"));
		const uiConfig = JSON.parse(readFileSync(E2E_UI_CONFIG_PATH, "utf8"));
		expect(uiConfig).toMatchObject({
			avatarProvider: "naia-video-avatar",
			nvaModel: "naia-prebaked",
		});
		for (const value of [config, uiConfig]) {
			expect(value.naiaKey).toBeUndefined();
			expect(value.localGpuTier).toBeUndefined();
			expect(value.vllmTtsHost).toBeUndefined();
			expect(value.cascadeRuntimeUrl).toBeUndefined();
		}

		await browser.waitUntil(() => Promise.resolve(existsSync(E2E_SLOTS_MANIFEST_PATH)), {
			timeout: 15_000,
			timeoutMsg: "Shell did not emit slots-manifest.json",
		});
		const slots = JSON.parse(readFileSync(E2E_SLOTS_MANIFEST_PATH, "utf8"));
		expect(slots.slots.avatar).toEqual({
			provider: "prebaked-video",
			model: "naia-prebaked",
		});
		expect(JSON.stringify(slots).toLowerCase()).not.toContain("ditto");
	});
});
