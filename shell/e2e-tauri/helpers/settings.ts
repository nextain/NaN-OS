import { S } from "./selectors.js";

/**
 * Fill the settings tab and save, then switch to chat tab.
 * Assumes the settings tab is already visible.
 */
export async function configureSettings(opts: {
	provider: string;
	apiKey: string;
	gatewayUrl: string;
	gatewayToken: string;
}): Promise<void> {
	// Provider
	const providerSelect = await $(S.providerSelect);
	await providerSelect.waitForDisplayed({ timeout: 10_000 });
	await providerSelect.selectByAttribute("value", opts.provider);

	// API Key
	const apiKeyInput = await $(S.apiKeyInput);
	await apiKeyInput.waitForDisplayed();
	await apiKeyInput.setValue(opts.apiKey);

	// Enable tools — use JS click (WebDriver click fails on off-screen checkboxes in WebKitGTK)
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLInputElement | null;
		if (el && !el.checked) {
			el.click();
		}
	}, S.toolsToggle);

	// Gateway URL — use JS to set value (may be off-screen in tab layout)
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			if (!el) return;
			el.scrollIntoView({ block: "center" });
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		S.gatewayUrlInput,
		opts.gatewayUrl,
	);

	// Gateway Token
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			if (!el) return;
			el.scrollIntoView({ block: "center" });
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		S.gatewayTokenInput,
		opts.gatewayToken,
	);

	// Save — use JS click
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) {
			el.scrollIntoView({ block: "center" });
			el.click();
		}
	}, S.settingsSaveBtn);

	// Switch to chat tab
	const chatTab = await $(S.chatTab);
	await chatTab.click();

	// Wait for chat input to become visible
	const chatInput = await $(S.chatInput);
	await chatInput.waitForDisplayed({ timeout: 10_000 });
}
