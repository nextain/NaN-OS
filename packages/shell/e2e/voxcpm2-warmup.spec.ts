import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";
import {
	type RealEngine,
	realEnginePrereqsMet,
	startRealEngine,
	stopRealEngine,
} from "./helpers/voxcpm2-engine";

/**
 * Apply-time voice warm-up (cold-cost prepayment) — REAL engine.
 *
 * The FIRST synthesis with a never-used reference voice costs ~40-60s (prompt
 * cache + runaway-prone), which in live chat reads as "broken": the user sends
 * a new message, new-input priority aborts the almost-finished synthesis, and
 * the loop repeats (2026-08-18 실측). The fix: applying a preset or uploading a
 * clip fires ONE background synthesis so the first real reply is warm.
 *
 * Verification is SERVER-SIDE truth: the engine helper persists the [voxsrv]
 * request trace to test-results/e2e-engine-stderr.log; this spec polls it for
 * the warm-up's `synth.start`/`synth.done`. (An earlier version observed via
 * page.route pass-through — the interception itself stalled the webview's
 * fetch, so the observation layer killed the feature under test.) The startup
 * prime never logs `synth.start` (it calls the runtime directly), so with no
 * chat sent every `synth.start` here IS an apply-time warm-up.
 */

const prereq = realEnginePrereqsMet();
const NAIA_KEY = process.env.NAIA_E2E_KEY || "";
const RUNTIME_VOICES = join(
	process.env.NAIA_VOXCPM2_RUNTIME_ROOT ||
		join(homedir(), ".naia-dev", "voxcpm2-runtime"),
	"voices",
);
const ENGINE_TRACE = join(process.cwd(), "test-results", "e2e-engine-stderr.log");
let engine: RealEngine | null = null;

function latestTrace(): string {
	if (!existsSync(ENGINE_TRACE)) return "";
	const all = readFileSync(ENGINE_TRACE, "utf8");
	const marker = all.lastIndexOf("===== engine spawn");
	return marker >= 0 ? all.slice(marker) : all;
}

/** All completed HTTP syntheses: [{voice, bytes}] from `synth.done` lines. */
function completedSynths(): Array<{ voice: string; bytes: number }> {
	const out: Array<{ voice: string; bytes: number }> = [];
	const re = /synth\.done voice=(\S+) secs=[\d.]+ bytes=(\d+)/g;
	// tqdm progress bars interleave with trace lines — match the raw text.
	for (const m of latestTrace().matchAll(re))
		out.push({ voice: m[1], bytes: Number(m[2]) });
	return out;
}

function baseInvokeMock(token: string): string {
	return `
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow:{label:"main"}, currentWebview:{windowLabel:"main",label:"main"} };
	var cbs=new Map(), nid=1;
	window.__TAURI_INTERNALS__.transformCallback=function(fn,once){var id=nid++;cbs.set(id,function(d){if(once)cbs.delete(id);return fn&&fn(d);});return id;};
	window.__TAURI_INTERNALS__.unregisterCallback=function(id){cbs.delete(id);};
	window.__TAURI_INTERNALS__.runCallback=function(id,d){var cb=cbs.get(id);if(cb)cb(d);};
	var evs=new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener=function(){};
	function emit(e,p){(evs.get(e)||[]).forEach(function(h){window.__TAURI_INTERNALS__.runCallback(h,{event:e,payload:p});});}
	var invoke = async function(cmd,args){
		if(cmd==="plugin:event|listen"){ if(!evs.has(args.event))evs.set(args.event,[]); evs.get(args.event).push(args.handler); return args.handler; }
		if(cmd==="plugin:event|emit"){ emit(args.event,args.payload); return null; }
		if(cmd==="plugin:event|unlisten") return;
		if(cmd==="plugin:store|get") return (args&&args.key==="naiaKey")?[${JSON.stringify(NAIA_KEY)},true]:[null,false];
		if(cmd==="detect_gpu_vram") return 8;
		if(cmd==="voxcpm2_status") return true;
		if(cmd==="voxcpm2_installation_status") return {phase:"ready",ready:true,canStart:true,summary:"ready",steps:[]};
		if(cmd==="install_voxcpm2_runtime") return null;
		if(cmd==="start_voxcpm2") return JSON.stringify({schema_version:1,service:"voxcpm2-tensorrt",capabilities:["tts"],port:8910,local_access_token:${JSON.stringify(token)}});
		if(cmd==="stop_voxcpm2"||cmd==="write_slots_manifest"||cmd==="write_naia_config") return null;
		return undefined;
	};
	window.__TAURI_INTERNALS__.invoke = invoke;
`;
}

