/**
 * 알림 webhook 스텁 — `notify` 도구가 정말 발신했는지 재기 위한 받는 쪽.
 *
 * 왜 필요한가. 에이전트의 `notify` 도구는 **webhook 주소가 있을 때에만** 합성된다
 * (진입점이 `skills.json` 의 notify 또는 `NAIA_NOTIFY_*_WEBHOOK` 을 본다). 주소가
 * 없으면 도구가 아예 목록에 오르지 않아, 모델은 "그런 도구가 없다" 고 답한다 —
 * 배선이 없어서가 아니라 전제가 없어서다. 그래서 하네스가 받는 쪽을 세우고 그
 * 주소를 환경에 넣어 준다.
 *
 * 받은 요청은 **파일에 적는다.** 서버는 러너(launcher)에 살고 스펙은 워커에서
 * 도므로 메모리를 나눠 볼 수 없다. 비용 원장(`NAIA_E2E_COST_LEDGER`)이 쓰는 것과
 * 같은 방식이다 — 한 줄에 요청 하나(JSONL).
 *
 * 밖으로 나가지 않는다. 127.0.0.1 의 무작위 포트에만 묶고, 실행이 끝나면 닫는다.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";

/** 이 스텁이 받은 것을 적어 두는 파일의 환경 변수 이름. */
export const NOTIFY_LOG_ENV = "NAIA_E2E_NOTIFY_LOG";

/** 진입점이 보는 webhook 주소 환경 변수 — target 하나에 하나씩. */
export const NOTIFY_WEBHOOK_ENV = Object.freeze({
	slack: "NAIA_NOTIFY_SLACK_WEBHOOK",
	discord: "NAIA_NOTIFY_DISCORD_WEBHOOK",
});

/**
 * 스텁을 띄운다. `{ port, close }` 를 돌려준다.
 *
 * `logPath` 에 받은 요청을 한 줄씩 덧붙인다 — `{ target, body, at }`.
 * target 은 경로에서 읽는다(`/slack`, `/discord`).
 */
export async function startNotifyWebhookStub(logPath) {
	mkdirSync(dirname(logPath), { recursive: true });
	const server = createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			let body = raw;
			try {
				body = JSON.parse(raw);
			} catch {
				/* 본문이 JSON 이 아니면 원문 그대로 적는다 */
			}
			try {
				appendFileSync(
					logPath,
					`${JSON.stringify({
						target: String(req.url ?? "").replace(/^\//, ""),
						body,
						at: new Date().toISOString(),
					})}\n`,
				);
			} catch {
				/* 기록 실패가 스텁을 죽이지 않는다 */
			}
			res.writeHead(200, { "content-type": "application/json" });
			res.end('{"ok":true}');
		});
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	return {
		port,
		urlFor: (target) => `http://127.0.0.1:${port}/${target}`,
		close: () =>
			new Promise((resolve) => {
				server.close(() => resolve());
			}),
	};
}
