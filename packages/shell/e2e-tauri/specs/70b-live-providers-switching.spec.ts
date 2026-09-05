import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 70 — Live Providers Switching E2E
 *
 * This test iterates through multiple LLM providers (Claude, Grok, OpenAI, ZAI, Ollama)
 * in the UI, sends a message to each, and verifies the response.
 */
describe("70 — live providers switching", () => {
	const providers = [
		{
			id: "anthropic",
			label: "Anthropic",
			model: "claude-sonnet-4-5-20250929",
			envKey: "ANTHROPIC_API_KEY",
		},
		{ id: "xai", label: "xAI", model: "grok-4", envKey: "XAI_API_KEY" },
		{
			id: "openai",
			label: "OpenAI",
			model: "gpt-4o",
			envKey: "OPENAI_API_KEY",
		},
		{ id: "zai", label: "zAI", model: "glm-4-plus", envKey: "ZHIPU_API_KEY" },
		{ id: "ollama", label: "Ollama", model: "gpt-oss:20b", envKey: null },
	];

	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 15_000 });
	});

	for (const p of providers) {
		// 키가 없으면 건너뛴다. 예전에는 가짜 키(`"test-key"`)를 넣고 실제
		// 공급자를 불렀는데, 그 요청은 인증 오류로 돌아와 아래 단정에서
		// 실패한다. 그러면 "환경이 없다" 가 "회귀가 깨졌다" 로 보고된다 —
		// 둘은 다른 사실이고, 섞이면 배포 판단이 흐려진다.
		const missingKey = p.envKey ? !process.env[p.envKey] : false;
		const testFn = p.id === "ollama" || missingKey ? it.skip : it;
		const label = missingKey
			? `rewrite-needed: ${p.envKey} 가 없어 ${p.label} 을 검증하지 못했다`
			: `should work with ${p.label} (${p.model})`;
		testFn(label, async () => {
			// 1. Switch to Settings
			await browser.execute((sel: string) => {
				const el = document.querySelector(sel) as HTMLElement | null;
				if (el) el.click();
			}, S.settingsTabBtn);
			const settingsTab = await $(S.settingsTab);
			await settingsTab.waitForDisplayed({ timeout: 5000 });

			// 2. Select Provider
			await browser.execute((id: string) => {
				const select = document.querySelector(
					'select[id="provider-select"]',
				) as HTMLSelectElement | null;
				if (select) {
					select.value = id;
					select.dispatchEvent(new Event("change", { bubbles: true }));
				}
			}, p.id);

			// 3. Select Model
			await browser.execute((model: string) => {
				const input = document.querySelector(
					"input#model-input",
				) as HTMLInputElement | null;
				if (input) {
					const setter = Object.getOwnPropertyDescriptor(
						window.HTMLInputElement.prototype,
						"value",
					)?.set;
					setter?.call(input, model);
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
					input.dispatchEvent(new Event("blur", { bubbles: true }));
				}
			}, p.model);

			// 3.5 Set API Key & Save
			const apiKey = p.envKey ? (process.env[p.envKey] ?? "") : "ollama";
			await browser.execute((key: string) => {
				const input = document.querySelector(
					"input#apikey-input",
				) as HTMLInputElement | null;
				if (input) {
					const setter = Object.getOwnPropertyDescriptor(
						window.HTMLInputElement.prototype,
						"value",
					)?.set;
					setter?.call(input, key);
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
				}
			}, apiKey);

			await browser.execute(() => {
				const saveBtn = document.querySelector(
					".settings-save-btn",
				) as HTMLElement | null;
				if (saveBtn) saveBtn.click();
			});
			await browser.pause(500);

			// 4. Back to Chat
			await browser.execute((sel: string) => {
				const el = document.querySelector(sel) as HTMLElement | null;
				if (el) el.click();
			}, S.chatTab);
			const chatInput = await $(S.chatInput);
			await chatInput.waitForDisplayed({ timeout: 5000 });

			// 5. Send Message using helper
			const testMsg = `Testing ${p.label}. Say only 'OK'`;
			await sendMessage(testMsg);

			// 6. Wait for Assistant Response using helper
			const responseText = await getLastAssistantMessage();
			console.log(`[E2E] ${p.label} response: ${responseText}`);
			expect(responseText.length).toBeGreaterThan(0);
			expect(responseText).not.toMatch(
				/\[오류\]|API key not valid|Bad Request|not found|Error/i,
			);
		});
	}
});
