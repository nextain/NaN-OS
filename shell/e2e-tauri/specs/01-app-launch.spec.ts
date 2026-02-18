import { S } from "../helpers/selectors.js";

describe("01 — App Launch", () => {
	it("should display the app root", async () => {
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });
	});

	it("should clear localStorage and reload to trigger onboarding", async () => {
		await browser.execute(() => localStorage.removeItem("cafelua-config"));
		await browser.refresh();

		// After clearing config, onboarding wizard should appear
		const onboarding = await $(S.onboardingOverlay);
		await onboarding.waitForDisplayed({ timeout: 30_000 });
	});

	it("should skip onboarding to reach settings", async () => {
		// Skip onboarding to set up config manually in spec 02
		const skipBtn = await $(S.onboardingSkipBtn);
		await skipBtn.waitForClickable({ timeout: 10_000 });
		await skipBtn.click();

		// Onboarding should disappear
		await browser.waitUntil(
			async () => {
				return browser.execute(
					(sel: string) => !document.querySelector(sel),
					S.onboardingOverlay,
				);
			},
			{ timeout: 10_000 },
		);

		// Now switch to settings tab to configure
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 10_000 });
	});
});
