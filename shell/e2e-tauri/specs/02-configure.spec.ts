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
	it("should fill settings and save", async () => {
		// Wait for settings tab to appear
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

	it("should enable chat input after settings saved", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});
});
