import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";

/**
 * 38 — File Operations E2E
 *
 * Verifies file Gateway tools (all go through exec.bash):
 * - write_file: create a file
 * - read_file: read file content
 * - search_files: find files
 * - apply_diff: modify file content
 *
 * Covers RPC: exec.bash (via read_file, write_file, search_files, apply_diff)
 */
describe("38 — file operations", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should write a file via write_file tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일에 'hello from e2e' 내용을 작성해줘. write_file 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/작성|생성|파일|write|created|saved/i);
	});

	it("should read a file via read_file tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일 내용을 읽어줘. read_file 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/hello from e2e/i);
	});

	it("should search files via search_files tool", async () => {
		await sendMessage(
			"/tmp 디렉토리에서 'cafelua-e2e' 이름의 파일을 검색해줘. search_files 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/cafelua-e2e-test/i);
	});

	it("should modify file via apply_diff tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일에서 'hello from e2e'를 'modified by e2e'로 변경해줘. apply_diff 도구를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/변경|수정|적용|modified|applied|diff/i);
	});
});
