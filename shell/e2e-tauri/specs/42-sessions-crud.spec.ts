import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 42 — Sessions CRUD E2E
 *
 * Verifies session management via chat (skill_sessions):
 * - preview: session summary
 * - patch: update session label
 * - reset: clear session messages
 *
 * Covers RPC: sessions.preview, sessions.patch, sessions.reset
 * (sessions.delete and sessions.compact covered by spec 26 via UI)
 */
describe("42 — sessions CRUD", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should preview a session via skill_sessions preview", async () => {
		await sendMessage(
			"현재 세션 목록에서 세션 미리보기를 보여줘. skill_sessions 도구의 preview 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/세션|session|미리보기|preview|메시지|message|없/i);
	});

	it("should patch a session label via skill_sessions patch", async () => {
		await sendMessage(
			"현재 세션의 라벨을 'E2E Test Session'으로 변경해줘. skill_sessions의 patch 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/변경|patch|라벨|label|수정|완료|없/i);
	});

	it("should handle session reset via skill_sessions reset", async () => {
		await sendMessage(
			"가장 오래된 세션을 리셋해줘. skill_sessions의 reset 액션을 사용해. 현재 세션은 리셋하지 마.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/리셋|reset|초기화|clear|완료|없/i);
	});
});
