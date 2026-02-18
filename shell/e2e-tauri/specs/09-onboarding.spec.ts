import { S } from "../helpers/selectors.js";

describe("09 — Onboarding Wizard", () => {
	it("should show onboarding when config is cleared", async () => {
		// Clear config + mark onboarding incomplete
		await browser.execute(() => {
			localStorage.removeItem("cafelua-config");
		});
		await browser.refresh();

		// Onboarding overlay should appear
		const overlay = await $(S.onboardingOverlay);
		await overlay.waitForDisplayed({ timeout: 30_000 });
	});

	it("should progress through welcome → name step", async () => {
		// Welcome step: click Next
		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.waitForClickable({ timeout: 10_000 });
		await nextBtn.click();

		// Name step: input field should appear
		const nameInput = await $(S.onboardingInput);
		await nameInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should enter name and proceed to provider step", async () => {
		const nameInput = await $(S.onboardingInput);
		await nameInput.setValue("E2E-User");

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// Provider cards should appear
		const providerCard = await $(S.onboardingProviderCard);
		await providerCard.waitForDisplayed({ timeout: 10_000 });
	});

	it("should select provider and proceed to API key step", async () => {
		// Click first provider card (Gemini)
		const providerCard = await $(S.onboardingProviderCard);
		await providerCard.click();

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// API key input should appear
		const apiInput = await $(S.onboardingInput);
		await apiInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should skip from API key step and complete onboarding", async () => {
		// Use skip to avoid needing a real API key for this test
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
			{ timeout: 10_000, timeoutMsg: "Onboarding overlay did not disappear after skip" },
		);

		// Verify config saved
		const config = await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			return raw ? JSON.parse(raw) : null;
		});
		expect(config).not.toBeNull();
		expect(config.onboardingComplete).toBe(true);
		expect(config.userName).toBe("E2E-User");
	});

	it("should restore previous config for remaining tests", async () => {
		// Restore full config with API key so subsequent tests work
		const apiKey = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY;
		const gatewayToken = process.env.CAFE_GATEWAY_TOKEN || "cafelua-dev-token";

		await browser.execute(
			(key: string, token: string) => {
				const raw = localStorage.getItem("cafelua-config");
				const config = raw ? JSON.parse(raw) : {};
				config.provider = "gemini";
				config.apiKey = key;
				config.gatewayUrl = "ws://localhost:18789";
				config.gatewayToken = token;
				config.onboardingComplete = true;
				config.allowedTools = [
					"skill_time",
					"skill_system_status",
					"skill_memo",
					"execute_command",
					"write_file",
					"read_file",
					"search_files",
				];
				localStorage.setItem("cafelua-config", JSON.stringify(config));
			},
			apiKey || "",
			gatewayToken,
		);
		await browser.refresh();

		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });

		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});
});
