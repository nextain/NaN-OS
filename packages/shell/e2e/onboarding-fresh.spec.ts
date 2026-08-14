import { mkdirSync } from "node:fs";
import path from "node:path";
/**
 * Fresh onboarding flow E2E test.
 * Covers: agentName → userName → speechStyle → character → background → provider → voice → complete
 * Verifies: localStorage config saved correctly, each step renders, blob URL flow.
 */
import { expect, test } from "@playwright/test";
import { TAURI_BASE_MOCK_FALLBACK } from "./helpers/tauri-base-mock";

const MOCK_ADK_PATH = "/home/user/naia-adk";
const MOCK_VIDEO_FILE = "flower-shop-beachside-moewalls-com.mp4";
const MOCK_BG_FILES = [MOCK_VIDEO_FILE, "background-space.png"];
const MOCK_VRM_FILES = ["01-OL_Woman.vrm", "02-Hood_Boy.vrm"];
const MOCK_NVA_FILES = ["alpha", "naia", "naia-prebaked"];
// Minimal valid 1x1 PNG bytes (used as mock binary payload for read_local_binary)
const MINI_PNG = [
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
	0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8,
	215, 99, 248, 207, 192, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73,
	69, 78, 68, 174, 66, 96, 130,
];

function buildMockScript() {
	return `
(function() {
    window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
    window.__TAURI_INTERNALS__.metadata = {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
    };
    var callbacks = new Map();
    var nextCbId = 1;
    window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
        var id = nextCbId++;
        callbacks.set(id, function(data) { if (once) callbacks.delete(id); return fn && fn(data); });
        return id;
    };
    window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
    window.__TAURI_INTERNALS__.runCallback = function(id, data) { var cb = callbacks.get(id); if (cb) cb(data); };
    window.__TAURI_INTERNALS__.callbacks = callbacks;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
    window.__eventListeners = new Map();
    window.__TAURI_INTERNALS__.convertFileSrc = function(p) {
        if (/\.mp4$/i.test(p)) return window.location.origin + "/__e2e_asset__/background.mp4";
        return "http://asset.localhost/" + encodeURIComponent(p);
    };

    var BG_FILES = ${JSON.stringify(MOCK_BG_FILES)};
    var VRM_FILES = ${JSON.stringify(MOCK_VRM_FILES)};
    var NVA_FILES = ${JSON.stringify(MOCK_NVA_FILES)};
    var MINI_PNG = new Uint8Array(${JSON.stringify(MINI_PNG)});

    window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
        if (cmd === "plugin:event|listen") {
            var evt = args.event;
            if (!window.__eventListeners.has(evt)) window.__eventListeners.set(evt, []);
            window.__eventListeners.get(evt).push({ callbackId: args.handler });
            return args.handler;
        }
        if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
        if (cmd === "frontend_log") return;
        if (cmd === "detect_gpu_vram") return 6;
        if (cmd === "list_skills") return [];
        if (cmd === "list_stt_models") return [];
        if (cmd === "panel_list_installed") return [];
        if (cmd === "plugin:window|get_cursor_position" || cmd === "plugin:window|start_resize_dragging") return null;
        if (cmd === "plugin:window|is_maximized") return false;
        if (cmd === "plugin:window|show") return;
        if (cmd === "plugin:updater|check") return null;
        if (cmd === "copy_bundled_assets") return;
        if (cmd === "list_naia_assets") {
            var sub = args && args.subdir;
            if (sub === "background") return BG_FILES;
            if (sub === "vrm-files") return VRM_FILES;
            if (sub === "nva-files") return NVA_FILES;
            if (sub === "bgm-musics") return ["Afternoon Whispers.mp3"];
            return [];
        }
        if (cmd === "read_local_binary") {
            // Return minimal PNG bytes for any file (enough to create a blob URL)
            return Array.from(MINI_PNG);
        }
        if (cmd === "get_linked_channels") return [];
        if (cmd === "get_lab_user_info") return null;
        if (cmd === "get_memory_facts") return [];
        if (cmd === "workspace_get_sessions") return [];
        if (cmd === "workspace_classify_dirs") return [];
        return undefined;
    };
})();
`;
}

async function setupFreshOnboarding(page: import("@playwright/test").Page) {
	const videoPath = path.resolve(
		process.cwd(),
		"e2e/fixtures/head-green-100.mp4",
	);
	await page.route("**/__e2e_asset__/background.mp4", (route) =>
		route.fulfill({ path: videoPath, contentType: "video/mp4" }),
	);
	await page.addInitScript(buildMockScript());
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript(() => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.removeItem("naia-config");
	});
	await page.goto("/");
	// Splash screen dismisses after 5s timeout (avatar won't load in test env).
	// Then onboarding-panel renders inside right-content--onboarding.
	await expect(page.locator(".onboarding-panel")).toBeVisible({
		timeout: 15_000,
	});
	if ((await page.locator('input[placeholder="Naia"]').count()) === 0) {
		await page.getByRole("button", { name: /Next/i }).click();
		await page.waitForTimeout(400);
	}
}

