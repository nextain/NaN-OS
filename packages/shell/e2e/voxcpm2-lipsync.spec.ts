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
 * #453 GOAL 1 — REAL sound + lip-sync: a voice-mode turn whose reply is
 * synthesized by the ACTUAL VoxCPM2 TensorRT engine (the /v1/audio/speech fetch
 * hits :8910, no mocked facade) drives AudioQueue playback, and playback flips
 * the shell into its speaking state (`.chat-voice-btn.speaking`) — the same
 * AudioQueue.onPlaybackStart callback that sets `avatarStore.isSpeaking`, which
 * AvatarCanvas subscribes to for mouth lip-sync. So real bytes → real playback →
 * lip-sync trigger. Only the HTMLAudioElement lifecycle is stubbed (headless has
 * no speaker clock); the synthesized audio itself is real.
 */

const prereq = realEnginePrereqsMet();
const NAIA_KEY = process.env.NAIA_E2E_KEY || "";
let engine: RealEngine | null = null;

function lipsyncMock(token: string): string {
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
	function emit(e,p){(evs.get(e)||[]).forEach(function(h){window.__TAURI_INTERNALS__.runCallback(h,{event:e,payload:p});});}
	window.__TAURI_INTERNALS__.convertFileSrc=function(p,proto){return (proto||"asset")+"://localhost/"+encodeURIComponent(p);};
	window.__NAIA_E2E__={ audioPlayed:[], emitSttResult:function(t,f){ emit("plugin:stt:result",{transcript:t,isFinal:f!==false,confidence:0.95}); }, sttListening:false };
	// Deterministic media element: real bytes are decoded upstream (AudioQueue),
	// but headless has no speaker clock — emit a ~900ms lifecycle so the speaking
	// state is observable exactly as long as real audio would sound.
	window.Audio=function(src){
		var a={src:src||"",paused:true};
		a.play=function(){ a.paused=false; var s=String(a.src); window.__NAIA_E2E__.audioPlayed.push(s.length+":"+s.slice(-24)); if(a.onplay)a.onplay(); setTimeout(function(){ a.paused=true; if(a.onended)a.onended(); },900); return Promise.resolve(); };
		a.pause=function(){a.paused=true;};
		Object.defineProperty(a,"currentTime",{get:function(){return 0;},set:function(){}});
		return a;
	};
	window.__TAURI_INTERNALS__.invoke=async function(cmd,args){
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
		if(cmd==="plugin:stt|start_listening"){ window.__NAIA_E2E__.sttListening=true; setTimeout(function(){ emit("plugin:stt:stateChange",{state:"listening"}); },80); return; }
		if(cmd==="plugin:stt|stop_listening"){ window.__NAIA_E2E__.sttListening=false; emit("plugin:stt:stateChange",{state:"idle"}); return; }
		if(cmd==="plugin:stt|is_available") return {available:true,reason:null};
		if(cmd==="plugin:stt|check_permission"||cmd==="plugin:stt|request_permission") return {microphone:"granted",speechRecognition:"granted"};
		if(cmd==="plugin:stt|get_supported_languages") return {languages:[{code:"ko-KR",name:"Korean",installed:true}]};
		if(cmd==="send_to_agent_command"){
			var req=JSON.parse(args.message);
			if(req.type==="chat_request"){
				var id=req.requestId;
				// TWO speakable sentences (each past the chunker minimum) — the
				// second sentence regressed to silence in manual testing, so this
				// spec must reproduce multi-sentence playback, not just seq 0.
				var chunks=[
					{type:"text",requestId:id,text:"안녕하세요, 반갑습니다 대표님. "},
					{type:"text",requestId:id,text:"오늘도 좋은 하루 보내고 계신가요?"},
					{type:"finish",requestId:id}
				];
				var d=60; chunks.forEach(function(c){ setTimeout(function(){ emit("agent_response",JSON.stringify(c)); },d); d+=60; });
			}
			return;
		}
		return undefined;
	};
})();
`;
}

async function injectStt(page: Page, transcript: string) {
	await page.evaluate(
		(t) => (window as any).__NAIA_E2E__.emitSttResult(t, true),
		transcript,
	);
}

test.describe("local voice — real sound drives lip-sync", () => {
	test.skip(!prereq.ok, `real engine prereqs missing: ${prereq.reason}`);
	test.setTimeout(240_000);

	test.beforeAll(async () => {
		engine = await startRealEngine(undefined, 8910);
	});
	test.afterAll(() => stopRealEngine(engine));

	test("voice-mode reply synthesizes BOTH sentences and drives the speaking state", async ({
		page,
	}) => {
		// Capture the webview console — AudioQueue/scheduler debug logs are the
		// only way to see WHERE seq1 dies when the second sentence goes silent.
		const consoleLines: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (/AudioQueue|tts-pipeline|tts-synthesize|scheduler|prebuffer/.test(text))
				consoleLines.push(text.slice(0, 200));
		});
		const dumpConsole = () => consoleLines.slice(-60).join("\n");
		const token = engine?.token ?? "";
		await page.addInitScript(lipsyncMock(token));
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		// Deliberately NO sessionStorage token seeding: the webview must capture the
		// bearer through the REAL path (ensureLocalVoiceReady → start_voxcpm2 ready
		// → localVoiceFacadeUrlFromReady). Pre-seeding hid the token-loss bug that
		// made the real app 401 (empty picker / silence) while this spec was green.
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			JSON.stringify({
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
			}),
		);

		// The /v1/audio/speech fetch is deliberately NOT routed — it hits the real
		// engine, proving the selected local voice actually produces audio.
		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 20_000 });

		// Enter voice mode (the proven pipeline-voice path that synthesizes replies).
		const voiceBtn = page.locator(".chat-voice-btn");
		await voiceBtn.click();
		await expect(voiceBtn).toHaveClass(/active/, { timeout: 8_000 });

		// A recognized utterance auto-sends → LLM reply → sentence TTS on the real
		// engine → AudioQueue playback → shell enters its speaking (lip-sync) state.
		await injectStt(page, "안녕하세요");

		await expect(page.locator(".chat-voice-btn.speaking")).toBeVisible({
			timeout: 120_000,
		});

		// BOTH sentences must reach playback (the "첫 문장만 나오네" regression):
		// each sentence is a separate real WAV from :8910, played in order.
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(window as { __NAIA_E2E__?: { audioPlayed: unknown[] } })
								.__NAIA_E2E__?.audioPlayed.length ?? 0,
					),
				{ timeout: 60_000 },
			)
			.toBeGreaterThanOrEqual(2)
			.catch((err) => {
				throw new Error(
					`second sentence never played.\n--- webview console ---\n${dumpConsole()}`,
					{ cause: err },
				);
			});
		// …and they are DIFFERENT audio payloads (length+tail signature), so a
		// double-play of seq 0 cannot masquerade as both sentences.
		const played = await page.evaluate(
			() =>
				(window as { __NAIA_E2E__?: { audioPlayed: string[] } }).__NAIA_E2E__
					?.audioPlayed ?? [],
		);
		expect(new Set(played.slice(0, 2)).size).toBe(2);

		// …and the speaking state clears when playback ends (lip-sync returns to idle).
		await expect(page.locator(".chat-voice-btn.speaking")).toBeHidden({
			timeout: 30_000,
		});
	});
});
