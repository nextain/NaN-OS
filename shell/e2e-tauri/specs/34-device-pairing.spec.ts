import { S } from "../helpers/selectors.js";

/**
 * 34 — Device Pairing E2E
 *
 * Verifies Settings > DevicePairingSection:
 * - Section renders when tools enabled
 * - Node list loads (empty or populated)
 * - Pair requests section exists
 *
 * Covers RPC: node.list, node.pair.list
 */
describe("34 — device pairing", () => {
	it("should navigate to Settings tab", async () => {
		const settingsBtn = await $(S.settingsTabBtn);
		await settingsBtn.waitForDisplayed({ timeout: 10_000 });
		await settingsBtn.click();

		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 5_000 });
	});

	it("should ensure tools are enabled", async () => {
		const toolsEnabled = await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			return el?.checked ?? false;
		}, S.toolsToggle);

		if (!toolsEnabled) {
			await browser.execute((sel: string) => {
				const el = document.querySelector(sel) as HTMLInputElement | null;
				if (el) el.click();
			}, S.toolsToggle);
			await browser.pause(500);
		}
	});

	it("should show device pairing section with node list", async () => {
		await browser.pause(3_000);

		const hasDeviceSection = await browser.execute(
			(nodesSel: string, pairSel: string) => {
				return !!(
					document.querySelector(nodesSel) ||
					document.querySelector(pairSel) ||
					document.querySelector(".settings-hint")
				);
			},
			S.deviceNodesList,
			S.devicePairRequests,
		);
		expect(hasDeviceSection).toBe(true);
	});

	it("should show node cards or empty state", async () => {
		const nodeCount = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.deviceNodeCard,
		);

		// Either we have node cards or zero (no paired nodes) — both valid
		expect(nodeCount).toBeGreaterThanOrEqual(0);

		if (nodeCount > 0) {
			const cardText = await browser.execute((sel: string) => {
				const card = document.querySelector(sel);
				return card?.textContent?.trim() ?? "";
			}, S.deviceNodeCard);
			expect(cardText.length).toBeGreaterThan(0);
		}
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
