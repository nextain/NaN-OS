/**
 * 92 — Browser App: Click Blocking Regression
 *
 * Verifies that the browser app's error overlay does NOT block clicks on
 * other apps when the browser slot is inactive (opacity:0).
 *
 * Root cause (fixed):
 *   HRESULT(0x8007139F) race → status="error" → .browser-app__overlay--error
 *   rendered with pointer-events:auto → all apps beneath it become unclickable
 *   (all .content-app__slot elements are position:absolute;inset:0 — they stack).
 *
 * Fixes in place:
 *   1. browser_webview.rs — tokio Mutex serialises concurrent browser_wv_create
 *      calls; post-failure check recovers if race sibling won.
 *   2. global.css — .browser-app__overlay--error inherits pointer-events:none
 *      from parent; only .content-app__slot--active overrides to auto.
 *
 * These tests run in E2E mode (CAFE_DEBUG_E2E=1) where browser_wv_create
 * returns Ok immediately — so status stays "ready" and no error overlay is
 * rendered.  The CSS invariant tests use a synthetic overlay to verify that
 * the rule would also protect against future regressions.
 */

import { S } from "../helpers/selectors.js";

const SHOT = "/tmp/browser-app-clicks";

/** Return the .content-app__slot that wraps the browser app, or null. */
function getBrowserSlotInfo(): Promise<{
	found: boolean;
	isActive: boolean;
	slotPe: string;
	hasErrorOverlay: boolean;
	errorOverlayPe: string;
}> {
	return browser.execute(() => {
		const slots = Array.from(
			document.querySelectorAll(".content-app__slot"),
		);
		const browserSlot = slots.find((s) => s.querySelector(".browser-app"));
		if (!browserSlot) {
			return {
				found: false,
				isActive: false,
				slotPe: "n/a",
				hasErrorOverlay: false,
				errorOverlayPe: "n/a",
			};
		}
		const isActive = browserSlot.classList.contains(
			"content-app__slot--active",
		);
		const slotPe = window.getComputedStyle(browserSlot).pointerEvents;
		const errorOverlay = browserSlot.querySelector(
			".browser-app__overlay--error",
		);
		const errorOverlayPe = errorOverlay
			? window.getComputedStyle(errorOverlay).pointerEvents
			: "none (not present)";
		return {
			found: true,
			isActive,
			slotPe,
			hasErrorOverlay: !!errorOverlay,
			errorOverlayPe,
		};
	});
}

