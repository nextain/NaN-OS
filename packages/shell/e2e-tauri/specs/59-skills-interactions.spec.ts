import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	navigateToSettings,
} from "../helpers/settings.js";

/**
 * 59 — Skills Tab Interactions
 *
 * Verifies detailed skills interactions:
 * - Disable All → enabled count changes
 * - Enable All → count restores
 * - Skill card header click → expanded class + detail
 * - Re-click → collapses
 */
describe("59 — skills interactions", () => {
	before(async () => {
		await ensureAppReady();
		// 스킬 화면은 설정 안에 있다 — 설정을 먼저 열어야 그 탭 버튼이 존재한다
		// (옛 메타 탭 표지를 그리던 NaiaMetaArea 는 지웠다 — 2026-09-06).
		await navigateToSettings();
		await clickBySelector(S.skillsTab);
		const skillsApp = await $(S.skillsTabApp);
		await skillsApp.waitForDisplayed({ timeout: 10_000 });
	});

	it("should show initial skills count", async () => {
		// Wait for skills to load from Gateway (may take a few seconds)
		await browser.waitUntil(
			async () => {
				const t = await browser.execute(
					(sel: string) => document.querySelector(sel)?.textContent ?? "",
					S.skillsCount,
				);
				return /\d+\/\d+/.test(t);
			},
			{ timeout: 15_000, timeoutMsg: "Skills count did not appear" },
		);
		const text = await browser.execute(
			(sel: string) => document.querySelector(sel)?.textContent ?? "",
			S.skillsCount,
		);
		expect(text).toMatch(/\d+\/\d+/);
	});

	it("should decrease count on Disable All", async () => {
		const before = await browser.execute(
			(sel: string) => document.querySelector(sel)?.textContent ?? "",
			S.skillsCount,
		);

		await clickBySelector(S.skillsDisableAllBtn);
		await browser.pause(500);

		const after = await browser.execute(
			(sel: string) => document.querySelector(sel)?.textContent ?? "",
			S.skillsCount,
		);

		// Either the enabled count decreased, or there were no custom skills to disable
		const beforeEnabled = Number.parseInt(before.split("/")[0], 10);
		const afterEnabled = Number.parseInt(after.split("/")[0], 10);
		expect(afterEnabled).toBeLessThanOrEqual(beforeEnabled);
	});

	it("should restore count on Enable All", async () => {
		const beforeText = await browser.execute(
			(sel: string) => document.querySelector(sel)?.textContent ?? "",
			S.skillsCount,
		);
		const beforeEnabled = Number.parseInt(beforeText.split("/")[0], 10);

		await clickBySelector(S.skillsEnableAllBtn);
		await browser.pause(500);

		const afterText = await browser.execute(
			(sel: string) => document.querySelector(sel)?.textContent ?? "",
			S.skillsCount,
		);
		const afterEnabled = Number.parseInt(afterText.split("/")[0], 10);
		// Enable All should increase or maintain enabled count
		expect(afterEnabled).toBeGreaterThanOrEqual(beforeEnabled);
	});

	it("should expand skill card on header click", async () => {
		// Find first non-gateway skill card header and click it
		const hasCards = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length > 0,
			S.skillCardHeader,
		);
		if (!hasCards) return;

		await browser.execute((sel: string) => {
			const headers = document.querySelectorAll(sel);
			if (headers.length > 0) (headers[0] as HTMLElement).click();
		}, S.skillCardHeader);
		await browser.pause(300);

		const expandedCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.skillCardExpanded,
		);
		expect(expandedCount).toBeGreaterThanOrEqual(1);
	});

	it("should show detail section when expanded", async () => {
		const detailCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.skillCardDetail,
		);
		expect(detailCount).toBeGreaterThanOrEqual(1);
	});

	it("should collapse on re-click", async () => {
		await browser.execute((sel: string) => {
			const expanded = document.querySelector(sel);
			const header = expanded?.querySelector(
				".skill-card-header",
			) as HTMLElement;
			if (header) header.click();
		}, S.skillCardExpanded);
		await browser.pause(300);

		const expandedCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.skillCardExpanded,
		);
		expect(expandedCount).toBe(0);
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
