import { configureSettings } from "../helpers/settings.js";
import { S } from "../helpers/selectors.js";

const API_KEY = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY) {
	throw new Error(
		"API key required: set CAFE_E2E_API_KEY or GEMINI_API_KEY (shell/.env)",
	);
}

const GATEWAY_TOKEN = process.env.CAFE_GATEWAY_TOKEN || "cafelua-dev-token";

describe("02 — Configure Settings", () => {
	it("should switch to settings tab and configure", async () => {
		// After onboarding skip, we need to navigate to settings tab
		// Click settings tab (3rd tab)
		const settingsTabBtn = await $(
			".chat-tab:nth-child(3)",
		);
		await settingsTabBtn.waitForClickable({ timeout: 10_000 });
		await settingsTabBtn.click();

		// Wait for settings tab content
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 30_000 });

		await configureSettings({
			provider: "gemini",
			apiKey: API_KEY,
			gatewayUrl: "ws://localhost:18789",
			gatewayToken: GATEWAY_TOKEN,
		});
	});

	it("should pre-approve skill tools for E2E", async () => {
		// Add skill tools to allowedTools so permission modals don't block tests
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			if (!raw) return;
			const config = JSON.parse(raw);
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
		});
	});

	it("should show Lab section in settings", async () => {
		// Navigate to settings tab if not already there
		const settingsTabBtn = await $(".chat-tab:nth-child(3)");
		await settingsTabBtn.waitForClickable({ timeout: 10_000 });
		await settingsTabBtn.click();

		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });

		// Lab section divider should be present
		const hasLabSection = await browser.execute(() => {
			const dividers = document.querySelectorAll(
				".settings-section-divider",
			);
			return Array.from(dividers).some((d) =>
				d.textContent?.includes("Lab"),
			);
		});
		expect(hasLabSection).toBe(true);
	});

	it("should enable chat input after settings saved", async () => {
		// Switch back to chat tab
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.waitForClickable({ timeout: 10_000 });
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});
});
