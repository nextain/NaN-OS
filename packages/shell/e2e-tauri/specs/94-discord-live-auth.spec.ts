import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_SETTINGS } from "../codex-e2e-environment.js";

describe("Discord live authentication through the isolated real Tauri Shell", () => {
	it("authenticates a private bot token and discovers its bounded metadata without persisting it", async () => {
		await browser.waitUntil(
			() =>
				browser.execute(
					() => document.querySelector(".app-bar-settings") !== null,
				),
			{ timeout: 30_000, interval: 250 },
		);
		await $(".app-bar-settings").click();
		const connectionsTab = await $("[data-settings-tab='connections']");
		await connectionsTab.waitForClickable({ timeout: 30_000 });
		await connectionsTab.click();

		const app = await $("[data-testid='discord-connections']");
		await app.waitForDisplayed({ timeout: 30_000 });
		await browser.waitUntil(
			async () => (await app.$$("code")).length === 1,
			{
				timeout: 45_000,
				timeoutMsg:
					"Discord authentication/discovery did not expose the bot identity in Connections",
			},
		);

		// The token is consumed by native code only. The isolated workspace must
		// neither acquire a persisted DPAPI key nor expose a password field.
		expect(await app.$$("input[type='password']")).toHaveLength(0);
		expect(
			existsSync(resolve(E2E_SETTINGS, ".keys", "NAIA_DISCORD_BOT_TOKEN.dpapi")),
		).toBe(false);
		expect(
			await browser.execute(() => {
				const storage = [...Object.values(localStorage), ...Object.values(sessionStorage)];
				return storage.some((value) =>
					/discord.{0,32}(token|bot)|(?:token|bot).{0,32}discord/i.test(value),
				);
			}),
		).toBe(false);
	});
});
