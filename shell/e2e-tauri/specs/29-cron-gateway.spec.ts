import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 29 — Cron Gateway E2E
 *
 * Verifies Gateway cron RPC via chat (skill_cron gateway_* actions):
 * - gateway_list: list cron jobs on Gateway
 *
 * Covers RPC: cron.list
 */
describe("29 — cron gateway", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should list Gateway cron jobs via skill_cron gateway_list", async () => {
		await sendMessage(
			"게이트웨이의 크론 잡 목록을 보여줘. skill_cron 도구의 gateway_list 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Response should mention cron/job/schedule or empty list
		expect(text).toMatch(/크론|cron|잡|job|예약|schedule|목록|list|없/i);
	});
});
