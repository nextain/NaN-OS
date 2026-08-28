import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #453 — the local-voice PICKER contract, engine-independent (restored):
 * browsing, gender filtering, preview and upload must all work with the engine
 * COMPLETELY DOWN, exactly like the pre-regression code. Binding the picker to
 * the engine's /ref/voices was the regression that made "프리셋에서 고르기"
 * empty, preview dead, and upload error while the engine was still loading.
 *
 * The preset list comes from the REAL cloud gateway (live /v1/ref-audio/presets
 * with the member key from NAIA_E2E_KEY); previews are the catalog's public
 * sample URLs; upload stores the clip locally (the runtime receives it at
 * synthesis time). Speaking with the engine is covered by voxcpm2-lipsync /
 * voxcpm2-voice-e2e.
 */

const NAIA_KEY = process.env.NAIA_E2E_KEY || "";

function buildMock(): string {
	return `
(function(){
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow:{label:"main"}, currentWebview:{windowLabel:"main",label:"main"} };
	var cbs=new Map(), nid=1;
	window.__TAURI_INTERNALS__.transformCallback=function(fn,once){var id=nid++;cbs.set(id,function(d){if(once)cbs.delete(id);return fn&&fn(d);});return id;};
	window.__TAURI_INTERNALS__.unregisterCallback=function(id){cbs.delete(id);};
	window.__TAURI_INTERNALS__.runCallback=function(id,d){var cb=cbs.get(id);if(cb)cb(d);};
	window.__TAURI_INTERNALS__.callbacks=cbs;
	var evs=new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener=function(){};
	window.__TAURI_INTERNALS__.convertFileSrc=function(p,proto){return (proto||"asset")+"://localhost/"+encodeURIComponent(p);};
	window.__TAURI_INTERNALS__.invoke=async function(cmd,args){
		if(cmd==="plugin:event|listen"){ if(!evs.has(args.event))evs.set(args.event,[]); evs.get(args.event).push(args.handler); return args.handler; }
		if(cmd==="plugin:event|emit"||cmd==="plugin:event|unlisten") return null;
		if(cmd==="plugin:store|get") return (args&&args.key==="naiaKey")?[${JSON.stringify(NAIA_KEY)},true]:[null,false];
		if(cmd==="detect_gpu_vram") return 8;
		// Engine fully DOWN — the picker must not care.
		if(cmd==="voxcpm2_status") return false;
		if(cmd==="voxcpm2_installation_status") return {phase:"ready",ready:true,canStart:true,summary:"ready",steps:[]};
		if(cmd==="install_voxcpm2_runtime"||cmd==="start_voxcpm2"||cmd==="stop_voxcpm2") return null;
		if(cmd==="write_slots_manifest"||cmd==="write_naia_config") return null;
		return undefined;
	};
})();
`;
}

