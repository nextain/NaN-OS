import { existsSync, readFileSync } from "node:fs";
import { sendMessageWithoutWaiting } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 17 — 알림 발신 (재조준, #567)
 *
 * 예전에는 셋을 봤다. `allowedTools` 설정 배열에 `skill_notify_slack`/`_discord`
 * 라는 이름이 들어 있는지, 그리고 webhook 이 없을 때 AI 가 설명하는지.
 *
 * 첫 단정은 지웠다. 그 배열은 에이전트가 읽지 않는다 — 화면 쪽 설정일 뿐이라
 * 이름이 거기 있든 없든 도구가 붙는지와 무관하다. 이름 검사로는 알림이 실제로
 * 나갔는지 알 수 없다.
 *
 * 지금 그 능력은 에이전트의 **`notify`** 하나가 맡는다(`notify-skills.ts`,
 * `{target, message}`). 어댑터는 배선돼 있고 **webhook 주소가 있을 때에만**
 * 합성된다. 그래서 하네스가 받는 쪽(로컬 스텁)을 세우고 그 주소를
 * `NAIA_NOTIFY_*_WEBHOOK` 으로 넣어 준다(`harness-provided-env.mjs` 정본,
 * `notify-webhook-stub.mjs`). 스텁은 받은 요청을 한 줄씩 파일에 적고, 이 스펙은
 * **그 파일**을 읽는다 — 답변 문구가 아니라 정말 나갔는지를 잰다.
 *
 * 보내고 나서 화면의 최종 답을 기다리지 않는다. 증거가 받는 쪽에 있기 때문이고,
 * 도구를 부른 뒤 답이 늦는 모델(#561)에서 그 기다림이 "알림이 안 갔다" 라는
 * 엉뚱한 실패로 보이기 때문이다.
 */
const notifyLog = process.env.NAIA_E2E_NOTIFY_LOG;

function received(): { target: string; body: unknown }[] {
	if (!notifyLog || !existsSync(notifyLog)) return [];
	return readFileSync(notifyLog, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as { target: string; body: unknown });
}

describe("17 — 알림 발신(notify)", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		if (!notifyLog) {
			throw new Error(
				"NAIA_E2E_NOTIFY_LOG 이 없다 — 하네스가 webhook 스텁을 세우지 않았다",
			);
		}
		await enableToolsForSpec(["notify"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("notify 로 보낸 알림이 받는 쪽에 도착한다", async () => {
		const before = received().length;
		const marker = `e2e-notify-${Date.now()}`;

		await sendMessageWithoutWaiting(
			`notify 도구로 slack 에 "${marker}" 라는 메시지를 보내줘.`,
		);

		await browser.waitUntil(async () => received().length > before, {
			timeout: 60_000,
			timeoutMsg: `webhook 스텁이 아무것도 받지 못했다 (${notifyLog})`,
		});

		const sent = received().slice(before);
		// 받는 쪽이 본 것이 근거다 — 답변에 "보냈다" 고 적혀 있는 것으로는
		// 발신을 증명하지 못한다.
		expect(
			sent.some((entry) => JSON.stringify(entry.body).includes(marker)),
		).toBe(true);
	});

	it("보낸 알림이 요청한 채널로 간다", async () => {
		const before = received().length;
		const marker = `e2e-notify-discord-${Date.now()}`;

		await sendMessageWithoutWaiting(
			`notify 도구로 discord 에 "${marker}" 라는 메시지를 보내줘.`,
		);

		await browser.waitUntil(async () => received().length > before, {
			timeout: 60_000,
			timeoutMsg: "discord 대상 알림이 스텁에 도착하지 않았다",
		});

		const sent = received().slice(before);
		const match = sent.find((entry) =>
			JSON.stringify(entry.body).includes(marker),
		);
		expect(match, "그 문구를 담은 요청이 없다").toBeTruthy();
		// 스텁은 경로로 target 을 적는다. 채널을 가리지 않으면 "알림이 갔다" 가
		// 아무 뜻이 없다.
		expect(match?.target).toBe("discord");
	});
});
