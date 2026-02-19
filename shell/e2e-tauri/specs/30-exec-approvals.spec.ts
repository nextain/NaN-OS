import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 30 — Exec Approvals E2E
 *
 * Verifies approval system via chat (skill_approvals):
 * - get_rules: retrieve current approval rules
 * - Auto-approve permissions flow
 *
 * Covers RPC: exec.approvals.get
 */
describe("30 — exec approvals", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should retrieve approval rules via skill_approvals get_rules", async () => {
		await sendMessage(
			"현재 실행 승인 규칙을 확인해줘. skill_approvals 도구의 get_rules 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Should mention rules/approval/permission or empty rules
		expect(text).toMatch(/규칙|rule|승인|approval|권한|permission|설정|없/i);
	});

	it("should handle auto-approve for tool invocations", async () => {
		// Send a message that triggers a tier 1+ tool — permissions auto-approved
		await sendMessage(
			"현재 시각을 확인해줘. skill_time 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});
});
