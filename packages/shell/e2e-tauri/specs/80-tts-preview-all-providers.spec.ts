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

	it("OpenAI TTS: preview succeeds with API key", async () => {
		if (!OPENAI_KEY) {
			console.log("[SKIP] no OPENAI_API_KEY");
			return;
		}
		await setSelectValue(S.ttsProviderSelect, "openai");
		await browser.pause(500);
		await setInputValue(S.ttsApiKeyInput, OPENAI_KEY);
		await browser.pause(300);
		await setSelectValue(S.ttsVoiceSelect, "alloy");
		await browser.pause(300);
		const error = await previewAndCheckError();
		expect(error).toBe("");
	});

	it("ElevenLabs TTS: preview succeeds with API key (default voice)", async () => {
		if (!ELEVENLABS_KEY) {
			console.log("[SKIP] no ELEVENLABS_API_KEY");
			return;
		}
		await setSelectValue(S.ttsProviderSelect, "elevenlabs");
		await browser.pause(500);
		await setInputValue(S.ttsApiKeyInput, ELEVENLABS_KEY);
		await browser.pause(300);
		// Uses default voice (Sarah) when no voice selected
		const error = await previewAndCheckError();
		if (error) console.error("[ElevenLabs]", error);
		expect(error).toBe("");
	});

	it("Google Cloud TTS: preview succeeds with GEMINI_API_KEY", async () => {
		const googleKey = process.env.GEMINI_API_KEY ?? "";
		if (!googleKey) {
			console.log("[SKIP] no GEMINI_API_KEY");
			return;
		}
		await setSelectValue(S.ttsProviderSelect, "google");
		await browser.pause(500);
		await setInputValue(S.ttsApiKeyInput, googleKey);
		await browser.pause(300);
		await setSelectValue(S.ttsVoiceSelect, "ko-KR-Neural2-A");
		await browser.pause(300);
		const error = await previewAndCheckError();
		if (error) console.error("[Google TTS]", error);
		expect(error).toBe("");
	});

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
