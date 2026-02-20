import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 45 — Cron Gateway Full E2E
 *
 * Verifies Gateway cron management via chat (skill_cron gateway_* actions):
 * - gateway_status: scheduler status
 * - gateway_add: add a cron job on Gateway
 * - gateway_runs: job run history
 * - gateway_run: manual trigger
 * - gateway_remove: remove a cron job
 *
 * Covers RPC: cron.status, cron.add, cron.runs, cron.run, cron.remove
 */
describe("45 — cron gateway full", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_cron"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should check Gateway cron status", async () => {
		await sendMessage(
			"게이트웨이 크론 스케줄러 상태를 확인해줘. skill_cron 도구의 gateway_status 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구의 gateway_status 액션으로 게이트웨이 크론 스케줄러 상태를 요청했다",
			"AI가 skill_cron으로 크론 스케줄러 상태 조회를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 스케줄러/크론 상태 정보가 있으면 PASS",
		);
	});

	it("should add a Gateway cron job", async () => {
		await sendMessage(
			"게이트웨이에 'e2e-test-cron'이라는 크론잡을 추가해줘. 매시간 실행하고, task는 '날씨 확인'으로 설정해. skill_cron의 gateway_add 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구의 gateway_add 액션으로 크론잡을 추가하라고 했다",
			"AI가 skill_cron.gateway_add를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 Gateway 오류든) PASS",
		);
	});

	it("should check cron run history", async () => {
		await sendMessage(
			"게이트웨이 크론잡 실행 기록을 보여줘. skill_cron의 gateway_runs 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구의 gateway_runs 액션으로 크론잡 실행 기록을 요청했다",
			"AI가 skill_cron으로 실행 기록 조회를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 실행 기록이나 결과가 있으면 PASS",
		);
	});

	it("should manually trigger a cron job", async () => {
		await sendMessage(
			"e2e-test-cron 크론잡을 수동 실행해줘. skill_cron의 gateway_run 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구의 gateway_run 액션으로 크론잡을 수동 실행하라고 했다",
			"AI가 skill_cron으로 크론잡 수동 실행을 시도했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 실행 결과나 graceful 에러 응답이 있으면 PASS",
		);
	});

	it("should remove a Gateway cron job", async () => {
		await sendMessage(
			"e2e-test-cron 크론잡을 삭제해줘. skill_cron의 gateway_remove 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구의 gateway_remove 액션으로 크론잡을 삭제하라고 했다",
			"AI가 skill_cron.gateway_remove를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 job_id 없음 오류든) PASS",
		);
	});
});
