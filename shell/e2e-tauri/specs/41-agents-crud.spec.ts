import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 41 — Agents CRUD E2E
 *
 * Verifies agent lifecycle via chat (skill_agents):
 * - create: create a test agent
 * - update: modify agent description
 * - files_set: create a file for agent
 * - delete: remove the test agent
 *
 * Covers RPC: agents.create, agents.update, agents.delete, agents.files.set
 */
describe("41 — agents CRUD", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should create a test agent via skill_agents create", async () => {
		await sendMessage(
			"새 에이전트를 만들어줘. skill_agents 도구의 create 액션으로, name은 'e2e-test-agent', description은 'E2E test agent'로 설정해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/생성|만들|create|e2e-test-agent|완료/i);
	});

	it("should update the test agent via skill_agents update", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트의 description을 'Updated by E2E'로 수정해줘. skill_agents의 update 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/수정|업데이트|update|변경|완료/i);
	});

	it("should create a file for the agent via skill_agents files_set", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트에 'test.md' 파일을 만들어줘. 내용은 '# E2E Test'. skill_agents의 files_set 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/파일|file|생성|저장|완료/i);
	});

	it("should delete the test agent via skill_agents delete", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트를 삭제해줘. skill_agents의 delete 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/삭제|제거|delete|removed|완료/i);
	});
});
