import { type Page, expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #520 — 대사 노출과 재생 순서 역전.
 *
 * 로컬 음성 엔진이 콜드일 때 synthesize 는 연결 실패를 "엔진 기동 중"으로 보고
 * 재시도하면서 워밍업 홀드(#519)를 켠다. 그동안 재생은 일부러 멈춘다. 그런데
 * 정체 가드(#511)는 5초만 지나면 재생 여부와 무관하게 텍스트를 드러냈다. 콜드
 * 엔진의 기동은 5초를 훨씬 넘기므로(실측 RTF 7.98, 기동 약 80초) 그때마다
 * 음성보다 텍스트가 먼저 나왔다.
 *
 * 여기서 고정하는 것은 사용자에게 보이는 결과다. 홀드가 열려 있는 동안에는
 * 텍스트가 앞서 나오지 않고, 홀드가 풀리면 정체 가드가 다시 제 일을 한다.
 */

const LOCAL_VOICE = "http://127.0.0.1:8910";
const FIRST_SENTENCE = "첫 문장입니다";

const CHAT_MOCK = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
	var cbs = new Map(); var n = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once){ var id=n++; cbs.set(id, function(d){ if(once) cbs.delete(id); return fn&&fn(d); }); return id; };
	window.__TAURI_INTERNALS__.unregisterCallback = function(id){ cbs.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, d){ var cb = cbs.get(id); if (cb) cb(d); };
	var listeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function(){};
	function emit(ev, p){ (listeners.get(ev)||[]).forEach(function(h){ window.__TAURI_INTERNALS__.runCallback(h, { event: ev, payload: p }); }); }
	window.__TAURI_INTERNALS__.convertFileSrc = function(p, proto){ return (proto||"asset") + "://localhost/" + encodeURIComponent(p); };

	// 재생이 실제로 시작됐는지 센다. "텍스트가 앞섰다" 와 "그냥 늦었다" 를
	// 가르는 유일한 관측점이다.
	window.__TTS_E2E__ = { speakCount: 0, audioPlayed: 0 };
	Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
		speak: function(u){ window.__TTS_E2E__.speakCount++; setTimeout(function(){ if (u && u.onstart) u.onstart(); if (u && u.onend) u.onend(); }, 10); },
		cancel: function(){}, getVoices: function(){ return []; }, pause: function(){}, resume: function(){},
	}});
	Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: function(t){ this.text = t; this.lang=""; this.onstart=null; this.onend=null; this.onerror=null; } });
	window.Audio = function(src){ var a={src:src||"",paused:true}; a.play=function(){ if(src&&src.startsWith("data:audio")) window.__TTS_E2E__.audioPlayed++; setTimeout(function(){ if(a.onended) a.onended(); },10); return Promise.resolve(); }; a.pause=function(){}; Object.defineProperty(a,"currentTime",{get:function(){return 0;},set:function(){}}); return a; };

	window.__TAURI_INTERNALS__.invoke = async function(cmd, args){
		if (cmd === "plugin:event|listen"){ if(!listeners.has(args.event)) listeners.set(args.event, []); listeners.get(args.event).push(args.handler); return args.handler; }
		if (cmd === "plugin:event|emit"){ emit(args.event, args.payload); return null; }
		if (cmd === "plugin:event|unlisten") return;
		if (cmd === "send_to_agent_command"){
			var req = JSON.parse(args.message);
			if (req.type === "chat_request"){
				var id = req.requestId;
				var chunks = [
					{type:"text",requestId:id,text:"첫 문장입니다. "},
					{type:"text",requestId:id,text:"둘째 문장입니다. "},
					{type:"text",requestId:id,text:"셋째 문장입니다."},
					{type:"finish",requestId:id}
				];
				var d = 60;
				chunks.forEach(function(c){ setTimeout(function(){ emit("agent_response", JSON.stringify(c)); }, d); d += 60; });
			}
			return;
		}
		return undefined;
	};
})();
`;

async function setup(page: Page) {
	await page.addInitScript(CHAT_MOCK);
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(
		(cfg: string) => localStorage.setItem("naia-config", cfg),
		JSON.stringify({
			provider: "claude-code-cli",
			model: "claude-sonnet-4-6",
			enableTools: false,
			ttsEnabled: true,
			ttsProvider: "naia-local-voice",
			vllmTtsHost: LOCAL_VOICE,
			locale: "ko",
			onboardingComplete: true,
		}),
	);
}

async function send(page: Page) {
	const input = page.locator(".chat-input");
	await expect(input).toBeEnabled({ timeout: 10_000 });
	await input.fill("안녕");
	await input.press("Enter");
}

async function visibleText(page: Page): Promise<string> {
	return page.locator(".chat-app").innerText();
}

async function playbackCount(page: Page): Promise<number> {
	return page
		.evaluate(
			() =>
				(
					window as {
						__TTS_E2E__?: { speakCount: number; audioPlayed: number };
					}
				).__TTS_E2E__ ?? { speakCount: 0, audioPlayed: 0 },
		)
		.then((c) => c.speakCount + c.audioPlayed);
}

test.describe("#520 노출과 재생 순서", () => {
	test("엔진 기동 중에는 텍스트가 재생을 앞지르지 않는다", async ({ page }) => {
		await setup(page);
		// 콜드 엔진: 연결 자체가 거부된다. synthesize 는 이것을 기동 중으로 읽고
		// 워밍업 홀드를 켠 채 재시도한다.
		await page.route(`${LOCAL_VOICE}/**`, (route) => route.abort());
		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 15_000 });
		// 스플래시가 걷히기 전에는 innerText 가 비어 보인다. 걷히기를 먼저
		// 기다려야 노출 여부를 제대로 잰다.
		await page.waitForTimeout(7_000);
		await send(page);

		// 정체 가드(5초)와 문장 시한(5초)을 모두 넘긴다. 고치기 전에는 이
		// 구간에서 텍스트가 드러났다.
		await page.waitForTimeout(12_000);

		expect(await playbackCount(page), "홀드 중에는 재생이 없다").toBe(0);
		expect(
			await visibleText(page),
			"재생 전에 텍스트가 앞서 노출되면 안 된다",
		).not.toContain(FIRST_SENTENCE);
	});

	test("엔진이 올라오면 재생과 함께 텍스트가 나온다", async ({ page }) => {
		await setup(page);
		// RIFF WAV 헤더. 로컬 런타임은 음성만 담은 WAV 를 그대로 돌려준다.
		const wav = Buffer.from([
			0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
			0x66, 0x6d, 0x74, 0x20,
		]);
		await page.route(`${LOCAL_VOICE}/**`, (route) =>
			route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
		);
		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 15_000 });
		await send(page);

		// 홀드가 없으므로 재생이 시작되고, 그 순간 해당 문장이 노출된다.
		await expect(page.locator(".chat-app")).toContainText(FIRST_SENTENCE, {
			timeout: 20_000,
		});
		expect(
			await playbackCount(page),
			"노출됐다면 재생도 있었다",
		).toBeGreaterThan(0);
	});
});
