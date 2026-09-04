import { S } from "../helpers/selectors.js";
import {
	clickBySelector,
	ensureAppReady,
	navigateToSettings,
	openSettingsSection,
} from "../helpers/settings.js";

/**
 * 54 — Settings: Avatar VRM & Background
 *
 * #541: VRM 선택은 아바타 섹션의 목록(vrm-list-item)이고, 배경은 General
 * 섹션의 select 위젯이다 — 옛 카드 그리드 화면을 기다리지 않는다.
 */
describe("54 — settings avatar & background", () => {
	before(async () => {
		await ensureAppReady();
		await navigateToSettings();
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });
	});

	it("should list VRM models in the avatar section", async () => {
		await openSettingsSection("avatar");
		const count = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.vrmCard,
		);
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it("should mark at most one active VRM model", async () => {
		// 저장된 모델 경로가 목록과 매칭되지 않으면 초기 활성이 없을 수 있다 —
		// 여기서는 유일성 불변만 단정하고, 선택 동작은 다음 테스트가 검증한다.
		const activeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.vrmCardActive,
		);
		expect(activeCount).toBeLessThanOrEqual(1);
	});

	it("should change the active VRM on click", async () => {
		const switched = await browser.execute((allSel: string) => {
			const all = document.querySelectorAll(allSel);
			for (let i = 0; i < all.length; i++) {
				if (all[i].classList.contains("vrm-list-item--active")) continue;
				(all[i] as HTMLElement).click();
				return true;
			}
			return false;
		}, S.vrmCard);
		if (!switched) return; // 모델이 하나뿐이면 전환 검증은 건너뛴다
		await browser.pause(300);
		const activeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.vrmCardActive,
		);
		expect(activeCount).toBe(1);
	});

	it("should offer background choices in the general section", async () => {
		await openSettingsSection("general");
		const optionCount = await browser.execute((sel: string) => {
			const select = document.querySelector(sel) as HTMLSelectElement | null;
			return select ? select.options.length : 0;
		}, S.bgSelect);
		// "없음" 옵션 + 실제 배경 1개 이상
		expect(optionCount).toBeGreaterThanOrEqual(2);
	});

	it("should switch the background selection", async () => {
		const changed = await browser.execute((sel: string) => {
			const select = document.querySelector(sel) as HTMLSelectElement | null;
			if (!select || select.options.length < 2) return null;
			const current = select.value;
			const next = Array.from(select.options)
				.map((option) => option.value)
				.find((value) => value !== current);
			if (next === undefined) return null;
			select.value = next;
			select.dispatchEvent(new Event("change", { bubbles: true }));
			return { from: current, to: next };
		}, S.bgSelect);
		if (!changed) return;
		await browser.pause(300);
		const value = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLSelectElement | null)?.value ?? "",
			S.bgSelect,
		);
		expect(value).toBe(changed.to);
	});

	it("should navigate back to chat tab", async () => {
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
