import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 44 — Diagnostics Full E2E
 *
 * Verifies diagnostics via chat (skill_diagnostics):
 * - health: Gateway health check
 * - usage_status: usage statistics
 * - usage_cost: cost breakdown
 *
 * Covers RPC: health, usage.status, usage.cost
 * (status, logs.tail covered by spec 31 via DiagnosticsTab UI)
 */
describe("44 — diagnostics full", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should check Gateway health via skill_diagnostics health", async () => {
		await sendMessage(
			"게이트웨이 health 체크해줘. skill_diagnostics 도구의 health 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/health|정상|healthy|상태|status|연결|ok/i);
	});

	it("should check usage status via skill_diagnostics usage_status", async () => {
		await sendMessage(
			"사용량 통계를 보여줘. skill_diagnostics의 usage_status 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/사용|usage|통계|status|요청|request|없/i);
	});

	it("should check usage cost via skill_diagnostics usage_cost", async () => {
		await sendMessage(
			"비용 정보를 보여줘. skill_diagnostics의 usage_cost 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/비용|cost|요금|charge|사용량|없/i);
	});
});
