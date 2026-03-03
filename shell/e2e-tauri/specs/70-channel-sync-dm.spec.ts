import { S } from "../helpers/selectors.js";

/**
 * 70 — Channel Sync: DM Channel ID Refresh
 *
 * Tests the full channel sync flow:
 *   login → lab_auth_complete → linked-channels BFF → openDmChannel → config updated
 *
 * Requires:
 *   - LAB_KEY + LAB_USER_ID env vars (or existing lab config in the app)
 *   - Discord bot token in openclaw config (for openDmChannel via Rust)
 *   - naia.nextain.io BFF reachable
 *
 * Skips gracefully if credentials are missing.
 */

const LAB_KEY = process.env.LAB_KEY || "";
const LAB_USER_ID = process.env.LAB_USER_ID || "";

describe("70 — Channel Sync (DM Channel ID)", () => {
	if (!LAB_KEY || !LAB_USER_ID) {
		it("(skipped — no LAB_KEY / LAB_USER_ID env vars)", () => {});
		return;
	}

	it("should refresh DM channel ID after lab_auth_complete", async () => {
		// 1. Set lab credentials in config (simulating login callback)
		await browser.execute(
			(key: string, userId: string) => {
				const raw = localStorage.getItem("naia-config");
				const config = raw ? JSON.parse(raw) : {};
				config.labKey = key;
				config.labUserId = userId;
				// Clear previous DM channel ID to verify it gets discovered
				delete config.discordDmChannelId;
				delete config.discordDefaultUserId;
				localStorage.setItem("naia-config", JSON.stringify(config));
			},
			LAB_KEY,
			LAB_USER_ID,
		);

		// 2. Emit Tauri event lab_auth_complete via IPC
		//    In Tauri 2, __TAURI_INTERNALS__.invoke dispatches events through the backend.
		await browser.execute((key: string, userId: string) => {
			// @ts-expect-error — Tauri 2 internal API
			const internals = (window as any).__TAURI_INTERNALS__;
			if (internals?.invoke) {
				internals.invoke("plugin:event|emit", {
					event: "lab_auth_complete",
					payload: { labKey: key, labUserId: userId },
				});
			}
		}, LAB_KEY, LAB_USER_ID);

		// 3. Wait for channel sync to complete (up to 30s for BFF + Discord API)
		let dmChannelId = "";
		let discordUserId = "";

		await browser.waitUntil(
			async () => {
				const result = await browser.execute(() => {
					const raw = localStorage.getItem("naia-config");
					if (!raw) return { dmChannelId: "", discordUserId: "" };
					const config = JSON.parse(raw);
					return {
						dmChannelId: config.discordDmChannelId || "",
						discordUserId: config.discordDefaultUserId || "",
					};
				});
				dmChannelId = result.dmChannelId;
				discordUserId = result.discordUserId;
				return dmChannelId.length > 0;
			},
			{
				timeout: 30_000,
				interval: 1_000,
				timeoutMsg:
					"DM channel ID was not populated in config after lab_auth_complete",
			},
		);

		// 4. Verify results
		expect(dmChannelId).toBeTruthy();
		expect(dmChannelId).toMatch(/^\d{17,20}$/); // Discord snowflake format
		expect(discordUserId).toBeTruthy();
		expect(discordUserId).toMatch(/^\d{17,20}$/);

		console.log(
			`[e2e] Channel sync verified: discordUserId=${discordUserId}, dmChannelId=${dmChannelId}`,
		);
	});

	it("should have discord info in channels tab after sync", async () => {
		// Navigate to Channels tab
		await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLElement | null;
			if (el) el.click();
		}, S.channelsTabBtn);
		await browser.pause(1_000);

		// Check that Discord channel card shows the account info
		const hasDiscordCard = await browser.execute((sel: string) => {
			const cards = document.querySelectorAll(sel);
			for (const card of cards) {
				const text = card.textContent || "";
				if (/discord/i.test(text)) return true;
			}
			return false;
		}, S.channelCard);

		expect(hasDiscordCard).toBe(true);

		// Switch back to chat tab
		await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLElement | null;
			if (el) el.click();
		}, S.chatTab);
	});

	it("should persist DM channel ID across page refresh", async () => {
		// Read current DM channel ID
		const beforeRefresh = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			if (!raw) return "";
			return JSON.parse(raw).discordDmChannelId || "";
		});
		expect(beforeRefresh).toBeTruthy();

		// Refresh the page
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await browser.refresh();
				break;
			} catch {
				if (attempt === 2) throw new Error("browser.refresh() failed");
				await browser.pause(2_000);
			}
		}

		// Wait for app to load
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 15_000 });

		// Verify DM channel ID persisted
		const afterRefresh = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			if (!raw) return "";
			return JSON.parse(raw).discordDmChannelId || "";
		});
		expect(afterRefresh).toBe(beforeRefresh);
	});
});
