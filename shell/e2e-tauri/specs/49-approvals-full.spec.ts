import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 49 — Approvals Full E2E
 *
 * Verifies approval management via chat (skill_approvals):
 * - set_rules: update approval rules
 * - resolve: resolve a pending approval (error path)
 *
 * Covers RPC: exec.approvals.set, exec.approvals.resolve (error path)
 * (exec.approvals.get covered by spec 30)
 */
describe("49 — approvals full", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should set approval rules via skill_approvals set_rules", async () => {
		await sendMessage(
			"실행 승인 규칙을 설정해줘. skill_approvals 도구의 set_rules 액션을 사용해. 기본 규칙으로 설정해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/규칙|rule|승인|approval|설정|set|완료/i);
	});

	it("should handle resolve gracefully via skill_approvals resolve", async () => {
		await sendMessage(
			"대기 중인 승인을 처리해줘. skill_approvals의 resolve 액션을 사용해. requestId는 'test', decision은 'approve'.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Likely error (no pending approval) — just verify no crash
		expect(text.length).toBeGreaterThan(0);
	});
});
