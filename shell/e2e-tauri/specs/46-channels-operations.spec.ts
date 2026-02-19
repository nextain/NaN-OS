import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 46 — Channels Operations E2E
 *
 * Verifies channel operations via chat (skill_channels):
 * - logout: disconnect a channel (graceful error if none connected)
 * - login_start: start QR login (graceful error — no QR scan)
 *
 * Covers RPC: channels.logout, web.login.start, web.login.wait (error path)
 */
describe("46 — channels operations", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should handle channel logout via skill_channels logout", async () => {
		await sendMessage(
			"채널 로그아웃을 해줘. skill_channels 도구의 logout 액션을 사용해. channel은 'telegram'.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Likely no channel connected — graceful error
		expect(text).toMatch(/로그아웃|logout|채널|channel|연결|없|error|disconnect/i);
	});

	it("should handle web login start via skill_channels login_start", async () => {
		await sendMessage(
			"웹 로그인을 시작해줘. skill_channels의 login_start 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// QR code flow starts or error — both are valid
		expect(text).toMatch(/로그인|login|QR|시작|start|채널|없|error/i);
	});
});
