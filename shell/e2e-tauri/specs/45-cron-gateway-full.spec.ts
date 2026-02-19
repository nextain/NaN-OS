import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

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
 * (cron.list covered by spec 29)
 */
describe("45 — cron gateway full", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should check Gateway cron status via skill_cron gateway_status", async () => {
		await sendMessage(
			"게이트웨이 크론 스케줄러 상태를 확인해줘. skill_cron 도구의 gateway_status 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/스케줄|schedule|상태|status|크론|cron|실행/i);
	});

	it("should add a Gateway cron job via skill_cron gateway_add", async () => {
		await sendMessage(
			"게이트웨이에 'e2e-test-cron'이라는 크론잡을 추가해줘. 매시간 실행. skill_cron의 gateway_add 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/추가|add|생성|create|크론|cron|완료/i);
	});

	it("should check cron run history via skill_cron gateway_runs", async () => {
		await sendMessage(
			"게이트웨이 크론잡 실행 기록을 보여줘. skill_cron의 gateway_runs 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/실행|run|기록|history|없/i);
	});

	it("should manually trigger a cron job via skill_cron gateway_run", async () => {
		await sendMessage(
			"e2e-test-cron 크론잡을 수동 실행해줘. skill_cron의 gateway_run 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should remove a Gateway cron job via skill_cron gateway_remove", async () => {
		await sendMessage(
			"e2e-test-cron 크론잡을 삭제해줘. skill_cron의 gateway_remove 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/삭제|remove|제거|delete|완료|없/i);
	});
});
