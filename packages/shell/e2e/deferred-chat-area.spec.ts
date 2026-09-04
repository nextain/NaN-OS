import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

const TAURI_MOCK = `
(function () {
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
  var callbacks = new Map(); var nextId = 1;
  window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
  window.__TAURI_INTERNALS__.transformCallback = function (fn, once) { var id = nextId++; callbacks.set(id, function (value) { if (once) callbacks.delete(id); return fn && fn(value); }); return id; };
  window.__TAURI_INTERNALS__.unregisterCallback = function (id) { callbacks.delete(id); };
  window.__TAURI_INTERNALS__.runCallback = function (id, value) { var fn = callbacks.get(id); if (fn) fn(value); };
  window.__TAURI_INTERNALS__.convertFileSrc = function (path, protocol) { return (protocol || "asset") + "://localhost/" + encodeURIComponent(path); };
  window.__TAURI_INTERNALS__.invoke = async function (cmd, args) {
    if (cmd === "plugin:event|listen") return args.handler;
    if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
    return undefined;
  };
})();
`;

let chatChunkPath: string;

async function seedShell(page: import("@playwright/test").Page) {
	await page.addInitScript({ content: TAURI_MOCK });
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(() => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "gemini",
				model: "gemini-2.5-flash",
				apiKey: "e2e-mock-key",
				enableTools: false,
				locale: "ko",
				onboardingComplete: true,
			}),
		);
	});
}

test.describe("deferred ChatArea boundary", () => {
	test.beforeAll(() => {
		const bundleReport = JSON.parse(
			readFileSync(
				new URL("../dist/bundle-budget-report.json", import.meta.url),
				"utf8",
			),
		) as { deferredChunks: Record<string, { file: string }> };
		chatChunkPath =
			bundleReport.deferredChunks["src/components/ChatArea.tsx"].file;
	});

	test("shows loading, renders chat, and preserves the narrow shell", async ({
		page,
	}) => {
		await seedShell(page);
		await page.setViewportSize({ width: 480, height: 800 });
		await page.route(`**/${chatChunkPath}`, async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 350));
			await route.continue();
		});

		const navigation = page.goto("/");
		await expect(page.getByRole("status")).toBeVisible();
		await navigation;
		await expect(page.locator(".chat-input")).toBeVisible();
		await expect(page.locator(".app-bar")).toBeVisible();
		await expect(page.locator(".chat-message")).toHaveCount(0);
		const viewportWidth = await page.evaluate(
			() => document.documentElement.scrollWidth,
		);
		expect(viewportWidth).toBeLessThanOrEqual(480);
	});

	test("reloads the shell after the first production chunk failure", async ({
		page,
	}) => {
		await seedShell(page);
		let requests = 0;
		await page.route(`**/${chatChunkPath}`, async (route) => {
			requests += 1;
			if (requests === 1) return route.abort("failed");
			return route.continue();
		});

		await page.goto("/");
		const alert = page.getByRole("alert");
		await expect(alert).toBeVisible();
		await alert.getByRole("button").focus();
		await expect(alert.getByRole("button")).toBeFocused();
		await alert.getByRole("button").click();
		await expect(page.locator(".chat-input")).toBeVisible();
		expect(requests).toBeGreaterThanOrEqual(2);
	});
});
