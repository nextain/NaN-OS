import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 15 — AI Skill Manager E2E
 *
 * Tests skill_skill_manager via natural language (no tool name in prompts).
 * Best-effort: LLM may or may not use the tool, so assertions are flexible.
 */
describe("15 — AI skill manager", () => {
	before(async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });

		// Pre-approve skill_skill_manager
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			if (!raw) return;
			const config = JSON.parse(raw);
			const allowed = config.allowedTools || [];
			if (!allowed.includes("skill_skill_manager")) {
				allowed.push("skill_skill_manager");
			}
			config.allowedTools = allowed;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});
	});

	it("should list skills when asked naturally", async () => {
		await sendMessage("지금 사용할 수 있는 스킬 목록을 알려줘");

		const text = await getLastAssistantMessage();
		// AI should mention skills in response (tool or text)
		expect(text).toMatch(/skill|스킬|도구|목록|list/i);
	});

	it("should search for skills by topic", async () => {
		await sendMessage("날씨 관련 기능이 있어?");

		const text = await getLastAssistantMessage();
		// Should mention weather skill
		expect(text).toMatch(/weather|날씨/i);
	});

	it("should handle skill toggle request", async () => {
		await sendMessage("healthcheck 스킬을 꺼줘");

		const text = await getLastAssistantMessage();
		// Best-effort: check the AI at least responded about the skill
		expect(text.length).toBeGreaterThan(0);

		// Check if tool was actually used and config was updated
		const toolUsed = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.toolSuccess,
		);

		if (toolUsed) {
			// Verify config was updated
			const isDisabled = await browser.execute(() => {
				const raw = localStorage.getItem("cafelua-config");
				if (!raw) return false;
				const config = JSON.parse(raw);
				return (config.disabledSkills || []).includes("skill_healthcheck");
			});
			expect(isDisabled).toBe(true);

			// Re-enable for cleanup
			await sendMessage("healthcheck 스킬 다시 켜줘");
			await getLastAssistantMessage();
		}
	});
});
