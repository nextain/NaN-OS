import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

const TAURI_MOCK = `
(function() {
	window.__NAIA_NEW_CORE__ = true;
	window.__STORE_CERT_E2E__ = { calls: [] };
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
	var callbacks = new Map(); var nextCbId = 1; var listeners = new Map();
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) { var id = nextCbId++; callbacks.set(id, function(data) { if (once) callbacks.delete(id); return fn && fn(data); }); return id; };
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) { var cb = callbacks.get(id); if (cb) cb(data); };
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
	function emit(event, payload) { (listeners.get(event) || []).forEach(function(id) { window.__TAURI_INTERNALS__.runCallback(id, { event: event, payload: payload }); }); }
	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		window.__STORE_CERT_E2E__.calls.push({ cmd: cmd, args: args });
		if (cmd === "plugin:event|listen") { if (!listeners.has(args.event)) listeners.set(args.event, []); listeners.get(args.event).push(args.handler); return args.handler; }
		if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
		if (cmd === "write_naia_config" || cmd === "write_agent_key" || cmd === "reload_agent_settings" || cmd === "detect_gpu_vram") return null;
		if (cmd === "agent_key_exists") return false;
		if (cmd === "send_to_agent_command") {
			var request = JSON.parse(args.message);
			if (request.type === "panel_skills" || request.type === "panel_skills_clear") return null;
			setTimeout(function() {
				emit("agent_response", JSON.stringify({ type: "usage", requestId: request.requestId, inputTokens: 0, outputTokens: 0, cost: 0, model: "gemini-2.5-flash" }));
				emit("agent_response", JSON.stringify({ type: "error", requestId: request.requestId, message: "provider rejected the API key" }));
			}, 20);
			return null;
		}
		return undefined;
	};
})();
`;

test("Store reviewer journey keeps a zero-token provider failure actionable", async ({
	page,
}) => {
	const serverErrors: string[] = [];
	page.on("response", (response) => {
		if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
	});
	await page.addInitScript(TAURI_MOCK);
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(() => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ provider: "gemini", model: "gemini-2.5-flash", locale: "en", onboardingComplete: true }),
		);
	});

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
	await page.locator(".app-bar-settings").click();
	await page.locator('[data-settings-tab="brain"]').click();
	await page.locator("#provider-select").selectOption("gemini");
	await page.locator("#apikey-input").fill("store-review-key");
	await page.locator(".settings-save-btn").first().click();

	await expect
		.poll(() =>
			page.evaluate(() => {
				const calls = (window as any).__STORE_CERT_E2E__.calls as Array<{ cmd: string; args: Record<string, unknown> }>;
				const keyIndex = calls.findIndex(
					(call) =>
						call.cmd === "write_agent_key" &&
						call.args.envKey === "GEMINI_API_KEY" &&
						call.args.value === "store-review-key",
				);
				return keyIndex >= 0 && calls.slice(keyIndex + 1).some((call) => call.cmd === "reload_agent_settings");
			}),
		)
		.toBe(true);

	await page.locator(".chat-tabs .chat-tab").first().click();
	await page.locator(".chat-input").fill("certification probe");
	await page.locator(".chat-input").press("Enter");
	await expect(page.getByText("provider rejected the API key")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText(/\$0\.000000.*0 tokens/)).toHaveCount(0);
	expect(serverErrors).toEqual([]);
});
