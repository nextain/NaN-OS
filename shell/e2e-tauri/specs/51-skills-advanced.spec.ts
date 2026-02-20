import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 51 — Skills Advanced E2E
 *
 * Verifies advanced skill management via chat (skill_skill_manager):
 * - gateway_status: Gateway skills status
 * - install: install missing skill dependencies
 * - update_config: update skill config
 *
 * Covers RPC: skills.status, skills.bins, skills.install, skills.update
 */
describe("51 — skills advanced", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_skill_manager"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should get Gateway skills status", async () => {
		await sendMessage(
			"게이트웨이 스킬 상태를 확인해줘. skill_skill_manager 도구의 gateway_status 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_skill_manager 도구의 gateway_status 액션으로 게이트웨이 스킬 상태를 요청했다",
			"AI가 skill_skill_manager로 스킬 상태 조회를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 스킬 상태 정보가 있으면 PASS",
		);
	});

	it("should install skill dependencies", async () => {
		await sendMessage(
			"weather 스킬의 누락된 의존성을 설치해줘. skill_skill_manager의 install 액션을 사용해. skillName은 'weather'.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_skill_manager 도구의 install 액션으로 스킬 의존성 설치를 요청했다",
			"AI가 skill_skill_manager.install을 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 Gateway 오류든) PASS",
		);
	});

	it("should update skill config", async () => {
		await sendMessage(
			"weather 스킬의 설정을 업데이트해줘. skill_skill_manager의 update_config 액션을 사용해. skillName은 'weather'.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_skill_manager 도구의 update_config 액션으로 스킬 설정 업데이트를 요청했다",
			"AI가 skill_skill_manager.update_config를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 Gateway 오류든) PASS",
		);
	});
});