test.describe("local voice picker — engine-independent (cloud catalog)", () => {
	test.skip(!NAIA_KEY, "NAIA_E2E_KEY not set (live gateway catalog required)");
	test.setTimeout(120_000);

	test("browse + gender filter + preview + upload all work with the engine down", async ({
		page,
	}) => {
		await page.addInitScript(buildMock());
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		// REAL playback tracing (not a stub): wrap the native Audio so the test can
		// assert the preview actually starts playing real bytes from the canonical
		// (Azure) host — the "no-error" check alone missed a host the platform
		// refused to play (mediaError 4).
		await page.addInitScript(`
			window.__AUDIO_TRACE__ = { created: [], playing: [], errors: [] };
			const NativeAudio = window.Audio;
			window.Audio = function (src) {
				const a = new NativeAudio(src);
				if (src) window.__AUDIO_TRACE__.created.push(String(src));
				a.addEventListener("playing", () =>
					window.__AUDIO_TRACE__.playing.push(String(a.currentSrc || a.src)),
				);
				a.addEventListener("error", () =>
					window.__AUDIO_TRACE__.errors.push({
						src: String(a.currentSrc || a.src),
						code: a.error ? a.error.code : null,
					}),
				);
				return a;
			};
		`);
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: NAIA_KEY,
				enableTools: false,
				ttsEnabled: true,
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
				localGpuTier: "windows-voice-6g",
				locale: "ko",
				onboardingComplete: true,
			}),
		);

		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 20_000 });
		await page.getByRole("button", { name: /^(설정|Settings)$/ }).click();
		await page.locator('[data-settings-tab="voice"]').click();

		// 1) BROWSE: the picker loads the LIVE cloud catalog with the engine down.
		await page
			.locator("details summary")
			.filter({ hasText: /프리셋|preset/i })
			.first()
			.click();
		const items = page.locator(".ref-preset-item");
		await expect
			.poll(async () => items.count(), { timeout: 20_000 })
			.toBeGreaterThanOrEqual(4);
		const allCount = await items.count();

		// 2) GENDER FILTER: male/female narrow the list (the "남성/여성 음색 선택"
		// the user lost). Each filtered view is a strict subset.
		const genderSelect = page
			.locator("select")
			.filter({ has: page.locator('option[value="male"]') })
			.first();
		await genderSelect.selectOption("male");
		const maleCount = await items.count();
		expect(maleCount).toBeGreaterThanOrEqual(1);
		expect(maleCount).toBeLessThan(allCount);
		await genderSelect.selectOption("female");
		const femaleCount = await items.count();
		expect(femaleCount).toBeGreaterThanOrEqual(1);
		expect(maleCount + femaleCount).toBeLessThanOrEqual(allCount);
		await genderSelect.selectOption("all");

		// 3) PREVIEW — REAL playback: the clip must actually reach the `playing`
		// state (real bytes decoded), and the source must be the canonical Azure
		// host — a GCS URL leaking through the normalizer, or a host the media
		// stack refuses (mediaError 4), fails here.
		await items.first().getByRole("button").first().click();
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(window as unknown as {
								__AUDIO_TRACE__: { playing: string[] };
							}).__AUDIO_TRACE__.playing.length,
					),
				{ timeout: 15_000 },
			)
			.toBeGreaterThan(0);
		const trace = await page.evaluate(
			() =>
				(window as unknown as {
					__AUDIO_TRACE__: {
						playing: string[];
						errors: Array<{ src: string; code: number | null }>;
					};
				}).__AUDIO_TRACE__,
		);
		expect(trace.errors, `media errors: ${JSON.stringify(trace.errors)}`).toEqual([]);
		expect(trace.playing[0]).toContain(
			"stnaiapub83b29893.blob.core.windows.net/ref-audio/",
		);
		await expect(page.locator(".settings-error")).toHaveCount(0);

		// 4) UPLOAD: stores the clip locally and becomes the active voice — engine
		// still down. Wait for the applied notice (not a race). The fixture must be
		// REAL decodable audio: encodeRefAudio runs AudioContext.decodeAudioData,
		// which rejects a zero-sample WAV — so synthesize 0.3s of 440Hz PCM16.
		const sr = 16000;
		const n = Math.floor(sr * 0.3);
		const wav = Buffer.alloc(44 + n * 2);
		wav.write("RIFF", 0);
		wav.writeUInt32LE(36 + n * 2, 4);
		wav.write("WAVE", 8);
		wav.write("fmt ", 12);
		wav.writeUInt32LE(16, 16);
		wav.writeUInt16LE(1, 20); // PCM
		wav.writeUInt16LE(1, 22); // mono
		wav.writeUInt32LE(sr, 24);
		wav.writeUInt32LE(sr * 2, 28);
		wav.writeUInt16LE(2, 32);
		wav.writeUInt16LE(16, 34);
		wav.write("data", 36);
		wav.writeUInt32LE(n * 2, 40);
		for (let i = 0; i < n; i++) {
			wav.writeInt16LE(
				Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000),
				44 + i * 2,
			);
		}
		await page.setInputFiles('[data-testid="ref-audio-file-input"]', {
			name: "my-voice.wav",
			mimeType: "audio/wav",
			buffer: wav,
		});
		await expect(page.getByText(/적용되었습니다|voice applied/i)).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator(".settings-error")).toHaveCount(0);
	});
});
