/**
 * QA 채널의 최근 메시지를 읽는다.
 *
 *   node scripts/qa-channel-read.mjs [개수]
 *
 * 왜 필요한가: 채널은 여러 기계가 상태를 나누는 자리인데, 보내기만 하고 읽지
 * 못하면 한쪽 방향 확성기가 된다. 다른 기계가 무엇을 겪고 있는지 보고 답해야
 * 협업이 된다.
 *
 * 토큰은 credentialRef 파일에서만 읽고 출력하지 않는다. 읽기 전용이므로
 * 발신 어댑터의 정책 검사를 지나지 않지만, 그래서 **쓰기에는 쓰지 않는다** —
 * 보낼 때는 검증된 어댑터(qa-channel-send.mjs)를 지난다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADK_ROOT = resolve(process.env.NAIA_ADK_ROOT ?? resolve(HERE, "../../.."));
const CHANNEL_ID = process.env.NAIA_QA_CHANNEL_ID ?? "1545646376002789447";
const LIMIT = Math.min(Number(process.argv[2] ?? 30), 100);

const token = readFileSync(
	resolve(ADK_ROOT, "naia-settings/.keys/messenger-sessions/discord-naia-token"),
	"utf8",
).trim();

const response = await fetch(
	`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${LIMIT}`,
	{ headers: { authorization: `Bot ${token}` } },
);
if (!response.ok) {
	console.error(`읽지 못했다: HTTP ${response.status}`);
	process.exit(1);
}

const messages = await response.json();
// 최신이 먼저 오므로 뒤집어 시간 순으로 읽는다.
for (const message of messages.reverse()) {
	const when = new Date(message.timestamp).toISOString().slice(11, 16);
	const who = message.author?.username ?? "?";
	const text = (message.content ?? "").replace(/\n/g, " ⏎ ");
	console.log(`${when} ${who}: ${text}`);
}
