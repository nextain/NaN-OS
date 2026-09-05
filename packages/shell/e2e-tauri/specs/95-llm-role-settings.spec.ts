import { readFileSync } from "node:fs";
import { clickElement } from "../helpers/click.js";
import { resolve } from "node:path";

const adkPath = process.env.NAIA_E2E_ADK_PATH;

function readPersistedConfig(): Record<string, unknown> {
	if (!adkPath) throw new Error("NAIA_E2E_ADK_PATH is required for role settings E2E");
	return JSON.parse(
		readFileSync(resolve(adkPath, "naia-settings/config.json"), "utf8"),
	) as Record<string, unknown>;
}

async function setSelect(selector: string, value: string): Promise<void> {
	await browser.execute((target: string, next: string) => {
		const select = document.querySelector<HTMLSelectElement>(target);
		if (!select) throw new Error(`Missing select ${target}`);
		const setter = Object.getOwnPropertyDescriptor(
			window.HTMLSelectElement.prototype,
			"value",
		)?.set;
		setter?.call(select, next);
		select.dispatchEvent(new Event("change", { bubbles: true }));
	}, selector, value);
}

async function setInput(selector: string, value: string): Promise<void> {
	await browser.execute((target: string, next: string) => {
		const input = document.querySelector<HTMLInputElement>(target);
		if (!input) throw new Error(`Missing input ${target}`);
		const setter = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(input, next);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
		input.dispatchEvent(new Event("blur", { bubbles: true }));
	}, selector, value);
}

describe("LLM role settings through the real Tauri Shell", () => {
	it("stores separate sub settings, inherits memory from main, and restores both after a WebView restart", async () => {
		if (!adkPath) throw new Error("NAIA_E2E_ADK_PATH is required for role settings E2E");
		const settings = await $(".app-bar-settings");
		await clickElement(".app-bar-settings", 30_000);
		const brainTab = await $("[data-settings-tab='brain']");
		await clickElement("[data-settings-tab='brain']", 30_000);

		const subMode = await $("[data-testid='sub-llm-mode']");
		const memoryMode = await $("[data-testid='memory-llm-mode']");
		expect(await subMode.getValue()).toBe("inherit:main");
		expect(await memoryMode.getValue()).toBe("inherit:sub");

		await setSelect("[data-testid='sub-llm-mode']", "explicit");
		const subProvider = await $("[data-testid='sub-llm-provider']");
		// 이 단언은 2026-07-22 에 쓰였고 그때 codex 의 supportedRoles 는 main
		// 하나였다. 2026-07-29 의 역할 라우팅(880c69fd)이 expert·main·sub 셋으로
		// 넓혔으므로 이제 보조 자리에도 codex 가 있는 것이 맞다. 40일 동안
		// 아무도 못 본 이유는 이 스펙이 CI 에서 한 번도 돌지 않았기 때문이다(#550).
		expect(await subProvider.$("option[value='codex']").isExisting()).toBe(true);
		await setSelect("[data-testid='sub-llm-provider']", "gemini");
		await setInput("[data-testid='sub-llm-model']", "gemini-3.1-flash-lite");
		await setSelect("[data-testid='memory-llm-mode']", "inherit:main");

		await browser.waitUntil(() => {
			const roles = readPersistedConfig().llmRoles as Record<string, unknown>;
			const sub = roles?.sub as Record<string, unknown> | undefined;
			const memory = roles?.memory as Record<string, unknown> | undefined;
			return (
				sub?.provider === "gemini" &&
				sub?.model === "gemini-3.1-flash-lite" &&
				memory?.inherit === "main"
			);
		}, { timeout: 30_000, timeoutMsg: "role settings were not written to the isolated ADK config" });

		await browser.refresh();
		const restartedSettings = await $(".app-bar-settings");
		await clickElement(".app-bar-settings", 30_000);
		const restartedBrainTab = await $("[data-settings-tab='brain']");
		await clickElement("[data-settings-tab='brain']", 30_000);
		await browser.waitUntil(
			async () =>
				(await (await $("[data-testid='sub-llm-mode']")).getValue()) ===
					"explicit" &&
				(await (await $("[data-testid='memory-llm-mode']")).getValue()) ===
					"inherit:main",
			{
				timeout: 30_000,
				timeoutMsg: "persisted LLM role settings did not hydrate after WebView restart",
			},
		);
		expect(await (await $("[data-testid='sub-llm-mode']")).getValue()).toBe("explicit");
		expect(await (await $("[data-testid='sub-llm-provider']")).getValue()).toBe("gemini");
		expect(await (await $("[data-testid='sub-llm-model']")).getValue()).toBe(
			"gemini-3.1-flash-lite",
		);
		expect(await (await $("[data-testid='memory-llm-mode']")).getValue()).toBe(
			"inherit:main",
		);
	});
});
