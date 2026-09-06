import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { S } from "../helpers/selectors.js";
import { safeRefresh } from "../helpers/settings.js";

// 스크린샷 자리는 하네스의 산출물 디렉터리 아래다. `/tmp/app-screenshots` 로 박아 두고
// 만들지 않아서 "directory doesn't exist" 로 스펙 자체가 죽었다 — 화면이 아니라
// 저장 자리가 없어서 붉은 것은 회귀가 재려는 것이 아니다.
const SHOT = resolve(process.env.NAIA_E2E_ARTIFACTS_DIR ?? "/tmp", "app-screenshots");
mkdirSync(SHOT, { recursive: true });

/** Click the app toggle button in titlebar */
async function clickAppToggle() {
	// App toggle is the first button in .titlebar-buttons
	const btn = await $(".titlebar-buttons button:first-child");
	await btn.click();
	await browser.pause(500);
}

describe("75 — App Position & Visibility", () => {
	before(async () => {
		// Reset config to defaults (clear stale state from previous runs)
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.appPosition = "bottom";
			config.appVisible = true;
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
	});

	it("01 — default: side-app visible with avatar in main-area", async () => {
		const app = await $(".side-app");
		await app.waitForDisplayed({ timeout: 10_000 });

		// Avatar is in main-area, not in side-app
		const mainArea = await $(".main-area");
		expect(await mainArea.isDisplayed()).toBe(true);

		await browser.saveScreenshot(`${SHOT}/01-default.png`);
	});

	it("02 — titlebar toggle hides app, keeps avatar", async () => {
		await clickAppToggle();
		await browser.saveScreenshot(`${SHOT}/02-app-hidden.png`);

		// Avatar in main-area remains
		const mainArea = await $(".main-area");
		expect(await mainArea.isDisplayed()).toBe(true);

		// Side app gone
		const app = await $(".side-app");
		expect(await app.isExisting()).toBe(false);
	});

	it("03 — titlebar toggle restores app", async () => {
		await clickAppToggle();
		await browser.saveScreenshot(`${SHOT}/03-app-restored.png`);

		const app = await $(".side-app");
		await app.waitForDisplayed({ timeout: 5_000 });
	});

	it("04 — appVisible persists across refresh", async () => {
		// Hide
		await clickAppToggle();

		await safeRefresh();
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
		await browser.saveScreenshot(`${SHOT}/04-hidden-after-refresh.png`);

		// Avatar stays
		const mainArea = await $(".main-area");
		expect(await mainArea.isDisplayed()).toBe(true);
		// App gone
		const app = await $(".side-app");
		expect(await app.isExisting()).toBe(false);

		// Restore
		await clickAppToggle();
		await browser.pause(300);
	});

	it("05 — appPosition=right", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.appPosition = "right";
			config.appVisible = true;
			localStorage.setItem("naia-config", JSON.stringify(config));
		});

		await safeRefresh();
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
		await browser.saveScreenshot(`${SHOT}/05-position-right.png`);

		const layout = await $(".app-layout");
		const pos = await layout.getAttribute("data-app-position");
		expect(pos).toBe("right");
	});

	it("06 — appPosition=bottom", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.appPosition = "bottom";
			config.appVisible = true;
			localStorage.setItem("naia-config", JSON.stringify(config));
		});

		await safeRefresh();
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
		await browser.saveScreenshot(`${SHOT}/06-position-bottom.png`);

		const layout = await $(".app-layout");
		const pos = await layout.getAttribute("data-app-position");
		expect(pos).toBe("bottom");
	});

	it("07 — appPosition=left + hidden persists", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.appPosition = "left";
			config.appVisible = false;
			localStorage.setItem("naia-config", JSON.stringify(config));
		});

		await safeRefresh();
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
		await browser.saveScreenshot(`${SHOT}/07-left-hidden.png`);

		// Avatar stays in main-area
		const mainArea = await $(".main-area");
		expect(await mainArea.isDisplayed()).toBe(true);
		// App gone
		const app = await $(".side-app");
		expect(await app.isExisting()).toBe(false);

		// Restore
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.appVisible = true;
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
	});
});
