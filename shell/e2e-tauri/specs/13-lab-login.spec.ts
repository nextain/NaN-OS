import { S } from "../helpers/selectors.js";

describe("13 — Lab Login Flow", () => {
	let savedConfig: string | null = null;

	it("should save current config and clear for onboarding", async () => {
		// Save current config to restore later
		savedConfig = await browser.execute(() => {
			return localStorage.getItem("cafelua-config");
		});

		// Clear config to trigger onboarding
		await browser.execute(() => {
			localStorage.removeItem("cafelua-config");
		});
		await browser.refresh();

		const overlay = await $(S.onboardingOverlay);
		await overlay.waitForDisplayed({ timeout: 30_000 });
	});

	it("should navigate to provider step", async () => {
		// Step 1: Agent name
		const agentInput = await $(S.onboardingInput);
		await agentInput.waitForDisplayed({ timeout: 10_000 });
		await agentInput.setValue("Lab-Test-Agent");

		const nextBtn = await $(S.onboardingNextBtn);
		await nextBtn.click();

		// Step 2: User name
		const userInput = await $(S.onboardingInput);
		await userInput.waitForDisplayed({ timeout: 10_000 });
		await userInput.setValue("Lab-Test-User");
		await (await $(S.onboardingNextBtn)).click();

		// Step 3: Character (VRM)
		const vrmCard = await $(S.onboardingVrmCard);
		await vrmCard.waitForDisplayed({ timeout: 10_000 });
		await vrmCard.click();
		await (await $(S.onboardingNextBtn)).click();

		// Step 4: Personality
		const personalityCard = await $(S.onboardingPersonalityCard);
		await personalityCard.waitForDisplayed({ timeout: 10_000 });
		await personalityCard.click();
		await (await $(S.onboardingNextBtn)).click();

		// Step 5: Provider — Lab button should be visible
		const labBtn = await $(S.onboardingLabBtn);
		await labBtn.waitForDisplayed({ timeout: 10_000 });
	});

	it("should inject labKey and verify config persistence", async () => {
		// Note: Tauri deep-link events (listen/emit) cannot be simulated
		// in WebDriver E2E. Instead, we directly inject labKey into
		// localStorage to test the downstream UI flow.
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			const config = raw ? JSON.parse(raw) : {};
			config.labKey = "e2e-test-lab-key-12345";
			config.labUserId = "e2e-lab-user";
			config.provider = "gemini";
			config.model = "gemini-2.5-flash";
			config.onboardingComplete = true;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});

		// Reload to pick up the new config
		await browser.refresh();

		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });

		// Verify labKey is persisted
		const config = await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			return raw ? JSON.parse(raw) : null;
		});
		expect(config).not.toBeNull();
		expect(config.labKey).toBe("e2e-test-lab-key-12345");
		expect(config.labUserId).toBe("e2e-lab-user");
	});

	it("should show Lab balance section in cost dashboard with labKey", async () => {
		// With labKey set, cost dashboard should show Lab balance section
		// First need a message exchange to show the cost badge
		// If cost badge is not visible, the dashboard won't be accessible
		const hasCostBadge = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.costBadge,
		);

		if (hasCostBadge) {
			const costBadge = await $(S.costBadge);
			await costBadge.click();

			const dashboard = await $(S.costDashboard);
			await dashboard.waitForDisplayed({ timeout: 10_000 });

			// Lab balance row should be present (loading state is fine)
			const hasLabBalance = await browser.execute(
				(sel: string) => !!document.querySelector(sel),
				S.labBalanceRow,
			);
			expect(hasLabBalance).toBe(true);

			// Close dashboard
			await costBadge.click();
		}
	});

	it("should restore original config for remaining tests", async () => {
		if (savedConfig) {
			await browser.execute((cfg: string) => {
				localStorage.setItem("cafelua-config", cfg);
			}, savedConfig);
		} else {
			// Fallback: restore with API key
			const apiKey =
				process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY;
			const gatewayToken =
				process.env.CAFE_GATEWAY_TOKEN || "cafelua-dev-token";

			await browser.execute(
				(key: string, token: string) => {
					const config = {
						provider: "gemini",
						apiKey: key,
						gatewayUrl: "ws://localhost:18789",
						gatewayToken: token,
						onboardingComplete: true,
						allowedTools: [
							"skill_time",
							"skill_system_status",
							"skill_memo",
							"execute_command",
							"write_file",
							"read_file",
							"search_files",
						],
					};
					localStorage.setItem(
						"cafelua-config",
						JSON.stringify(config),
					);
				},
				apiKey || "",
				gatewayToken,
			);
		}
		await browser.refresh();

		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });

		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});
});
