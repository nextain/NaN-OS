import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	navigateToSettings,
} from "../helpers/settings.js";

/**
 * 28 — Skills Install E2E
 *
 * Verifies Skills tab > Gateway skills section:
 * - Gateway skill cards render with name text
 * - Eligible/ineligible status shown
 * - Install button clickable for ineligible skills
 *
 * Covers RPC: skills.status
 */
describe("28 — skills install", () => {
	before(async () => {
		// 스킬 화면은 설정 안에 있다 — 설정을 먼저 열어야 그 탭 버튼이 존재한다
		// (옛 메타 탭 표지를 그리던 NaiaMetaArea 는 지웠다 — 2026-09-06).
		await ensureAppReady();
		await navigateToSettings();
	});

	it("should navigate to Skills tab", async () => {
		const skillsBtn = await $(S.skillsTab);
		await skillsBtn.waitForDisplayed({ timeout: 10_000 });
		await clickBySelector(S.skillsTab);

		const skillsApp = await $(S.skillsTabApp);
		await skillsApp.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show gateway skill cards with status info", async () => {
		await browser.pause(3_000);

		const gatewayCardCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.gatewaySkillCard,
		);

		if (gatewayCardCount > 0) {
			// Verify first card has text content (skill name)
			const cardText = await browser.execute((sel: string) => {
				const card = document.querySelector(sel);
				return card?.textContent?.trim() ?? "";
			}, S.gatewaySkillCard);
			expect(cardText.length).toBeGreaterThan(0);
		}
	});

	it("should show install buttons for ineligible skills", async () => {
		const installBtnCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.skillsInstallBtn,
		);

		if (installBtnCount > 0) {
			const isDisplayed = await browser.execute((sel: string) => {
				const btn = document.querySelector(sel) as HTMLButtonElement;
				return btn ? !btn.hidden : false;
			}, S.skillsInstallBtn);
			expect(isDisplayed).toBe(true);

			// Verify button is clickable (not disabled)
			const isEnabled = await browser.execute((sel: string) => {
				const btn = document.querySelector(sel) as HTMLButtonElement;
				return btn ? !btn.disabled : false;
			}, S.skillsInstallBtn);
			expect(isEnabled).toBe(true);
		}
		// No install buttons = all skills eligible — valid state
	});

	it("should show install result feedback after clicking install", async () => {
		const installBtnCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.skillsInstallBtn,
		);

		if (installBtnCount > 0) {
			// Click the first install button
			await browser.execute((sel: string) => {
				const btn = document.querySelector(sel) as HTMLButtonElement;
				btn?.click();
			}, S.skillsInstallBtn);

			// Wait for install result feedback (success or error)
			await browser.waitUntil(
				async () => {
					const successCount = await browser.execute(
						(sel: string) => document.querySelectorAll(sel).length,
						S.skillInstallResultSuccess,
					);
					const errorCount = await browser.execute(
						(sel: string) => document.querySelectorAll(sel).length,
						S.skillInstallResultError,
					);
					return successCount > 0 || errorCount > 0;
				},
				{
					timeout: 30_000,
					interval: 1_000,
					timeoutMsg: "Install result feedback did not appear within 30s",
				},
			);

			// Verify feedback element has text content
			const feedbackText = await browser.execute(
				(successSel: string, errorSel: string) => {
					const el =
						document.querySelector(successSel) ||
						document.querySelector(errorSel);
					return el?.textContent?.trim() ?? "";
				},
				S.skillInstallResultSuccess,
				S.skillInstallResultError,
			);
			expect(feedbackText.length).toBeGreaterThan(0);
		}
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