describe("92 — Browser App: Click Blocking Regression", () => {
	before(async () => {
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 15_000 });
		// Give keepAlive apps time to mount and initWebview to resolve.
		await browser.pause(1_500);
	});

	// ── 01: No error overlay in E2E mode ────────────────────────────────────

	it("01 — no browser-app__overlay--error rendered in E2E mode", async () => {
		// In E2E mode browser_wv_create returns Ok() → status="ready" → no error overlay.
		const hasError = await browser.execute(
			() => !!document.querySelector(".browser-app__overlay--error"),
		);
		expect(hasError).toBe(false);

		await browser.saveScreenshot(`${SHOT}/01-no-error-overlay.png`);
	});

	// ── 02: Inactive browser slot must be pointer-events:none ───────────────

	it("02 — inactive browser app slot has pointer-events:none", async () => {
		// Activate workspace so browser slot is inactive.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(400);

		const info = await getBrowserSlotInfo();
		expect(info.found).toBe(true);
		expect(info.isActive).toBe(false);
		// Inactive slot MUST be pointer-events:none — this is the CSS gate that
		// prevents children from intercepting clicks even if they override PE.
		expect(info.slotPe).toBe("none");

		await browser.saveScreenshot(`${SHOT}/02-inactive-slot-pe-none.png`);
	});

	// ── 03: CSS invariant — synthetic error overlay in inactive slot ─────────

	it("03 — synthetic error overlay in inactive browser slot has pointer-events:none", async () => {
		// Activate workspace so browser slot is inactive.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(400);

		// Inject a synthetic .browser-app__overlay--error into the inactive
		// browser slot and verify computed pointer-events is "none".
		// This directly tests the CSS rule introduced to fix the regression.
		const result = await browser.execute(() => {
			const slots = Array.from(
				document.querySelectorAll(".content-app__slot"),
			);
			const browserSlot = slots.find((s) =>
				s.querySelector(".browser-app"),
			);
			if (!browserSlot) return { found: false, pe: "n/a", isActive: false };

			const isActive = browserSlot.classList.contains(
				"content-app__slot--active",
			);

			// Create a synthetic overlay identical to the real error overlay.
			const synthetic = document.createElement("div");
			synthetic.className =
				"browser-app__overlay browser-app__overlay--error __e2e_synthetic";
			browserSlot.appendChild(synthetic);

			const pe = window.getComputedStyle(synthetic).pointerEvents;

			// Clean up immediately.
			synthetic.remove();

			return { found: true, pe, isActive };
		});

		expect(result.found).toBe(true);
		// Must be inactive for this test to be meaningful.
		expect(result.isActive).toBe(false);
		// The CSS fix: error overlay inside an INACTIVE slot must be pointer-events:none.
		// If someone accidentally re-adds `pointer-events:auto` to
		// .browser-app__overlay--error unconditionally, this test will fail.
		expect(result.pe).toBe("none");
	});

	// ── 04: CSS invariant — error overlay in ACTIVE slot gets pointer-events:auto

	it("04 — error overlay in active browser slot gets pointer-events:auto", async () => {
		// Activate the browser app.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="browser"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(500);

		// Inject a synthetic overlay into the now-active browser slot.
		const result = await browser.execute(() => {
			const slots = Array.from(
				document.querySelectorAll(".content-app__slot"),
			);
			const browserSlot = slots.find((s) =>
				s.querySelector(".browser-app"),
			);
			if (!browserSlot) return { found: false, pe: "n/a", isActive: false };

			const isActive = browserSlot.classList.contains(
				"content-app__slot--active",
			);

			const synthetic = document.createElement("div");
			synthetic.className =
				"browser-app__overlay browser-app__overlay--error __e2e_synthetic";
			browserSlot.appendChild(synthetic);

			const pe = window.getComputedStyle(synthetic).pointerEvents;
			synthetic.remove();

			return { found: true, pe, isActive };
		});

		expect(result.found).toBe(true);
		// The browser slot should now be active.
		expect(result.isActive).toBe(true);
		// When the slot IS active, the error overlay must intercept clicks so the
		// user can interact with the retry button etc.
		expect(result.pe).toBe("auto");

		await browser.saveScreenshot(`${SHOT}/04-active-slot-overlay-pe-auto.png`);
	});

	// ── 05: Switching browser→workspace leaves browser slot inactive ─────────

	it("05 — switching from browser to workspace leaves browser non-blocking", async () => {
		// Activate browser first.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="browser"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(400);

		// Then switch to workspace.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(500);

		// Verify workspace slot is active.
		const workspaceActive = await browser.execute(() => {
			const slots = Array.from(
				document.querySelectorAll(".content-app__slot"),
			);
			const wsSlot = slots.find((s) => s.querySelector(".workspace-app"));
			return wsSlot?.classList.contains("content-app__slot--active") ?? false;
		});
		expect(workspaceActive).toBe(true);

		// Verify browser slot is NOT blocking (pointer-events:none).
		const info = await getBrowserSlotInfo();
		expect(info.found).toBe(true);
		expect(info.isActive).toBe(false);
		expect(info.slotPe).toBe("none");

		// Error overlay (if it somehow exists) must also be non-blocking.
		if (info.hasErrorOverlay) {
			expect(info.errorOverlayPe).toBe("none");
		}

		await browser.saveScreenshot(`${SHOT}/05-workspace-active-browser-inactive.png`);
	});

	// ── 06: elementFromPoint in workspace area returns workspace element ──────

	it("06 — document.elementFromPoint in workspace area hits workspace, not browser overlay", async () => {
		// Activate workspace.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(500);

		// Inject a synthetic error overlay into the inactive browser slot, then
		// check that elementFromPoint at the center of the content area does NOT
		// return that overlay — it must be blocked by pointer-events:none.
		const result = await browser.execute(() => {
			const slots = Array.from(
				document.querySelectorAll(".content-app__slot"),
			);
			const browserSlot = slots.find((s) =>
				s.querySelector(".browser-app"),
			);
			if (!browserSlot) return { found: false, hitClass: "n/a" };

			// Add a synthetic overlay styled to fill the entire viewport area so
			// elementFromPoint is guaranteed to hit it if pointer-events is auto.
			const synthetic = document.createElement("div");
			synthetic.className =
				"browser-app__overlay browser-app__overlay--error __e2e_synthetic";
			// Force it to cover the entire viewport (override any inherited sizing).
			synthetic.style.cssText =
				"position:fixed;inset:0;z-index:9999;background:transparent;";
			browserSlot.appendChild(synthetic);

			// Sample point at the center of the viewport.
			const cx = window.innerWidth / 2;
			const cy = window.innerHeight / 2;
			const hit = document.elementFromPoint(cx, cy);

			synthetic.remove();

			// Return the class string of whatever element was hit.
			return {
				found: true,
				hitClass: hit ? hit.className : "(null)",
				hitTag: hit ? hit.tagName : "(null)",
			};
		});

		expect(result.found).toBe(true);

		// The synthetic overlay has class __e2e_synthetic — it must NOT be the hit.
		// If pointer-events was inadvertently auto, it would be the topmost element.
		const hitsSyntheticOverlay =
			typeof result.hitClass === "string" &&
			result.hitClass.includes("__e2e_synthetic");
		expect(hitsSyntheticOverlay).toBe(false);

		await browser.saveScreenshot(`${SHOT}/06-elementfrompoint-not-blocked.png`);
	});

	// ── 07: Browser app tab click shows browser app ─────────────────────

	it("07 — clicking browser tab activates browser slot", async () => {
		// Start from workspace.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(300);

		// Click browser tab.
		const clicked = await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="browser"]',
			) as HTMLButtonElement | null;
			if (btn) {
				btn.click();
				return true;
			}
			return false;
		});
		expect(clicked).toBe(true);
		await browser.pause(500);

		// Browser slot must now be active.
		const info = await getBrowserSlotInfo();
		expect(info.found).toBe(true);
		expect(info.isActive).toBe(true);
		expect(info.slotPe).toBe("auto");

		await browser.saveScreenshot(`${SHOT}/07-browser-tab-active.png`);
	});

	// ── 08: Browser app status is "ready" in E2E mode (no WebView2 error) ─

	it("08 — browser app has status ready (no error state) in E2E mode", async () => {
		// Activate browser app to trigger initWebview if not yet run.
		await browser.execute(() => {
			const btn = document.querySelector(
				'.app-bar-tab[data-app-id="browser"]',
			) as HTMLButtonElement | null;
			if (btn) btn.click();
		});
		await browser.pause(800);

		// No error overlay should exist — browser_wv_create returns Ok in E2E mode.
		const errorState = await browser.execute(() => {
			const errorOverlay = document.querySelector(
				".browser-app__overlay--error",
			);
			if (errorOverlay) {
				return {
					hasError: true,
					text: (errorOverlay as HTMLElement).innerText?.slice(0, 200) ?? "",
				};
			}
			return { hasError: false, text: "" };
		});

		if (errorState.hasError) {
			// Fail with a descriptive message showing the actual error text.
			throw new Error(
				`Browser app in error state (E2E mode should prevent this): ${errorState.text}`,
			);
		}
		expect(errorState.hasError).toBe(false);

		await browser.saveScreenshot(`${SHOT}/08-browser-ready-no-error.png`);
	});
});
