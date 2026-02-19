import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 51 — Skills Advanced E2E
 *
 * Verifies advanced skill management via chat (skill_skill_manager):
 * - gateway_status: Gateway skills status (calls skills.status)
 * - install: install missing skill dependencies (calls skills.install)
 * - update_config: update skill config (calls skills.update)
 *
 * Covers RPC: skills.status (via gateway_status), skills.bins, skills.install, skills.update
 */
describe("51 — skills advanced", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should get Gateway skills status via skill_skill_manager gateway_status", async () => {
		await sendMessage(
			"게이트웨이 스킬 상태를 확인해줘. skill_skill_manager 도구의 gateway_status 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/스킬|skill|상태|status|게이트웨이|gateway|eligible/i);
	});

	it("should install skill dependencies via skill_skill_manager install", async () => {
		await sendMessage(
			"누락된 스킬 의존성을 설치해줘. skill_skill_manager의 install 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/설치|install|의존성|dependency|스킬|skill|완료|없/i);
	});

	it("should update skill config via skill_skill_manager update_config", async () => {
		await sendMessage(
			"스킬 설정을 업데이트해줘. skill_skill_manager의 update_config 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/업데이트|update|설정|config|스킬|skill|완료/i);
	});
});
