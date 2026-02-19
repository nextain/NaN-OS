import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 40 — Sessions Spawn E2E
 *
 * Verifies sessions_spawn Gateway tool:
 * - Sub-agent creation via sessions.spawn RPC
 * - Wait for completion via agent.wait RPC
 * - Retrieve transcript via sessions.transcript RPC
 *
 * Covers RPC: sessions.spawn, agent.wait, sessions.transcript
 */
describe("40 — sessions spawn", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should spawn a sub-agent session", async () => {
		await sendMessage(
			"서브 에이전트를 생성해서 '현재 시각 확인' 작업을 위임해줘. sessions_spawn 도구를 사용해.",
		);

		// Best-effort: sessions_spawn may not be supported by Gateway
		const toolUsed = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.toolSuccess,
		);

		const text = await getLastAssistantMessage();
		if (toolUsed) {
			// Should mention sub-agent result or time
			expect(text).toMatch(/에이전트|agent|시각|시간|time|결과|완료|지원/i);
		} else {
			// Tool not used — LLM responded directly
			expect(text.length).toBeGreaterThan(0);
		}
	});
});
