import { S } from "../helpers/selectors.js";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * 99 — Screenshot Capture for Manual
 *
 * Navigates through all app screens and captures screenshots
 * for the user manual on lab.cafelua.com.
 *
 * Run: pnpm run test:e2e:tauri --spec e2e-tauri/specs/99-screenshots.spec.ts
 *
 * Screenshots are saved to: project-lab.cafelua.com/public/manual/ko/
 */

const MANUAL_DIR = path.resolve(
	import.meta.dirname,
	"../../../../project-lab.cafelua.com/public/manual/ko",
);

async function screenshot(name: string): Promise<void> {
	fs.mkdirSync(MANUAL_DIR, { recursive: true });
	const filepath = path.join(MANUAL_DIR, `${name}.png`);
	await browser.saveScreenshot(filepath);
	console.log(`[screenshot] Saved: ${filepath}`);
}

const API_KEY = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY || "";

describe("99 — manual screenshots", () => {
	before(async () => {
		// Bypass onboarding
		await browser.execute((key: string) => {
			const config = {
				provider: "gemini",
				model: "gemini-2.5-flash",
				apiKey: key,
				agentName: "Alpha",
				userName: "Tester",
				vrmModel: "/avatars/Sendagaya-Shino-dark-uniform.vrm",
				persona: "Friendly AI companion",
				enableTools: true,
				locale: "ko",
				gatewayUrl: "ws://localhost:18789",
				gatewayToken: "cafelua-dev-token",
			};
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		}, API_KEY);
		await browser.refresh();
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 15_000 });
	});

	it("should capture main screen", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 15_000 });
		await browser.pause(1000);
		await screenshot("main-screen");
	});

	it("should capture chat text input", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 5_000 });
		// Type a sample message without sending
		await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLTextAreaElement;
			if (el) {
				const nativeSetter = Object.getOwnPropertyDescriptor(
					HTMLTextAreaElement.prototype,
					"value",
				)?.set;
				if (nativeSetter) nativeSetter.call(el, "서울 날씨 알려줘");
				el.dispatchEvent(new Event("input", { bubbles: true }));
			}
		}, S.chatInput);
		await browser.pause(300);
		await screenshot("chat-text");

		// Clear input
		await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLTextAreaElement;
			if (el) {
				const nativeSetter = Object.getOwnPropertyDescriptor(
					HTMLTextAreaElement.prototype,
					"value",
				)?.set;
				if (nativeSetter) nativeSetter.call(el, "");
				el.dispatchEvent(new Event("input", { bubbles: true }));
			}
		}, S.chatInput);
	});

	it("should capture history tab", async () => {
		const historyTab = await $(S.historyTab);
		await historyTab.click();
		await browser.pause(500);
		await screenshot("history-tab");
	});

	it("should capture progress tab", async () => {
		const progressTab = await $(".chat-tab:nth-child(3)"); // 3rd tab = progress
		await progressTab.click();
		await browser.pause(500);
		await screenshot("progress-tab");
	});

	it("should capture skills tab", async () => {
		const skillsTab = await $(S.skillsTab);
		await skillsTab.click();
		await browser.pause(500);
		await screenshot("skills-tab");
	});

	it("should capture skills card expanded", async () => {
		// Click first skill card to expand
		const cards = await $$(S.skillsCard);
		if (cards.length > 0) {
			const header = await cards[0].$(".skill-card-header");
			if (await header.isExisting()) {
				await header.click();
				await browser.pause(300);
			}
		}
		await screenshot("skills-card");

		// Collapse
		if (cards.length > 0) {
			const header = await cards[0].$(".skill-card-header");
			if (await header.isExisting()) {
				await header.click();
			}
		}
	});

	it("should capture settings tab overview", async () => {
		const settingsTab = await $(S.settingsTabBtn);
		await settingsTab.click();
		await browser.pause(500);
		await screenshot("settings-overview");
	});

	it("should capture settings theme section", async () => {
		// Scroll to theme section
		await browser.execute(() => {
			const el = document.querySelector(".theme-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-theme");
	});

	it("should capture settings avatar section", async () => {
		await browser.execute(() => {
			const el = document.querySelector(".avatar-section, .vrm-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-avatar");
	});

	it("should capture settings AI section", async () => {
		await browser.execute(() => {
			const el = document.querySelector(".ai-section, .provider-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-ai");
	});

	it("should capture settings voice section", async () => {
		await browser.execute(() => {
			const el = document.querySelector(".voice-section, .tts-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-voice");
	});

	it("should capture settings tools section", async () => {
		await browser.execute(() => {
			const el = document.querySelector(".tools-section, .gateway-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-tools");
	});

	it("should capture settings lab section", async () => {
		await browser.execute(() => {
			const el = document.querySelector(".lab-info-block, .lab-section");
			if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
		});
		await browser.pause(300);
		await screenshot("settings-lab-connected");
	});

	it("should capture tabs layout", async () => {
		// Go back to chat tab to show tab bar
		const chatTab = await $(S.chatTab);
		await chatTab.click();
		await browser.pause(300);

		// Crop to just the tab area
		await screenshot("tabs-layout");
	});
});
