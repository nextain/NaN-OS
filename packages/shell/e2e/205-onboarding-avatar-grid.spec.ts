import { expect, test } from "@playwright/test";
import { TAURI_BASE_MOCK_FALLBACK } from "./helpers/tauri-base-mock";

/**
 * #447 onboarding character step — real-UI acceptance for the launch-QA fixes.
 *
 *   #447-1: the chat is at its default dock, not a full-window bar.
 *   #447-2 (VRM thumbnails): every VRM card shows a loaded /avatars/*.webp image
 *           (the .vrm↔.webp name mismatch is fixed).
 *   #447-2 (single focus): with the NVA default selected, exactly one card is
 *           highlighted — the OL_Woman VRM is no longer focused at the same time.
 *
 * IPC is mocked (no Tauri backend); the VRM thumbnails are served from the real
 * public/avatars by the Vite dev server, which is what these assertions cover.
 */

const ADK = "/tmp/mock-naia-adk-workspace";

// The official naia-adk vrm-files names (see D:/naia-adk/naia-settings/vrm-files).
const VRM_FILES = [
	"01-OL_Woman.vrm",
	"02-Hood_Boy.vrm",
	"03-Sendagaya-Shino-uniform.vrm",
	"04-Sakurada-Fumiriya.vrm",
];
const NVA_DIRS = ["naia", "naia-anime", "minho", "jina"];

function buildInvokeMock() {
	return `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};
	var cbs = new Map(); var nextId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextId++;
		cbs.set(id, function(d) { if (once) cbs.delete(id); return fn && fn(d); });
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { cbs.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, d) { var cb = cbs.get(id); if (cb) cb(d); };
	window.__TAURI_INTERNALS__.convertFileSrc = function(p, proto) {
		return (proto || "asset") + "://localhost/" + encodeURIComponent(p);
	};
	var eventListeners = new Map();
	window.__eventListeners = eventListeners;
	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		if (cmd === "plugin:event|listen") {
			if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
			eventListeners.get(args.event).push({ callbackId: args.handler });
			return args.handler;
		}
		if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
		if (cmd === "detect_gpu_vram") return 8;
		if (cmd === "list_naia_assets") {
			if (args && args.subdir === "vrm-files") return ${JSON.stringify(VRM_FILES)};
			if (args && args.subdir === "nva-files") return ${JSON.stringify(NVA_DIRS)};
			return [];
		}
		// NVA thumbnails read the bundle manifest; reject so NvaThumbnail falls back
		// to its empty placeholder (the card + badge still render) instead of
		// needing a decodable video in headless Chromium.
		if (cmd === "read_local_binary") throw new Error("mock: no binary");
		if (cmd === "write_naia_path_cache") return null;
		if (cmd === "workspace_detect_adk_root") return ${JSON.stringify(ADK)};
		return undefined;
	};
})();
`;
}

async function gotoCharacterStep(page: import("@playwright/test").Page) {
	await page.addInitScript(buildInvokeMock());
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript((adk) => {
		localStorage.setItem("naia-adk-path", adk);
		localStorage.removeItem("naia-config");
	}, ADK);
	await page.goto("/");
	await expect(page.locator(".onboarding-panel")).toBeVisible({
		timeout: 20_000,
	});

	// welcome → agentName → userName → speechStyle → character.
	// Advance with the step Next button; fill the two text steps on the way.
	async function next() {
		await page.locator(".onboarding-step__next-btn").first().click();
		await page.waitForTimeout(450); // 300ms transition lock + margin
	}
	await next(); // welcome → agentName
	await page.locator(".onboarding-step__input").first().fill("Mochi");
	await next(); // agentName → userName
	await page.locator(".onboarding-step__input").first().fill("Alex");
	await next(); // userName → speechStyle
	await next(); // speechStyle → character
	await expect(page.locator(".onboarding-step__avatar-grid")).toBeVisible({
		timeout: 10_000,
	});
}

test.describe("#447 onboarding avatar grid", () => {
	test("VRM thumbnails load and only one avatar is focused (#447-2)", async ({
		page,
	}) => {
		await gotoCharacterStep(page);

		// VRM badge cards: all four official avatars present.
		const vrmBadges = page.locator(".onboarding-step__avatar-badge", {
			hasText: "VRM",
		});
		await expect(vrmBadges).toHaveCount(VRM_FILES.length);

		// Every VRM card's thumbnail image is actually loaded (the .vrm↔.webp name
		// fix): a broken/missing src has naturalWidth 0.
		const vrmImgs = page.locator(
			".onboarding-step__avatar-card img.onboarding-step__avatar-img",
		);
		const imgCount = await vrmImgs.count();
		expect(imgCount).toBe(VRM_FILES.length);
		for (let i = 0; i < imgCount; i += 1) {
			const natural = await vrmImgs
				.nth(i)
				.evaluate((el) => (el as HTMLImageElement).naturalWidth);
			expect(natural, `VRM thumbnail ${i} should be loaded`).toBeGreaterThan(0);
		}

		// Exactly one card is selected (the default NVA) — no double focus with a
		// VRM card.
		await expect(
			page.locator(".onboarding-step__avatar-card--selected"),
		).toHaveCount(1);

		// The selected card is an NVA card (default provider = NVA).
		const selected = page.locator(".onboarding-step__avatar-card--selected");
		await expect(
			selected.locator(".onboarding-step__avatar-badge"),
		).toHaveText("NVA");
	});

	test("chat is at its default dock, not a full-window bar (#447-1)", async ({
		page,
	}) => {
		await gotoCharacterStep(page);
		const chat = page.locator(".naia-chat-area");
		await expect(chat).toBeVisible();
		const box = await chat.boundingBox();
		const viewport = page.viewportSize();
		expect(box).not.toBeNull();
		expect(viewport).not.toBeNull();
		// The chat dock must be a narrow column, not the full window width.
		expect(box!.width).toBeLessThan(viewport!.width * 0.6);
	});
});
