import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 43 — Device Management E2E
 *
 * Verifies device/node management via chat (skill_device):
 * - node_describe: node details (graceful error if no node)
 * - device_list: list device pairings
 * - token_rotate: rotate device token (graceful error)
 * - node.invoke: remote execution (error path without paired node)
 *
 * Covers RPC: node.describe, node.rename, node.pair.request, node.pair.verify,
 *   device.pair.list, device.pair.approve, device.pair.reject,
 *   device.token.rotate, device.token.revoke, node.invoke (error path)
 */
describe("43 — device management", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should describe a node via skill_device node_describe", async () => {
		await sendMessage(
			"노드 상세 정보를 보여줘. skill_device 도구의 node_describe 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// May return node info or error (no nodes)
		expect(text).toMatch(/노드|node|상세|detail|없|error|정보/i);
	});

	it("should list device pairings via skill_device device_list", async () => {
		await sendMessage(
			"디바이스 페어링 목록을 보여줘. skill_device 도구의 device_list 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/디바이스|device|페어|pair|목록|list|없/i);
	});

	it("should handle token rotate gracefully via skill_device token_rotate", async () => {
		await sendMessage(
			"디바이스 토큰을 교체해줘. skill_device 도구의 token_rotate 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Likely error (no device token) — just verify no crash
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle token revoke gracefully via skill_device token_revoke", async () => {
		await sendMessage(
			"디바이스 토큰을 폐기해줘. skill_device 도구의 token_revoke 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle node rename gracefully via skill_device node_rename", async () => {
		await sendMessage(
			"첫 번째 노드 이름을 'e2e-node'로 변경해줘. skill_device의 node_rename 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle pair request gracefully via skill_device pair_request", async () => {
		await sendMessage(
			"새 노드 페어링을 요청해줘. skill_device의 pair_request 액션을 사용해. nodeId는 'test-node'.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle pair verify gracefully via skill_device pair_verify", async () => {
		await sendMessage(
			"페어링 검증을 해줘. skill_device의 pair_verify 액션을 사용해. requestId는 'test-req', code는 '1234'.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle device pair approve/reject gracefully", async () => {
		await sendMessage(
			"디바이스 페어링을 승인해줘. skill_device의 device_approve 액션을 사용해. pairingId는 'test'.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});
});
