describe("Grok readiness through the real Tauri Shell", () => {
	it("reports the signed-in Grok CLI as ready from the Brain settings screen", async () => {
		const settings = await $(".app-bar-settings");
		if (!(await settings.getAttribute("class"))?.includes("--active")) {
			await settings.waitForClickable({ timeout: 30_000 });
			await settings.click();
		}
		const brainTab = await $("[data-settings-tab='brain']");
		await brainTab.waitForClickable({ timeout: 30_000 });
		await brainTab.click();

		const provider = await $("#provider-select");
		await provider.waitForDisplayed({ timeout: 30_000 });
		await browser.waitUntil(async () => (await provider.getValue()) === "grok", {
			timeout: 30_000,
			timeoutMsg: "workspace Grok configuration did not hydrate into Brain settings",
		});
		expect(await provider.getValue()).toBe("grok");

		const readiness = await $("[data-testid='grok-readiness']");
		await readiness.waitForDisplayed({ timeout: 30_000 });
		const check = await $("[data-testid='grok-readiness-check']");
		await check.waitForClickable({ timeout: 30_000 });
		await check.click();

		const status = await $("[data-testid='grok-readiness-status']");
		await browser.waitUntil(
			async () => /준비됨|Ready/.test(await status.getText()),
			{
				timeout: 30_000,
				timeoutMsg: "Grok readiness did not report the signed-in CLI as ready",
			},
		);
		expect(await status.getText()).toMatch(/준비됨|Ready/);
	});
});
