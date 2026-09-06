import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 39 — 브라우저 도구로 웹 페이지를 읽는다 (재조준, #567)
 *
 * 예전에는 이 스펙이 둘을 봤다 — `browser` 로 페이지 읽기, `web_search` 로 웹 검색.
 *
 * `web_search` 는 없앴다. 그것은 게이트웨이 시대의 도구이고(`docs/user-scenarios.md`
 * S55 가 `gateway 스킬: web_search · x · discord (gateway-tier)` 로 적는다), 그
 * 게이트웨이는 제품이 걷어냈다(`FR-SHELL-ISO.1`: "게이트웨이 :18789 는 spawn_gateway
 * 가 제거된 스텁"). 대체 도구가 없으므로 그 단정은 지운다.
 *
 * 페이지 읽기는 살아 있다. 다만 에이전트의 `agent_browser` 어댑터가 아니라 **셸이
 * 앱 스킬로 등록하는 `skill_browser_*`** 가 실행 경로다(`src/apps/browser/index.tsx`
 * 가 `skill_browser_navigate`·`_snapshot` 등을 선언하고 `sendAppSkills` 로 싣는다).
 * 그래서 그 이름으로 다시 겨눈다.
 */
describe("39 — web tools", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_browser_navigate"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should fetch a web page via skill_browser_navigate", async () => {
		await sendMessage(
			"https://example.com 을 skill_browser_navigate 도구로 열어서 무슨 내용인지 알려줘.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_browser_navigate 도구로 https://example.com 을 열어 내용을 알려 달라고 했다",
			"AI가 브라우저 도구로 페이지를 열었는가? 페이지 내용을 보여주거나 접근 결과를 안내하면 PASS. '도구를 찾을 수 없다/사용할 수 없다'면 FAIL",
		);
	});
});
