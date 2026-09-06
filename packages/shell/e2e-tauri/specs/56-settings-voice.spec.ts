import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	navigateToSettings,
	openSettingsSection,
	scrollToSection,
} from "../helpers/settings.js";

/**
 * 56 — Settings: Voice (TTS/STT)
 *
 * Pure client-side interactions:
 * - TTS toggle on/off
 * - STT toggle on/off
 * - TTS voice select shows options
 * - Voice preview button exists
 */
describe("56 — settings voice", () => {
	before(async () => {
		await ensureAppReady();
		await navigateToSettings();
		// #541 이후 설정은 내부 탭이고 **활성 탭만 렌더**한다
		// (`SettingsTab.tsx` 의 `activeSettingsTab === "voice" && …`). 설정만 열면
		// 프로필 탭이 서므로 음성 컨트롤은 DOM 에 아예 없다 — 셀렉터가 낡은 것이
		// 아니라 가는 길이 빠져 있었다.
		await openSettingsSection("voice");
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });
	});

	it("should have TTS toggle", async () => {
		await scrollToSection(S.ttsToggle);
		const exists = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.ttsToggle,
		);
		expect(exists).toBe(true);
	});

	it("should toggle TTS on/off", async () => {
		const originalState = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLInputElement)?.checked ?? false,
			S.ttsToggle,
		);

		await clickBySelector(S.ttsToggle);
		await browser.pause(200);

		const newState = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLInputElement)?.checked ?? false,
			S.ttsToggle,
		);
		expect(newState).toBe(!originalState);

		// Restore
		await clickBySelector(S.ttsToggle);
		await browser.pause(200);
	});

	it("should offer an STT provider choice including 'none'", async () => {
		// 예전에는 `#stt-toggle` 켜기/끄기였다. 지금 화면에는 그 토글이 없고, 끄기는
		// 공급자 목록의 빈 값(`settings.sttNone`)이다
		// (`SettingsTab.tsx` 의 `data-testid="stt-provider-section"`). 없어진 토글을
		// 기다리는 대신 오늘의 같은 뜻을 잰다.
		const choice = await browser.execute(() => {
			const section = document.querySelector(
				'[data-testid="stt-provider-section"]',
			);
			const select = section?.querySelector("select") as HTMLSelectElement | null;
			if (!select) return { present: false, hasNone: false, count: 0 };
			const values = Array.from(select.options).map((option) => option.value);
			return {
				present: true,
				hasNone: values.includes(""),
				count: values.length,
			};
		});
		expect(choice.present).toBe(true);
		expect(choice.hasNone).toBe(true);
		expect(choice.count).toBeGreaterThan(1);
	});

	it("should have TTS voice select with options", async () => {
		await scrollToSection(S.ttsVoiceSelect);
		const optionCount = await browser.execute((sel: string) => {
			const select = document.querySelector(sel) as HTMLSelectElement | null;
			return select?.options.length ?? 0;
		}, S.ttsVoiceSelect);
		expect(optionCount).toBeGreaterThanOrEqual(1);
	});

	it("should show current TTS voice selection", async () => {
		const value = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLSelectElement)?.value ?? "",
			S.ttsVoiceSelect,
		);
		// Voice should be a ko-KR string or empty
		expect(typeof value).toBe("string");
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
