import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
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
		// 테마와 언어는 '일반' 구역에 있다 (#541).
		await openSettingsSection("일반");
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

	/**
	 * 언어 선택은 네이티브 select 에서 커스텀 드롭다운으로 바뀌었다 (#541).
	 * 예전 스펙은 버튼에 `.value` 를 넣고 도로 읽어 통과했다 — 버튼에도 value
	 * 속성이 있어서 값은 돌아오지만 React 상태는 한 번도 바뀌지 않았다.
	 * 이제 실제로 열고 고른다.
	 */
	async function currentLocale(): Promise<string> {
		return browser.execute(
			(sel: string) =>
				document.querySelector(sel)?.getAttribute("data-value") ?? "",
			S.localeSelect,
		);
	}

	async function pickLocale(target: string): Promise<void> {
		await clickBySelector(S.localeSelect);
		await browser.pause(200);
		const picked = await browser.execute((want: string) => {
			const options = Array.from(
				document.querySelectorAll("#locale-select-options button"),
			) as HTMLElement[];
			const labels: Record<string, string> = { ko: "한국", en: "English" };
			const target = options.find((b) =>
				b.innerText.trim().startsWith(labels[want] ?? want),
			);
			if (!target) return false;
			target.click();
			return true;
		}, target);
		if (!picked) throw new Error(`언어 목록에 ${target} 가 없다`);
		await browser.pause(300);
	}

	it("should show locale select with current value", async () => {
		expect(["ko", "en"]).toContain(await currentLocale());
	});

	it("should switch locale from current to the other", async () => {
		const original = await currentLocale();
		const target = original === "ko" ? "en" : "ko";

		await pickLocale(target);
		expect(await currentLocale()).toBe(target);

		await pickLocale(original);
		expect(await currentLocale()).toBe(original);
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
