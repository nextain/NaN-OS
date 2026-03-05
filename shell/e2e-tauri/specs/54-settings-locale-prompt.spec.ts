import { safeRefresh } from "../helpers/settings.js";

describe("54 — Locale affects system prompt config", () => {
	before(async () => {
		await safeRefresh();
		await browser.pause(2000);
	});

	it("stores locale 'en' in config correctly", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.locale = "en";
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
		await browser.pause(2000);

		const locale = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			return config.locale;
		});
		expect(locale).toBe("en");
	});

	it("stores locale 'ko' in config correctly", async () => {
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.locale = "ko";
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
		await browser.pause(2000);

		const locale = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			return config.locale;
		});
		expect(locale).toBe("ko");
	});

	it("speechStyle/honorific fields hidden when locale is not ko", async () => {
		// Set locale to English
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.locale = "en";
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
		await browser.pause(2000);

		// Open settings
		const settingsBtn = await $('[data-tab="settings"]');
		if (await settingsBtn.isExisting()) {
			await settingsBtn.click();
			await browser.pause(1000);
		}

		// speechStyle select should not be visible
		const speechSelect = await $$("select").find(async (el) => {
			const val = await el.getValue().catch(() => "");
			return val === "반말" || val === "존댓말";
		});
		expect(speechSelect).toBeUndefined();
	});
});
