import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
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
 * #453 GOAL 1 (adversarial-review hardened) — REAL TensorRT engine, gaps closed:
 *  - TRT DLL is attested in-test (/health backend = tensorrt_locdit + engine);
 *  - two DIFFERENT voices synthesize to DIFFERENT real, non-trivial RIFF audio;
 *  - the picker shows the male/female CC0 palette, gender-filterable;
 *  - a REAL CC0 WAV upload becomes the active voice (waits for the applied state);
 *  - a chat reply is synthesized with the UPLOADED voice ("current", not the
 *    default), the /v1/audio/speech response is real RIFF audio of non-trivial
 *    size, and playback drives the speaking / lip-sync state.
 * The /v1/audio/speech fetch is passed THROUGH to :8910 and its bytes asserted —
 * the audio is real; only the HTMLAudioElement clock is stubbed (headless).
 */

const prereq = realEnginePrereqsMet();
const NAIA_KEY = process.env.NAIA_E2E_KEY || "";
const RUNTIME_VOICES = join(
	process.env.NAIA_VOXCPM2_RUNTIME_ROOT ||
		join(homedir(), ".naia-dev", "voxcpm2-runtime"),
	"voices",
);
let engine: RealEngine | null = null;

function baseInvokeMock(token: string): string {
	return `
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
	window.__NAIA_E2E__=window.__NAIA_E2E__||{};
	function emit(e,p){(evs.get(e)||[]).forEach(function(h){window.__TAURI_INTERNALS__.runCallback(h,{event:e,payload:p});});}
	window.__NAIA_E2E__.emit=emit;
	window.__TAURI_INTERNALS__.convertFileSrc=function(p,proto){return (proto||"asset")+"://localhost/"+encodeURIComponent(p);};
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
		if(cmd==="plugin:stt|start_listening"){ setTimeout(function(){ emit("plugin:stt:stateChange",{state:"listening"}); },60); return; }
		if(cmd==="plugin:stt|stop_listening"){ emit("plugin:stt:stateChange",{state:"idle"}); return; }
		if(cmd==="plugin:stt|is_available") return {available:true,reason:null};
		if(cmd==="plugin:stt|check_permission"||cmd==="plugin:stt|request_permission") return {microphone:"granted",speechRecognition:"granted"};
		if(cmd==="plugin:stt|get_supported_languages") return {languages:[{code:"ko-KR",name:"Korean",installed:true}]};
		if(cmd==="send_to_agent_command"){
			var req=JSON.parse(args.message);
			if(req.type==="chat_request"){
				var id=req.requestId;
				var chunks=[{type:"text",requestId:id,text:"반갑습니다."},{type:"finish",requestId:id}];
				var d=60; chunks.forEach(function(c){ setTimeout(function(){ emit("agent_response",JSON.stringify(c)); },d); d+=60; });
			}
			return;
		}
		return undefined;
	};
	window.__TAURI_INTERNALS__.invoke = invoke;
`;
}

const AUDIO_STUB = `
	window.__NAIA_E2E__=window.__NAIA_E2E__||{}; window.__NAIA_E2E__.audioPlayed=[];
	window.Audio=function(src){
		var a={src:src||"",paused:true};
		a.play=function(){ a.paused=false; window.__NAIA_E2E__.audioPlayed.push(String(a.src).slice(0,32)); if(a.onplay)a.onplay(); setTimeout(function(){ a.paused=true; if(a.onended)a.onended(); },900); return Promise.resolve(); };
		a.pause=function(){a.paused=true;};
		Object.defineProperty(a,"currentTime",{get:function(){return 0;},set:function(){}});
		return a;
	};
`;

function configJson(extra: Record<string, unknown> = {}): string {
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
		...extra,
	});
}

async function seedToken(page: Page, token: string) {
	await page.addInitScript(
		(t: string) => sessionStorage.setItem("naia.voxcpm2AccessToken", t),
		token,
	);
}

