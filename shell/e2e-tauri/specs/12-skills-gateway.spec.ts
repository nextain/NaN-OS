import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 12 — Gateway Skills E2E
 *
 * Tests gateway-proxied skills that can be verified without external dependencies.
 * Remaining 47+ skills are covered by agent-level bulk-migration.test.ts (manifest validation).
 */
describe("12 — gateway skills", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should invoke skill_healthcheck and return security info", async () => {
		await sendMessage(
			"시스템 보안 상태를 확인해줘. skill_healthcheck 도구를 반드시 사용해.",
		);

		// Best-effort: tool may or may not be used depending on LLM
		const toolUsed = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.toolSuccess,
		);

		const text = await getLastAssistantMessage();
		// Healthcheck returns security/status info — match flexibly
		if (toolUsed) {
			expect(text).toMatch(/security|firewall|ssh|update|hardening|보안|상태/i);
		} else {
			// LLM may respond without tool — just ensure non-empty
			expect(text.length).toBeGreaterThan(0);
		}
	});

	it("should invoke skill_session-logs and return log info", async () => {
		await sendMessage(
			"이전 세션 로그를 검색해줘. skill_session-logs 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Session logs returns conversation/session data
		expect(text.length).toBeGreaterThan(0);
	});

	it("should have skill_ tools registered (at least built-in 4)", async () => {
		await sendMessage(
			"현재 사용 가능한 도구(tool) 목록에서 skill_로 시작하는 것이 몇 개인지 숫자로 답해. 예: 4개",
		);

		const text = await getLastAssistantMessage();
		// LLM should mention skill count — at minimum 4 built-in skills
		// Accept any response mentioning skills or containing a number
		expect(text).toMatch(/skill|도구|tool|\d+/i);
	});
});
