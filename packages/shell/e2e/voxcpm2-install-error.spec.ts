import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #453 — a failed local-voice (VoxCPM2 TensorRT) install must show a readable,
 * persistent reason, not silently "close".
 *
 * Regression guard: `install_voxcpm2_runtime` failing rolls the TTS provider
 * back to a cloud/edge default, which unmounts the naia-local-voice section
 * (and any error rendered inside it). The reason is kept in a provider-
 * independent banner (`voxcpm2-install-error`) so the user can see e.g. an
 * insufficient-disk-space failure and act on it.
 */

const API_KEY = "e2e-mock-key";
const DISK_MSG =
	"insufficient_disk_space: drive C:\\ has 5.6 GiB free but >= 9 GiB is required. Free space or set NAIA_VOXCPM2_RUNTIME_ROOT to a drive with more room.";

function buildMock(): string {
	return `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
	var callbacks = new Map(); var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once){ var id = nextCbId++; callbacks.set(id, function(d){ if(once) callbacks.delete(id); return fn && fn(d); }); return id; };
	window.__TAURI_INTERNALS__.unregisterCallback = function(id){ callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, d){ var cb = callbacks.get(id); if (cb) cb(d); };
	window.__TAURI_INTERNALS__.callbacks = callbacks;
	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
	window.__TAURI_INTERNALS__.convertFileSrc = function(p, proto){ return (proto||"asset") + "://localhost/" + encodeURIComponent(p); };
	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		if (cmd === "plugin:event|listen") { if(!eventListeners.has(args.event)) eventListeners.set(args.event, []); eventListeners.get(args.event).push(args.handler); return args.handler; }
		if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
		// naiaKey is read from the secure store; return the logged-in member key.
		if (cmd === "plugin:store|get") return (args && args.key === "naiaKey") ? [${JSON.stringify(API_KEY)}, true] : [null, false];
		if (cmd === "detect_gpu_vram") return 8;
		if (cmd === "voxcpm2_status") return false;
		if (cmd === "voxcpm2_installation_status") return { phase: "blocked", ready: false, canStart: false, summary: "install required", steps: [] };
		if (cmd === "write_slots_manifest" || cmd === "write_naia_config" || cmd === "start_voxcpm2" || cmd === "stop_voxcpm2") return null;
		// The install fails on disk space — the reason must survive to the UI.
		if (cmd === "install_voxcpm2_runtime") { throw new Error(${JSON.stringify(DISK_MSG)}); }
		return undefined; // TAURI_BASE_MOCK_FALLBACK handles the rest
	};
})();
`;
}

test("failed local-voice install surfaces a persistent, readable error (#453)", async ({
	page,
}) => {
	await page.addInitScript(buildMock());
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(
		(configJson: string) => localStorage.setItem("naia-config", configJson),
		JSON.stringify({
			provider: "nextain",
			model: "gemini-3.5-flash",
			naiaKey: API_KEY,
			enableTools: false,
			ttsEnabled: true,
			ttsProvider: "naia-local-voice",
			localGpuTier: "windows-voice-6g",
			locale: "ko",
			onboardingComplete: true,
		}),
	);

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
	await page.getByRole("button", { name: /^(설정|Settings)$/ }).click();
	await page.locator('[data-settings-tab="voice"]').click();

	// Selecting the local GPU voice starts the install transaction
	// (selectProfileTtsProvider → ensureLocalVoiceReady → install_voxcpm2_runtime).
	const ttsSelect = page.getByTestId("gateway-tts-provider");
	await expect(ttsSelect).toBeVisible({ timeout: 15_000 });
	await ttsSelect.selectOption("naia-local-voice");

	// The install rejects on disk space. The provider rolls back to edge (the
	// local-voice section unmounts), but the error banner must remain readable.
	const banner = page.locator('[data-testid="voxcpm2-install-error"]');
	await expect(banner).toBeVisible({ timeout: 15_000 });
	await expect(banner).toContainText(/disk|space|GiB/i);

	// Regression guard for the "dialog just closes" bug: it must persist.
	await page.waitForTimeout(1500);
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(/GiB/);
});
