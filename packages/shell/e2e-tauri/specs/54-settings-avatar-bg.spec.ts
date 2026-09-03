import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	openSettingsSection,
	openVrmAvatarPicker,
	scrollToSection,
} from "../helpers/settings.js";

/**
 * 54 — Settings: Avatar VRM & Background
 */
describe("54 — settings avatar & background", () => {
	before(async () => {
		await ensureAppReady();
		// 아바타와 배경은 '아바타' 구역에 있고, VRM 카드는 공급자를 VRM 으로
		// 바꿔야 렌더된다 (#541).
		await openVrmAvatarPicker();
	});

	it("VRM 피커가 렌더된다 — 목록이거나 비었다는 표시", async () => {
		await scrollToSection(".vrm-list");
		const state = await browser.execute(() => ({
			list: !!document.querySelector(".vrm-list"),
			items: document.querySelectorAll(".vrm-list-item").length,
			empty: !!document.querySelector(".vrm-list-empty"),
		}));
		// 설치된 VRM 개수는 기계마다 다르다. 피커가 떴는지, 그리고 항목이
		// 없으면 없다고 말하는지를 본다 — 빈 화면을 통과로 세지 않는다.
		expect(state.list).toBe(true);
		expect(state.items > 0 || state.empty).toBe(true);
	});

	it("고른 VRM 이 하나만 활성으로 표시된다", async () => {
		const state = await browser.execute(() => ({
			items: document.querySelectorAll(".vrm-list-item").length,
			active: document.querySelectorAll(".vrm-list-item--active").length,
		}));
		if (state.items === 0) return; // 설치된 VRM 이 없는 기계
		expect(state.active).toBe(1);
	});

	it("should change active VRM on click", async () => {
		const switched = await browser.execute((allSel: string) => {
			const all = document.querySelectorAll(allSel);
			for (let i = 0; i < all.length; i++) {
				// Skip the add card and already-active cards
				// 목록 항목은 onClick 으로 고른다 (#541 — 카드 시절의 길게누르기 아님).
				if (all[i].classList.contains("vrm-list-item--active")) continue;
				(all[i] as HTMLElement).click();
				return true;
			}
			return false;
		}, S.vrmCard);

		if (!switched) return; // Only 1 card, skip
		await browser.pause(300);

		const activeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.vrmCardActive,
		);
		expect(activeCount).toBeGreaterThanOrEqual(1);
	});

	it("배경은 '일반' 구역의 드롭다운으로 고른다", async () => {
		// 배경은 카드 격자에서 드롭다운으로 바뀌고 '일반' 구역으로 옮겨졌다
		// (#541 — SettingsTab 주석: "avatar 탭에서 이동").
		await openSettingsSection("일반");
		const options = await browser.execute(() => {
			const labels = Array.from(document.querySelectorAll("label"));
			const field = labels
				.map((l) => l.parentElement)
				.find((el) => !!el?.querySelector("select"));
			return field?.querySelectorAll("select option").length ?? 0;
		});
		// 최소한 "배경 없음" 항목은 있어야 한다.
		expect(options).toBeGreaterThanOrEqual(1);
	});

	it("should change active BG card on click", async () => {
		const switched = await browser.execute((allSel: string) => {
			const all = document.querySelectorAll(allSel);
			for (let i = 0; i < all.length; i++) {
				if (
					all[i].classList.contains("bg-card-add") ||
					all[i].classList.contains("active")
				)
					continue;
				// trigger mousedown+up instead of click due to useLongPress
				const el = all[i] as HTMLElement;
				el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
				el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
				return true;
			}
			return false;
		}, S.bgCard);

		if (!switched) return;
		await browser.pause(300);

		const activeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.bgCardActive,
		);
		expect(activeCount).toBeGreaterThanOrEqual(1);
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
