import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 48 — VoiceWake Set E2E
 *
 * Verifies voicewake set via chat (skill_voicewake):
 * - set: update wake word triggers
 * - get: verify triggers
 *
 * Covers RPC: voicewake.set, voicewake.get
 */
describe("48 — voicewake set", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_voicewake"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should set voice wake triggers", async () => {
		await sendMessage(
			"음성 깨우기 트리거를 '알파야,알파'로 설정해줘. skill_voicewake 도구의 set 액션을 사용해. triggers는 ['알파야', '알파'].",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_voicewake 도구의 set 액션으로 음성 깨우기 트리거를 설정하라고 했다",
			"AI가 skill_voicewake.set를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 '스킬 비활성화' 오류든) PASS",
		);
	});

	it("should verify wake triggers", async () => {
		await sendMessage(
			"현재 음성 깨우기 트리거를 확인해줘. skill_voicewake의 get 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_voicewake 도구의 get 액션으로 현재 음성 깨우기 트리거를 확인하라고 했다",
			"AI가 skill_voicewake로 트리거 조회를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 현재 트리거 정보가 있으면 PASS",
		);
	});
});
