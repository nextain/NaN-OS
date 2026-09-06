import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 37 — 셸 명령 실행 (재조준, #567)
 *
 * 예전에는 `execute_command` 를 불렀다. 그 이름은 게이트웨이 시대의 것이고, 지금
 * 같은 능력은 에이전트의 **`shell_exec`**(`shell-tool.ts`)가 맡는다. 그 어댑터는
 * 배선돼 있으나 **전제가 있을 때에만 합성된다** — 진입점이 `NAIA_SHELL_TOOL=1`
 * 일 때만 도구 목록에 올린다. 그 전제는 하네스가 세운다
 * (`harness-provided-env.mjs` 의 `HARNESS_PROVIDED_ENV`, `wdio.conf.ts` 가 대입).
 *
 * 전제가 없으면 모델은 "그런 도구가 없다" 고 답하는데, 그 모습은 배선이 아예
 * 없는 것과 구별되지 않는다. 실제로 한 번 미배선으로 잘못 읽혔다.
 *
 * 명령은 무해한 것만 쓴다. `shell_exec` 는 격리 워크스페이스(`allowRoots`) 아래로만
 * 나가지만, 스펙이 부러 그 경계를 시험할 이유는 없다.
 */
describe("37 — 셸 명령 실행(shell_exec)", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["shell_exec"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("shell_exec 로 echo 를 실행하고 그 출력을 돌려준다", async () => {
		await sendMessage(
			"shell_exec 도구로 `echo naia-e2e-test` 를 실행하고 출력을 그대로 알려줘.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"shell_exec 도구로 `echo naia-e2e-test` 를 실행하고 출력을 알려 달라고 했다",
			"AI가 셸 명령을 실행하고 그 출력을 보여줬는가? 응답에 naia-e2e-test 가 있으면 PASS. '도구를 찾을 수 없다/사용할 수 없다'면 FAIL",
		);
	});
});
