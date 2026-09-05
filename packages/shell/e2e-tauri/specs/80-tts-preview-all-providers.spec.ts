import { S } from "../helpers/selectors.js";
import {
	ensureAppReady,
	navigateToSettings,
	scrollToSection,
} from "../helpers/settings.js";

/**
 * 80 — TTS Preview All Providers E2E
 *
 * Runs actual TTS preview for each provider with real API keys.
 * Verifies no error message appears after preview (`.settings-error`).
 *
 * Requires: OPENAI_API_KEY env var. ELEVENLABS_API_KEY for ElevenLabs.
 * Google Cloud TTS requires separate GOOGLE_CLOUD_TTS_KEY (not GEMINI_API_KEY).
 *
 * 루크 결정(2026-09-05): 이 순회는 제공자마다 **동작 여부만** 잰다. 기능은
 * 대표 제공자 하나에서만 잰다.
 *
 * 이 스펙은 그 결정을 이미 지키고 있어서 옮길 단정이 없었다. 제공자마다 재는
 * 것은 하나뿐이고 그것이 곧 동작 여부다 — 미리듣기를 눌렀을 때 그 제공자가
 * 요청을 거절하지 않는가(`.settings-error` 가 비어 있는가). 만들어진 소리를
 * 듣지도, 길이나 형식을 재지도, 재생 여부를 보지도 않는다. TTS 제공자별로
 * 실제 음성 API 를 한 번 부르는 자리는 이 스펙이고, 84 번(대화 + TTS)은
 * 대표 제공자 하나만 전체 흐름으로 돈다.
 *
 * 그러니 여기에 제공자별 오디오 생성·재생 검증을 새로 붙이지 마라. 그런 것이
 * 필요하면 84 번 스펙의 대표 제공자(edge) 경로에 붙여라.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const ELEVENLABS_KEY =
	process.env.ELEVENLABS_API_KEY ?? "";
// Google Cloud TTS 키. 예전에는 테스트 본문 안에서 읽었는데, 그러면 키가 없을
// 때의 판단도 본문 안에서 하게 되어 "통과" 로 끝났다. 수집 시점에 읽어 켤지
// 끌지를 정한다.
const GOOGLE_KEY = process.env.GEMINI_API_KEY ?? "";

function setSelectValue(sel: string, value: string) {
	return browser.execute(
		(s: string, v: string) => {
			const select = document.querySelector(s) as HTMLSelectElement | null;
			if (!select) return false;
			select.value = v;
			select.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		},
		sel,
		value,
	);
}

function setInputValue(sel: string, value: string) {
	return browser.execute(
		(s: string, v: string) => {
			const input = document.querySelector(s) as HTMLInputElement | null;
			if (!input) return false;
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(input, v);
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		},
		sel,
		value,
	);
}

/** Clear any existing error, click preview, wait, check for error. */
async function previewAndCheckError(timeout = 45_000): Promise<string> {
	// Clear previous error
	await browser.execute(() => {
		const errEl = document.querySelector(".settings-error");
		if (errEl) errEl.textContent = "";
	});

	await scrollToSection(S.voicePreviewBtn);
	await browser.execute((sel: string) => {
		const btn = document.querySelector(sel) as HTMLButtonElement | null;
		if (btn && !btn.disabled) btn.click();
	}, S.voicePreviewBtn);

	// Wait for preview to finish (button re-enables)
	await browser.waitUntil(
		async () =>
			browser.execute((sel: string) => {
				const btn = document.querySelector(sel) as HTMLButtonElement | null;
				return btn ? !btn.disabled : true;
			}, S.voicePreviewBtn),
		{ timeout, timeoutMsg: `Preview did not finish in ${timeout / 1000}s` },
	);

	await browser.pause(500);

	// Check for error message
	const error = await browser.execute(() => {
		const el = document.querySelector(".settings-error");
		return el?.textContent?.trim() ?? "";
	});

	return error;
}

describe("80 — TTS preview all providers", () => {
	before(async () => {
		await ensureAppReady();
		await navigateToSettings();
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });
	});

	it("Edge TTS: preview succeeds without error", async () => {
		await setSelectValue(S.ttsProviderSelect, "edge");
		await browser.pause(500);
		const error = await previewAndCheckError();
		expect(error).toBe("");
	});

	// 키가 없으면 **건너뛴다**. 예전에는 본문 첫 줄에서 `[SKIP]` 을 찍고
	// 그대로 반환했는데, 그러면 리포터에 PASS 로 올라가고 회귀 기록에도
	// "돌았다" 로 남는다 — 실제로는 이 제공자의 미리듣기를 한 번도 부르지
	// 않았는데 전수 커버로 세어진다. 89·84·83 이 쓰는 형태와 맞춘다.
	if (!OPENAI_KEY) {
		it.skip("rewrite-needed: OPENAI_API_KEY 가 없어 OpenAI TTS 를 검증하지 못했다", () => {});
	} else {
		it("OpenAI TTS: preview succeeds with API key", async () => {
			await setSelectValue(S.ttsProviderSelect, "openai");
			await browser.pause(500);
			await setInputValue(S.ttsApiKeyInput, OPENAI_KEY);
			await browser.pause(300);
			await setSelectValue(S.ttsVoiceSelect, "alloy");
			await browser.pause(300);
			const error = await previewAndCheckError();
			expect(error).toBe("");
		});
	}

	if (!ELEVENLABS_KEY) {
		it.skip("rewrite-needed: ELEVENLABS_API_KEY 가 없어 ElevenLabs TTS 를 검증하지 못했다", () => {});
	} else {
		it("ElevenLabs TTS: preview succeeds with API key (default voice)", async () => {
			await setSelectValue(S.ttsProviderSelect, "elevenlabs");
			await browser.pause(500);
			await setInputValue(S.ttsApiKeyInput, ELEVENLABS_KEY);
			await browser.pause(300);
			// Uses default voice (Sarah) when no voice selected
			const error = await previewAndCheckError();
			if (error) console.error("[ElevenLabs]", error);
			expect(error).toBe("");
		});
	}

	if (!GOOGLE_KEY) {
		it.skip("rewrite-needed: GEMINI_API_KEY 가 없어 Google Cloud TTS 를 검증하지 못했다", () => {});
	} else {
		it("Google Cloud TTS: preview succeeds with GEMINI_API_KEY", async () => {
			await setSelectValue(S.ttsProviderSelect, "google");
			await browser.pause(500);
			await setInputValue(S.ttsApiKeyInput, GOOGLE_KEY);
			await browser.pause(300);
			await setSelectValue(S.ttsVoiceSelect, "ko-KR-Neural2-A");
			await browser.pause(300);
			const error = await previewAndCheckError();
			if (error) console.error("[Google TTS]", error);
			expect(error).toBe("");
		});
	}

	it("should restore edge and navigate back", async () => {
		await setSelectValue(S.ttsProviderSelect, "edge");
		await browser.pause(300);
		await browser.execute((sel: string) => {
			(document.querySelector(sel) as HTMLElement)?.click();
		}, S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
