import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sendMessage } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 42 — 세션 대화록이 실제로 남는다 (재조준, #567)
 *
 * 예전에는 대화로 `skill_sessions` 를 시켜 preview/patch/reset 을 보았다. 그 도구는
 * 없어졌다 — 셸이 스스로 "new-core 는 standalone tool 미지원(chat 도구루프로만 실행)"
 * 이라며 그 경로를 막는다(`chat-service.ts`). 능력이 죽은 것이 아니라 **실행 경로가
 * 바뀌었다.** 세션은 이제 에이전트의 `ConversationLogPort` 가 `<ADK>/conversations/
 * <sessionId>.jsonl` 에 한 줄씩 덧붙여 남긴다(`conversation-log-store.ts`,
 * append-only JSONL, 1줄 = 1메시지).
 *
 * 그래서 여기서는 도구 이름을 부르지 않고 **그 자리에 무엇이 남는지**를 잰다.
 * 대화가 기록되지 않으면 세션이라는 개념이 성립하지 않으므로, 이것이 preview·patch·
 * reset 이 딛고 서 있던 바닥이다.
 */
const adkPath = process.env.NAIA_E2E_ADK_PATH;

function transcriptFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
}

function readTurns(path: string): { role: string; content: string }[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as { role: string; content: string });
}

/** 지금 가장 최근에 쓰인 대화록. 세션 파일명은 클라이언트가 정하므로 박아 두지 않는다. */
function newestTranscript(dir: string): string | undefined {
	const files = transcriptFiles(dir);
	if (files.length === 0) return undefined;
	return files
		.map((name) => resolve(dir, name))
		.sort(
			(a, b) => readFileSync(b, "utf8").length - readFileSync(a, "utf8").length,
		)[0];
}

describe("42 — 세션 대화록(ConversationLogPort)", () => {
	let dispose: (() => void) | undefined;
	let conversationsDir: string;

	before(async () => {
		if (!adkPath) throw new Error("NAIA_E2E_ADK_PATH is required");
		conversationsDir = resolve(adkPath, "conversations");
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("대화 한 턴이 세션 대화록에 남는다", async () => {
		const marker = `세션 기록 확인 ${Date.now()}`;
		await sendMessage(marker);

		await browser.waitUntil(
			async () => {
				const path = newestTranscript(conversationsDir);
				return (
					path !== undefined && readFileSync(path, "utf8").includes(marker)
				);
			},
			{
				timeout: 30_000,
				timeoutMsg: `대화록에 이번 턴이 남지 않았다 (${conversationsDir})`,
			},
		);

		const path = newestTranscript(conversationsDir) as string;
		const turns = readTurns(path);
		// 한 턴은 두 줄이다 — 사용자가 말한 것과 나이아가 답한 것.
		expect(
			turns.some((t) => t.role === "user" && t.content.includes(marker)),
		).toBe(true);
		expect(turns.some((t) => t.role === "assistant")).toBe(true);
	});

	it("다음 턴이 같은 세션 파일에 이어 붙는다 — 덮어쓰지 않는다", async () => {
		const path = newestTranscript(conversationsDir) as string;
		const before = readTurns(path).length;
		const marker = `이어 붙는지 확인 ${Date.now()}`;

		await sendMessage(marker);

		await browser.waitUntil(
			async () => readFileSync(path, "utf8").includes(marker),
			{
				timeout: 30_000,
				timeoutMsg: "다음 턴이 같은 대화록에 이어 붙지 않았다",
			},
		);

		const after = readTurns(path);
		// append-only 계약: 앞의 줄이 그대로 있고 뒤로만 늘어난다.
		expect(after.length).toBeGreaterThan(before);
		expect(after.some((t) => t.content.includes(marker))).toBe(true);
	});
});
