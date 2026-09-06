import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

// requires: capability:cron (naia-agent#128)
//
// 왜 선언하는가: `skill_cron` 은 **죽은 능력이 아니라 아직 안 이어진 능력**이다.
// 지금 에이전트는 "현재 사용 가능한 도구 목록에 skill_cron 이 포함되어 있지
// 않습니다" 로 답한다 — cron 어댑터가 아직 배선되지 않았고 naia-agent#128 이 그
// 몫을 들고 있다. 그래서 지우지 않는다. 배선되는 날 이 선언 한 줄을 지우면 이
// 스펙이 그대로 다시 돈다.
//
// 러너는 이 줄을 읽어 실행에서 빼되 기록과 화면에 이유와 함께 남긴다 — 요구
// 환경이 없어 빼는 것과 같은 방식이다. 조용히 건너뛰면 재지 않은 것이 통과처럼
// 보이고, 실패로 두면 매 실행마다 제품 결함이 아닌 것을 사람이 들여다본다.

describe("20 — cron basic (one-shot)", () => {
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

	it("should create a cron job via natural language", async () => {
		await sendMessage(
			"5초 후에 테스트 알림 보내줘. skill_cron 도구를 사용해서 작업을 예약해. task는 '테스트 알림'으로 설정해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 5초 후 테스트 알림을 예약하라고 했다",
			"AI가 skill_cron 도구를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(성공이든 Gateway 오류든) PASS",
		);
	});

	it("should list cron jobs", async () => {
		await sendMessage(
			"예약된 작업 목록을 보여줘. skill_cron 도구의 list 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 예약된 작업 목록을 보여달라고 했다",
			"AI가 skill_cron.list를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(결과 있든 비어있든) PASS",
		);
	});

	it("should remove a cron job", async () => {
		await sendMessage(
			"아까 만든 테스트 알림을 취소해줘. skill_cron의 remove 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 이전에 만든 테스트 알림을 취소하라고 했다",
			"AI가 skill_cron.remove를 호출 시도했는가? 도구 자체를 인식하지 못하면 FAIL. 도구를 호출했으면(삭제 성공, 작업 없음 오류, Gateway 오류 등 무관) PASS",
		);
	});
});
