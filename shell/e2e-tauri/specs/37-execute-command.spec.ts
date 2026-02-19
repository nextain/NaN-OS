import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 37 — Execute Command E2E
 *
 * Verifies execute_command Gateway tool:
 * - Shell command execution via Gateway exec.bash RPC
 * - Result shown in assistant response
 *
 * Covers RPC: exec.bash
 */
describe("37 — execute command", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should execute a shell command via execute_command tool", async () => {
		await sendMessage(
			"'echo cafelua-e2e-test'를 실행해줘. execute_command 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/cafelua-e2e-test/);
	});
});
