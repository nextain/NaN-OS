/**
 * QA 채널에 한 줄을 보낸다.
 *
 *   node scripts/qa-channel-send.mjs "<한 줄>"
 *   node scripts/qa-channel-send.mjs --file <경로>
 *
 * 검증된 makeDiscordOutbound 어댑터를 그대로 쓴다. 직접 fetch 를 쓰면 정책
 * 검사와 첨부 제한을 우회하게 되고, 그 우회는 다음 사람에게 그대로 남는다.
 *
 * 토큰은 credentialRef 파일에서만 읽고 출력하지 않는다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADK_ROOT = resolve(process.env.NAIA_ADK_ROOT ?? resolve(HERE, "../../.."));
// 짝 naia-agent 의 검증된 어댑터를 그대로 쓴다. 자리는 환경 변수로 받는다 —
// 기계마다 배치가 다르고, 여기 경로를 박으면 한 기계에서만 도는 도구가 된다.
const ADAPTER = resolve(
	process.env.NAIA_DISCORD_ADAPTER ??
		resolve(ADK_ROOT, "projects/naia-agent/dist/main/adapters/discord-outbound.js"),
);
const { makeDiscordOutbound } = await import(pathToFileURL(ADAPTER).href);

// ADK 워크스페이스 자리. 토큰과 인스턴스 설정이 그 아래에 있다. 저장소가
// `<adk>/projects/naia-shell` 에 있으므로 두 단계 위가 기본이다.
const ADK = ADK_ROOT;
const CHANNEL_ID = process.env.NAIA_QA_CHANNEL_ID ?? "1545646376002789447";
const GUILD_ID = process.env.NAIA_QA_GUILD_ID ?? "1474553972521177242";

const token = readFileSync(
	`${ADK}/naia-settings/.keys/messenger-sessions/discord-naia-token`,
	"utf8",
).trim();

const outbound = makeDiscordOutbound({
	token,
	policy: {
		destinations: [
			{ id: "qa-channel", kind: "channel", guildId: GUILD_ID, channelId: CHANNEL_ID },
		],
	},
});

// 어댑터는 앞뒤 공백이 없는 본문만 받는다(`value.trim() === value`). 파일
// 끝 개행 하나로 거절되므로 여기서 다듬는다.
const arg = process.argv[2];
const content = (
	arg === "--file" ? readFileSync(process.argv[3], "utf8") : (arg ?? "")
).trim();
if (!content) {
	console.error('사용법: node scripts/qa-channel-send.mjs "<한 줄>" | --file <경로>');
	process.exit(2);
}
if (/[\u0000-\u001f\u007f]/.test(content)) {
	console.error(
		"본문에 개행이나 제어문자가 있다. 어댑터가 거절한다 — 채널은 한 줄로 적는 자리다.",
	);
	process.exit(2);
}
if (content.length > 2000) {
	console.error(`본문이 ${content.length}자 — 어댑터 한도는 2000자다. 나눠 보내라.`);
	process.exit(2);
}
const result = await outbound.send({ destinationId: "qa-channel", content });
console.log(`보냄 messageId=${result?.messageId ?? JSON.stringify(result)}`);
