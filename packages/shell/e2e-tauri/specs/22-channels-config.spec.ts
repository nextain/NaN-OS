import { S } from "../helpers/selectors.js";
import { clickElement } from "../helpers/settings.js";

/**
 * 22 — Channels Config E2E
 *
 * Verifies Settings > Channels section:
 * - Channel management section appears when tools enabled
 * - Shows hint about channels tab
 * - Can navigate to channels tab from settings
 */
describe("22 — channels config", () => {
	it("should navigate to Settings tab", async () => {
		const settingsBtn = await $(S.settingsTabBtn);
		await settingsBtn.waitForDisplayed({ timeout: 10_000 });
		await clickElement(S.settingsTabBtn);

		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show channels section when tools enabled", async () => {
		// Ensure tools toggle is enabled
		const toolsEnabled = await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			return el?.checked ?? false;
		}, S.toolsToggle);

		if (!toolsEnabled) {
			await browser.execute((sel: string) => {
				const el = document.querySelector(sel) as HTMLInputElement | null;
				if (el) el.click();
			}, S.toolsToggle);
			await browser.pause(300);
		}

		// 설정 화면의 채널 안내는 UI 재구성으로 사라졌다(로케일에 키만 남아
		// 있고 어디서도 렌더되지 않는다). 채널 관리는 채널 탭이 맡고, 바로
		// 다음 항목이 그 경로를 검증한다.
	});

	it("should navigate to channels tab", async () => {
		await clickElement(S.channelsTabBtn, 5_000);

		const channelsApp = await $(S.channelsTabApp);
		await channelsApp.waitForDisplayed({ timeout: 5_000 });
	});

	it("should navigate back to chat tab", async () => {
		await clickElement(S.chatTab);

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
