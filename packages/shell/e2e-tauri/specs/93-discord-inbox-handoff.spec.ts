describe("Discord inbox setup handoff through the real Tauri Shell", () => {
	it("takes an unconfigured inbox back to the Connections > Discord setup", async () => {
		await browser.waitUntil(
			() =>
				browser.execute(
					() => document.querySelector(".chat-tab[aria-label]") !== null,
				),
			{ timeout: 30_000, interval: 250 },
		);
		await browser.execute(() => {
			const button = [
				...document.querySelectorAll<HTMLButtonElement>(".chat-tab"),
			].find((candidate) =>
				/Channels|채널/.test(candidate.getAttribute("aria-label") ?? ""),
			);
			if (!button) throw new Error("Discord inbox tab not found");
			button.click();
		});

		const emptyState = await $("[data-testid='discord-inbox-empty-state']");
		await emptyState.waitForDisplayed({ timeout: 30_000 });
		expect(await emptyState.getText()).toMatch(/Connect Discord|Discord.*연결/);

		await browser.execute(() => {
			const button = [
				...document.querySelectorAll<HTMLButtonElement>("button"),
			].find((candidate) =>
				/Open Discord Connections|Discord 연결 설정 열기/.test(
					candidate.textContent ?? "",
				),
			);
			if (!button) throw new Error("Discord Connections handoff not found");
			button.click();
		});

		const connectionsTab = await $("[data-settings-tab='connections']");
		await connectionsTab.waitForDisplayed({ timeout: 30_000 });
		await browser.waitUntil(
			() =>
				browser.execute(
					() =>
						document.querySelector("[data-testid='discord-connections']") !==
						null,
				),
			{ timeout: 30_000, interval: 250 },
		);
	});
});