function configJson(): string {
	return JSON.stringify({
		provider: "gemini",
		model: "gemini-2.5-flash",
		apiKey: "e2e-mock-key",
		enableTools: false,
		sttProvider: "vosk",
		sttModel: "vosk-model-small-ko-0.22",
		ttsEnabled: true,
		ttsProvider: "naia-local-voice",
		vllmTtsHost: "http://127.0.0.1:8910",
		localGpuTier: "windows-voice-6g",
		naiaKey: NAIA_KEY,
		locale: "ko",
		onboardingComplete: true,
	});
}

test.describe("voice warm-up on apply — real engine", () => {
	test.skip(!prereq.ok, `real engine prereqs missing: ${prereq.reason}`);
	test.setTimeout(420_000);

	test.beforeAll(async () => {
		engine = await startRealEngine(undefined, 8910);
	});
	test.afterAll(() => stopRealEngine(engine));

	test("preset apply and upload each fire ONE background warm synthesis (no chat)", async ({
		page,
	}) => {
		const token = engine?.token ?? "";

		// Webview console → assertion messages ([tts-warm] traces are the
		// client-side counterpart when a warm never reaches the engine).
		const consoleLines: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (/tts-warm|tts-synthesize|RefAudio/i.test(text))
				consoleLines.push(text.slice(0, 300));
		});
		const dumpConsole = () => consoleLines.slice(-30).join("\n");

		await page.addInitScript(`(function(){${baseInvokeMock(token)}})();`);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			configJson(),
		);

		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 20_000 });

		// Settings → voice → open the preset picker (live cloud catalog).
		await page.getByRole("button", { name: /^(설정|Settings)$/ }).click();
		await page.locator('[data-settings-tab="voice"]').click();
		await page
			.locator("details summary")
			.filter({ hasText: /프리셋|preset/i })
			.first()
			.click();
		const items = page.locator(".ref-preset-item");
		await expect
			.poll(async () => items.count(), { timeout: 20_000 })
			.toBeGreaterThanOrEqual(4);

		// 1) APPLY a preset — NO chat message anywhere in this spec.
		await items
			.first()
			.getByRole("button", { name: /적용|apply/i })
			.click();
		await expect(
			page.getByText(/음색으로 변경되었습니다|Voice changed to/i),
		).toBeVisible({ timeout: 10_000 });

		// The warm-up must reach the engine BY ITSELF and complete with real
		// audio. Budget: the startup prime can hold the single slot ~40s, then
		// the cold warm itself can take ~40-60s on the 4060.
		await expect
			.poll(
				() =>
					completedSynths().find(
						(s) => s.voice !== "current.wav" && s.voice.endsWith(".wav"),
					)?.bytes ?? 0,
				{
					timeout: 180_000,
					message: `preset warm never completed on the engine.\nconsole:\n${dumpConsole()}`,
				},
			)
			.toBeGreaterThan(40_000);

		// 2) UPLOAD a clip (single-flight: the preset warm above has completed) —
		// the warm installs the clip (PUT /voice; a failed install aborts the
		// warm, so a completed "current" synthesis proves the install) and then
		// synthesizes voice "current".
		const realWav = readFileSync(join(RUNTIME_VOICES, "cc0-ko-male-02.wav"));
		await page.setInputFiles('[data-testid="ref-audio-file-input"]', {
			name: "my-voice.wav",
			mimeType: "audio/wav",
			buffer: realWav,
		});
		await expect(page.getByText(/적용되었습니다|voice applied/i)).toBeVisible({
			timeout: 30_000,
		});
		await expect
			.poll(
				() =>
					completedSynths().find((s) => s.voice === "current.wav")?.bytes ?? 0,
				{
					timeout: 180_000,
					message: `upload warm never completed on the engine.\nconsole:\n${dumpConsole()}`,
				},
			)
			.toBeGreaterThan(40_000);

		// No stray synthesis: with no chat sent, every completed HTTP synthesis
		// in this engine session is an apply-time warm-up (prime logs no
		// synth.start/done) — exactly one per apply action.
		expect(completedSynths().length).toBe(2);
	});
});
