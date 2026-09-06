import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

/**
 * 12 — 에이전트에 실제로 등록된 스킬
 *
 * 왜 줄었나: 이 파일은 게이트웨이 시대의 스킬 둘(`skill_healthcheck`,
 * `skill_session-logs`)을 불렀는데 제품에서 사라졌다(#567 — 게이트웨이가 걷히고
 * 에이전트가 도구를 직접 다룬다). 재시험에서 에이전트가 "현재 환경에는 …라는
 * 도구가 등록되어 있지 않습니다" 라고 정확히 답했다. 없는 능력을 재는 단정은
 * 제품에 대해 아무 말도 하지 않으므로 #567 의 규칙대로 지웠다.
 *
 * 남긴 것은 실제로 등록되는 스킬을 묻는 하나다. 지금 에이전트가 세우는 목록은
 * `time/weather/memo(...)` 에 `fs-tools(read/list[/write])` 가 붙는 형태다
 * (`compose-agent-deps.mjs` 의 `skillsLabel`). 나머지 스킬은 에이전트 쪽
 * 매니페스트 검증이 덮는다.
 */
describe("12 — 등록된 스킬", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("내장 스킬(time·weather·memo)이 등록돼 있다", async () => {
		await sendMessage(
			"skill_time, skill_memo, skill_weather 같은 도구가 있어? 다른 도구는 호출하지 말고 알고 있는 것만 답해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_time, skill_memo, skill_weather 같은 도구가 있는지 물었다",
			"AI가 skill_ 도구의 존재를 인정했는가? skill_time/memo/weather 중 하나라도 언급하면 PASS. '[오류]'나 '모르겠다'면 FAIL",
		);
	});
});
