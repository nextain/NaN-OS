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

	it("should show agent name step and proceed to user name", async () => {
		// Agent name step: input field should be visible
		const agentInput = await $(S.onboardingInput);
		await agentInput.waitForDisplayed({ timeout: 10_000 });
		await agentInput.setValue("E2E-Agent");

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.waitForClickable({ timeout: 10_000 });
		await nextBtn.click();

		// User name step: input should appear
		const userInput = await $(S.onboardingInput);
		await userInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should enter user name and proceed to character step", async () => {
		const userInput = await $(S.onboardingInput);
		await userInput.setValue("E2E-User");

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// VRM cards should appear
		const vrmCard = await $(S.onboardingVrmCard);
		await vrmCard.waitForDisplayed({ timeout: 10_000 });
	});

	it("should select character and proceed to personality step", async () => {
		// Click first VRM card
		const vrmCard = await $(S.onboardingVrmCard);
		await vrmCard.click();

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// Personality cards should appear
		const personalityCard = await $(S.onboardingPersonalityCard);
		await personalityCard.waitForDisplayed({ timeout: 10_000 });
	});

	it("should select personality and proceed to provider step", async () => {
		const personalityCard = await $(S.onboardingPersonalityCard);
		await personalityCard.click();

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// Provider cards should appear
		const providerCard = await $(S.onboardingProviderCard);
		await providerCard.waitForDisplayed({ timeout: 10_000 });
	});

	it("should show Lab Login section on provider step", async () => {
		// Lab section should be visible before provider cards
		const labSection = await $(S.onboardingLabSection);
		await labSection.waitForDisplayed({ timeout: 10_000 });

		const labBtn = await $(S.onboardingLabBtn);
		expect(await labBtn.isDisplayed()).toBe(true);

		// Lab description text should exist
		const labDesc = await $(S.onboardingLabDesc);
		expect(await labDesc.isDisplayed()).toBe(true);

		// Divider ("또는") between Lab and manual provider
		const divider = await $(S.onboardingDivider);
		expect(await divider.isDisplayed()).toBe(true);
	});

	it("should select provider and proceed to API key step", async () => {
		const providerCard = await $(S.onboardingProviderCard);
		await providerCard.click();

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// API key input should appear
		const apiInput = await $(S.onboardingInput);
		await apiInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should go back to agent name and skip onboarding", async () => {
		// Go back through all steps to agentName where skip is available
		const steps = ["provider", "personality", "character", "userName", "agentName"];
		for (const _step of steps) {
			const btn = await $(S.onboardingBackBtn);
			await btn.waitForClickable({ timeout: 5_000 });
			await btn.click();
			await browser.pause(300);
		}

		// Skip from agentName
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