async function clickNext(page: import("@playwright/test").Page) {
	const btn = page.getByRole("button", { name: /다음|Next/i });
	await expect(btn).toBeEnabled({ timeout: 5_000 });
	await btn.click({ force: true });
	// Wait for the 300ms transition lock
	await page.waitForTimeout(400);
}

test.describe("Fresh onboarding flow", () => {
	test("agentName step is first", async ({ page }) => {
		await setupFreshOnboarding(page);
		await expect(page.locator('input[placeholder="Naia"]')).toBeVisible({
			timeout: 5_000,
		});
		await expect(
			page.getByRole("button", { name: /다음|Next/i }),
		).toBeEnabled();
	});

	test("walks agentName → userName → speechStyle → character → background → provider", async ({
		page,
	}) => {
		await setupFreshOnboarding(page);

		// agentName
		await page.locator('input[placeholder="Naia"]').fill("TestBot");
		await clickNext(page);

		// userName
		const userNameInput = page.locator(
			'input[placeholder="Enter a name"], input[placeholder="이름을 입력하세요"]',
		);
		await expect(userNameInput).toBeVisible({
			timeout: 5_000,
		});
		await expect(userNameInput).not.toHaveAttribute("placeholder", "Luke");
		await userNameInput.fill("Tester");
		await clickNext(page);

		// speechStyle
		await clickNext(page);

		// Character choices expose both VRM and NVA without a GPU/profile gate.
		await expect(
			page.locator(".onboarding-step__avatar-card").first(),
		).toBeVisible({
			timeout: 8_000,
		});
		await expect(page.getByText("VRM", { exact: true })).toHaveCount(2);
		await expect(page.getByText("NVA", { exact: true })).toHaveCount(3);
		const defaultNaia = page
			.locator(".onboarding-step__avatar-card")
			.filter({ has: page.getByText("naia", { exact: true }) });
		await expect(defaultNaia).toHaveClass(/avatar-card--selected/);
		const nvaChoice = page
			.locator(".onboarding-step__avatar-card")
			.filter({ has: page.getByText("naia-prebaked", { exact: true }) });
		await expect(nvaChoice).toBeVisible();
		await nvaChoice.click();
		await clickNext(page);

		// background — shows items from mocked list_naia_assets + read_local_binary → blob URL
		await expect(page.locator(".onboarding-step__bg-card").first()).toBeVisible(
			{
				timeout: 10_000,
			},
		);
		// The video card must become a captured still image, not a play glyph.
		const videoCard = page
			.locator(".onboarding-step__bg-card")
			.filter({ hasText: "flower-shop-beachside-moewalls-com" });
		const bgImg = videoCard.locator("img.onboarding-step__bg-img");
		await expect(bgImg).toBeVisible({ timeout: 8_000 });
		const imgSrc = await bgImg.getAttribute("src");
		expect(imgSrc?.startsWith("data:image/jpeg")).toBe(true);
		await expect(videoCard).not.toContainText("▶");
		const screenshotDir = path.resolve(
			process.cwd(),
			"../../tmp/naia-shell-windows-hardening",
		);
		mkdirSync(screenshotDir, { recursive: true });
		await page.locator(".onboarding-panel").screenshot({
			path: path.join(screenshotDir, "onboarding-video-thumbnail.png"),
		});
		await clickNext(page);

		// provider step shows the setup-later action.
		await expect(page.getByText(/Set up later/i)).toBeVisible({
			timeout: 5_000,
		});
	});
	test("completes onboarding and saves config to localStorage", async ({
		page,
	}) => {
		test.slow();
		await setupFreshOnboarding(page);

		// Walk through all steps quickly
		await page.locator('input[placeholder="Naia"]').fill("Mochi");
		await clickNext(page);
		await page
			.locator(
				'input[placeholder="Enter a name"], input[placeholder="이름을 입력하세요"]',
			)
			.fill("Tester");
		await clickNext(page);
		await clickNext(page); // speechStyle
		await clickNext(page); // character
		// background — wait for blob URL to load before advancing
		await expect(page.locator(".onboarding-step__bg-card").first()).toBeVisible(
			{
				timeout: 10_000,
			},
		);
		await clickNext(page);
		// provider skip
		await page.getByText(/Set up later/i).click();
		await page.waitForTimeout(400);
		await clickNext(page); // voice step
		const startBtn = page.getByRole("button", {
			name: /시작하기|Get Started/i,
		});
		await expect(startBtn).toBeVisible({ timeout: 5_000 });
		await startBtn.click();
		// Wait for the 1200ms onComplete delay
		await page.waitForTimeout(1500);

		// Verify config saved
		const config = await page.evaluate(() =>
			JSON.parse(localStorage.getItem("naia-config") || "{}"),
		);
		expect(config.onboardingComplete).toBe(true);
		expect(config.agentName).toBe("Mochi");
		expect(config.userName).toBe("Tester");
		expect(config.persona).toContain("Mochi");
		// Hardware recommendation is measured at runtime. A browser mock without
		// a VRAM probe must not persist the removed legacy `avatar-6g` tier.
		expect(config.localGpuTier).toBeUndefined();
	});
});
