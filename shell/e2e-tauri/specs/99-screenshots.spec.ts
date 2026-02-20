import { S } from "../helpers/selectors.js";
import { safeRefresh } from "../helpers/settings.js";
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

async function clickTab(selector: string): Promise<void> {
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) el.click();
	}, selector);
	await browser.pause(500);
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
		await safeRefresh();

		// Wait for app to fully load
		try {
			const chatInput = await $(S.chatInput);
			await chatInput.waitForDisplayed({ timeout: 30_000 });
		} catch {
			// App may not load fully in screenshot session — continue with best effort
		}
	});

	it("should capture main screen", async () => {
		try {
			const chatInput = await $(S.chatInput);
			await chatInput.waitForDisplayed({ timeout: 15_000 });
		} catch {
			// best effort
		}
		await browser.pause(1000);
		await screenshot("main-screen");
	});

	it("should capture chat text input", async () => {
		try {
			const chatInput = await $(S.chatInput);
			await chatInput.waitForEnabled({ timeout: 10_000 });
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
		} catch {
			// best effort
		}
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
		await clickTab(S.historyTab);
		await screenshot("history-tab");
	});

	it("should capture progress tab", async () => {
		await clickTab(".chat-tab:nth-child(3)");
		await screenshot("progress-tab");
	});

	it("should capture skills tab", async () => {
		await clickTab(S.skillsTab);
		await screenshot("skills-tab");
	});

	it("should capture skills card expanded", async () => {
		// Click first skill card to expand
		await browser.execute((cardSel: string) => {
			const card = document.querySelector(cardSel);
			const header = card?.querySelector(".skill-card-header") as HTMLElement | null;
			if (header) header.click();
		}, S.skillsCard);
		await browser.pause(300);
		await screenshot("skills-card");

		// Collapse
		await browser.execute((cardSel: string) => {
			const card = document.querySelector(cardSel);
			const header = card?.querySelector(".skill-card-header") as HTMLElement | null;
			if (header) header.click();
		}, S.skillsCard);
	});

	it("should capture settings tab overview", async () => {
		await clickTab(S.settingsTabBtn);
		await screenshot("settings-overview");
	});

	it("should capture settings theme section", async () => {
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
		await clickTab(S.chatTab);
		await screenshot("tabs-layout");
	});
});