async function synthViaEngine(
	page: Page,
	voice: string,
): Promise<{ bytes: number; sha: string }> {
	// Drive an authenticated POST from the page to the REAL engine and return the
	// RIFF byte length — proves real, non-trivial audio for a specific voice.
	// Retries both 429 (startup prime holds the single slot) and a raw fetch
	// failure (the engine starves connections while a synthesis runs).
	return page.evaluate(
		async ({ v, tok }) => {
			const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
			for (let attempt = 0; attempt < 40; attempt++) {
				let r: Response;
				try {
					r = await fetch("http://127.0.0.1:8910/v1/audio/speech", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${tok}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: "voxcpm2",
							voice: v,
							input: "음색 확인 문장입니다.",
						}),
					});
				} catch {
					await wait(3000);
					continue;
				}
				if (r.status === 429) {
					await wait(3000);
					continue;
				}
				if (!r.ok) return { bytes: -r.status, sha: "" };
				const raw = await r.arrayBuffer();
				const buf = new Uint8Array(raw);
				const riff =
					buf[0] === 0x52 &&
					buf[1] === 0x49 &&
					buf[2] === 0x46 &&
					buf[3] === 0x46;
				if (!riff) return { bytes: 0, sha: "" };
				const digest = await crypto.subtle.digest("SHA-256", raw);
				const sha = Array.from(new Uint8Array(digest))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				return { bytes: buf.byteLength, sha };
			}
			return { bytes: -1, sha: "" };
		},
		{ v: voice, tok: engine?.token ?? "" },
	);
}

