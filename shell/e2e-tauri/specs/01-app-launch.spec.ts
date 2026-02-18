import { S } from "../helpers/selectors.js";

describe("01 — App Launch", () => {
	it("should display the app root", async () => {
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });
	});

	it("should clear localStorage and reload to trigger settings tab", async () => {
		await browser.execute(() => localStorage.removeItem("cafelua-config"));
		await browser.refresh();

		// After clearing config, settings tab should be active
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 30_000 });
	});
});
