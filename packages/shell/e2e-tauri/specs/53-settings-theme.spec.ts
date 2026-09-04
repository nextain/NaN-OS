import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	navigateToSettings,
	openSettingsSection,
} from "../helpers/settings.js";

/**
 * 53 — Settings: Theme & Locale
 *
 * Pure client-side interactions:
 * - Theme swatch click → active class changes
 * - data-theme attribute on root updates
 * - Locale select switches (ko↔en)
 */
describe("53 — settings theme & locale", () => {
	before(async () => {
		await ensureAppReady();
		await navigateToSettings();
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });
		// #541: 테마·로케일은 General 섹션에 있다.
		await openSettingsSection("general");
	});

	it("should render theme swatches", async () => {
		const count = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.themeSwatch,
		);
		expect(count).toBeGreaterThanOrEqual(2);
	});

	it("should have one active theme swatch", async () => {
		const activeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.themeSwatchActive,
		);
		expect(activeCount).toBe(1);
	});

	it("should change active swatch on click", async () => {
		// Get the first non-active swatch index
		const clickedIdx = await browser.execute(
			(activeSel: string, allSel: string) => {
				const all = document.querySelectorAll(allSel);
				for (let i = 0; i < all.length; i++) {
					if (!all[i].classList.contains("active")) {
						(all[i] as HTMLElement).click();
						return i;
					}
				}
				return -1;
			},
			S.themeSwatchActive,
			S.themeSwatch,
		);

		expect(clickedIdx).toBeGreaterThanOrEqual(0);
		await browser.pause(300);

		// The clicked swatch should now be active
		const newActiveIdx = await browser.execute((allSel: string) => {
			const all = document.querySelectorAll(allSel);
			for (let i = 0; i < all.length; i++) {
				if (all[i].classList.contains("active")) return i;
			}
			return -1;
		}, S.themeSwatch);

		expect(newActiveIdx).toBe(clickedIdx);
	});

	it("should show the locale picker with a current label", async () => {
		const label = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLElement | null)?.textContent?.trim() ??
				"",
			S.localeSelect,
		);
		expect(label.length).toBeGreaterThan(0);
	});

	it("should switch locale to the other option and restore", async () => {
		// #541: 로케일은 <select> 가 아니라 트리거+옵션 버튼 위젯이다.
		const pick = async () =>
			browser.execute((sel: string) => {
				const trigger = document.querySelector(sel) as HTMLElement | null;
				if (!trigger) return null;
				trigger.click();
				const options = Array.from(
					document.querySelectorAll("#locale-select-options button"),
				) as HTMLButtonElement[];
				const target = options.find(
					(option) => option.getAttribute("aria-pressed") !== "true",
				);
				if (!target) return null;
				const label = target.textContent?.trim() ?? "";
				target.click();
				return label;
			}, S.localeSelect);

		const first = await pick();
		if (!first) return;
		await browser.pause(300);
		const label = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLElement | null)?.textContent?.trim() ??
				"",
			S.localeSelect,
		);
		expect(label).toContain(first);
		await pick(); // 원상 복구
		await browser.pause(300);
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
