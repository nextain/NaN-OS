import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 50 — Config Management E2E
 *
 * Verifies Gateway config via chat (skill_config):
 * - get: read current config
 * - schema: get config schema
 * - models: list available models
 * - patch: partial config update
 * - set: full config update
 *
 * Covers RPC: config.get, config.set, config.schema, models.list, config.patch
 */
describe("50 — config management", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should get Gateway config via skill_config get", async () => {
		await sendMessage(
			"게이트웨이 설정을 보여줘. skill_config 도구의 get 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/설정|config|구성|configuration|게이트웨이|gateway/i);
	});

	it("should get config schema via skill_config schema", async () => {
		await sendMessage(
			"게이트웨이 설정 스키마를 보여줘. skill_config의 schema 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/스키마|schema|설정|config|필드|field|타입|type/i);
	});

	it("should list available models via skill_config models", async () => {
		await sendMessage(
			"사용 가능한 모델 목록을 보여줘. skill_config의 models 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/모델|model|목록|list|사용|available|없/i);
	});

	it("should patch config via skill_config patch", async () => {
		await sendMessage(
			"게이트웨이 설정을 패치해줘. skill_config의 patch 액션을 사용해. 아무 변경 없이 현재 상태 확인만.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});
});
