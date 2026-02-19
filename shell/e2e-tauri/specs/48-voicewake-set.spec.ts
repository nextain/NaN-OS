import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 48 — VoiceWake Set E2E
 *
 * Verifies voicewake set via chat (skill_voicewake):
 * - set: update wake word triggers
 *
 * Covers RPC: voicewake.set
 * (voicewake.get covered by spec 25 via Settings UI)
 */
describe("48 — voicewake set", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should set voice wake triggers via skill_voicewake set", async () => {
		await sendMessage(
			"음성 깨우기 트리거를 '알파야,알파'로 설정해줘. skill_voicewake 도구의 set 액션을 사용해. triggers는 ['알파야', '알파'].",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/트리거|trigger|설정|set|음성|wake|완료|알파/i);
	});

	it("should verify wake triggers via skill_voicewake get", async () => {
		await sendMessage(
			"현재 음성 깨우기 트리거를 확인해줘. skill_voicewake의 get 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/트리거|trigger|알파|음성|wake/i);
	});
});
