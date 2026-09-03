import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";

describe("Store certification native journey", () => {
	it("applies a Gemini key through Settings and exposes provider failure", async () => {
		const settings = await $(".app-bar-settings");
		await settings.waitForDisplayed({ timeout: 30_000 });
		await settings.click();

		const brainTab = await $('[data-settings-tab="brain"]');
		await brainTab.waitForDisplayed({ timeout: 30_000 });
		await brainTab.click();

		const provider = await $("#provider-select");
		await provider.waitForDisplayed({ timeout: 30_000 });
		await browser.execute(() => {
			const select = document.querySelector("#provider-select") as HTMLSelectElement;
			select.value = "gemini";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		const apiKey = await $("#apikey-input");
		await apiKey.waitForDisplayed({ timeout: 30_000 });
		await apiKey.setValue("store-invalid-key");

		const apply = await $(".settings-save-btn");
		await apply.waitForEnabled({ timeout: 30_000 });
		await apply.click();

		await browser.waitUntil(
			async () =>
				browser.execute(() => {
					const raw = localStorage.getItem("naia-config");
					const config = raw ? JSON.parse(raw) : {};
					return config.provider === "gemini";
				}),
			{
				timeout: 30_000,
				timeoutMsg: "Settings Apply did not persist Gemini as the main provider",
			},
		);

		await browser.execute(() => {
			const tab = document.querySelector(".chat-tabs .chat-tab") as HTMLElement | null;
			tab?.click();
		});

		await sendMessage("certification native probe");
		const response = await getLastAssistantMessage();
		expect(response.length).toBeGreaterThan(0);
		expect(response).not.toContain("$0.000000");
		expect(response).not.toMatch(/^\s*0 tokens\s*$/i);

		const pageText = await browser.execute(() => document.body.innerText);
		expect(pageText).not.toMatch(/\$0\.000000\s*[·•]?\s*0 tokens/i);
	});
});
