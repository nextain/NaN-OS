describe("100 — Herdr first frame", () => {
	it("renders the native PTY surface without falling into the no-frame retry loop", async () => {
		await browser.execute(() => {
			const workspace = document.querySelector(
				'button[data-app-id="workspace"]',
			) as HTMLButtonElement | null;
			if (!workspace) throw new Error("Workspace app button is missing");
			workspace.click();
		});

		await browser.waitUntil(
			async () =>
				browser.execute(() => {
					const terminal = document.querySelector(
						".herdr-workspace__terminal-layer .xterm",
					);
					const overlay = document.querySelector(
						".herdr-workspace__state--overlay",
					);
					return Boolean(terminal) && !overlay;
				}),
			{
				timeout: 20_000,
				timeoutMsg: "Herdr PTY never delivered its first frame to xterm",
			},
		);

		// Cross the production 8-second no-frame watchdog boundary. A transient
		// first event must not be followed by the retry overlay reappearing.
		await browser.pause(8_500);
		const state = await browser.execute(() => ({
			hasTerminal: Boolean(
				document.querySelector(".herdr-workspace__terminal-layer .xterm"),
			),
			error: document
				.querySelector(".herdr-workspace__state--overlay")
				?.textContent?.trim(),
		}));
		expect(state.hasTerminal).toBe(true);
		expect(state.error).toBeUndefined();
	});
});