test.describe("local voice — full real-engine journey (adversarial-hardened)", () => {
	test.skip(!prereq.ok, `real engine prereqs missing: ${prereq.reason}`);
	test.setTimeout(300_000);

	test.beforeAll(async () => {
		engine = await startRealEngine(undefined, 8910);
	});
	test.afterAll(() => stopRealEngine(engine));

	test("TRT backend + real voice-change + M/F palette + real WAV upload applies", async ({
		page,
	}) => {
		const token = engine?.token ?? "";
		await page.addInitScript(`(function(){${baseInvokeMock(token)}})();`);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await seedToken(page, token);
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			configJson(),
		);

		await page.goto("/");
		await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 20_000 });

		// 1) TRT DLL attested by the live engine.
		const health = await page.evaluate(async () => {
			const r = await fetch("http://127.0.0.1:8910/health");
			return r.json();
		});
		expect(health.ready).toBe(true);
		expect(health.backend).toBe("tensorrt_locdit");
		expect(health.engine).toBe("locdit_fp16.engine");

		// 2) VOICE CHANGE IS REAL: female vs male synthesize to different, real,
		// non-trivial RIFF audio. Compare CONTENT hashes, not byte lengths — with
		// a fixed seed the two voices can converge to identical durations while
		// still being different speakers.
		const female = await synthViaEngine(page, "cc0-ko-female-01");
		const male = await synthViaEngine(page, "cc0-ko-male-01");
		expect(female.bytes).toBeGreaterThan(40_000);
		expect(male.bytes).toBeGreaterThan(40_000);
		expect(female.sha).not.toBe("");
		expect(female.sha).not.toBe(male.sha);

		// 3) M/F palette in the picker, gender-filterable. Picker = LIVE cloud
		// catalog now (engine-independent); size follows the gateway metadata, so
		// assert shape (≥4, gender narrows) not exact counts.
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
		const allCount = await items.count();
		const genderSelect = page
			.locator("select")
			.filter({ has: page.locator('option[value="male"]') })
			.first();
		await genderSelect.selectOption("male");
		const maleCount = await items.count();
		expect(maleCount).toBeGreaterThanOrEqual(1);
		expect(maleCount).toBeLessThan(allCount);
		await genderSelect.selectOption("all");

		// 4) REAL upload: a genuine CC0 WAV → active voice, waited to the applied
		// notice (local store), not an immediate no-error race.
		const realWav = readFileSync(join(RUNTIME_VOICES, "cc0-ko-male-02.wav"));
		await page.setInputFiles('[data-testid="ref-audio-file-input"]', {
			name: "my-voice.wav",
			mimeType: "audio/wav",
			buffer: realWav,
		});
		await expect(page.getByText(/적용되었습니다|voice applied/i)).toBeVisible({
			timeout: 30_000,
		});
	});

	test("uploaded voice drives a chat reply's real synthesis + lip-sync", async ({
		page,
	}) => {
		const token = engine?.token ?? "";
		// A real CC0 WAV stands in for the user's uploaded clip — this is exactly
		// the base64 the upload flow (proven in the previous test) persists, so the
		// reply resolves voice → "naia-current" and clones a real reference.
		const uploadedB64 = readFileSync(
			join(RUNTIME_VOICES, "cc0-ko-male-02.wav"),
		).toString("base64");

		// Observe the uploaded-clip install (PUT /voice) pass through to the real
		// engine and verify its payload IS the seeded clip — otherwise a stale
		// current.wav from an earlier run could satisfy the synthesis assertion
		// (adversarial review finding).
		const voicePuts: string[] = [];
		await page.route("**/voice", async (route) => {
			if (route.request().method() === "PUT") {
				try {
					const body = route.request().postDataJSON() as {
						audio_base64?: string;
					};
					voicePuts.push(body.audio_base64 ?? "");
				} catch {
					voicePuts.push("");
				}
			}
			// route.fetch's DEFAULT 30s timeout aborts any synthesis longer than
			// 30s (cold voice / badcase retries) — the observation layer must
			// outwait the engine, not kill the request under test.
			const resp = await route.fetch({ timeout: 180_000 });
			await route.fulfill({ response: resp });
		});
		// Capture each synthesis request and PASS IT THROUGH to the real engine,
		// keeping the real audio bytes.
		const synthReqs: Array<{ voice?: string; input?: string; bytes: number }> =
			[];
		await page.route("**/v1/audio/speech", async (route) => {
			let body: { voice?: string; input?: string } = {};
			try {
				body = route.request().postDataJSON();
			} catch {
				/* ignore */
			}
			// 180s: must outwait a cold/badcase-retried synthesis (route.fetch
			// defaults to 30s and would abort the request under test).
			const resp = await route.fetch({ timeout: 180_000 });
			const buf = await resp.body();
			synthReqs.push({ voice: body.voice, input: body.input, bytes: buf.length });
			await route.fulfill({ response: resp });
		});

		await page.addInitScript(`(function(){${baseInvokeMock(token)}${AUDIO_STUB}
			window.__NAIA_E2E__.emitSttResult=function(t){ window.__NAIA_E2E__.emit("plugin:stt:result",{transcript:t,isFinal:true,confidence:0.95}); };
		})();`);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await seedToken(page, token);
		await page.addInitScript(
			(b64: string) => localStorage.setItem("naia.voiceRefAudioB64", b64),
			uploadedB64,
		);
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			configJson(),
		);

		await page.goto("/");
		await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 20_000 });

		const voiceBtn = page.locator(".chat-voice-btn");
		await voiceBtn.click();
		await expect(voiceBtn).toHaveClass(/active/, { timeout: 8_000 });
		await page.evaluate(() =>
			(window as any).__NAIA_E2E__.emitSttResult("반갑습니다"),
		);

		// Playback → speaking (lip-sync trigger).
		await expect(page.locator(".chat-voice-btn.speaking")).toBeVisible({
			timeout: 120_000,
		});

		// The reply synthesis used the UPLOADED voice ("current"), returned real
		// audio, and reached playback — not the default, not an empty blob.
		const replyReq = synthReqs.find((r) => (r.input ?? "").includes("반갑"));
		expect(replyReq, "chat reply synthesis request").toBeTruthy();
		expect(replyReq?.voice).toBe("current");
		// The install actually happened THIS run with THIS clip (not a stale
		// current.wav from a previous run).
		expect(voicePuts.length).toBeGreaterThan(0);
		expect(voicePuts[0]).toBe(uploadedB64);
		expect(replyReq?.bytes ?? 0).toBeGreaterThan(20_000);
		const played = await page.evaluate(
			() =>
				(window as { __NAIA_E2E__?: { audioPlayed: unknown[] } }).__NAIA_E2E__
					?.audioPlayed.length ?? 0,
		);
		expect(played).toBeGreaterThan(0);

		await expect(page.locator(".chat-voice-btn.speaking")).toBeHidden({
			timeout: 20_000,
		});
	});
});
