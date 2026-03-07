import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoSkill } from "../built-in/memo.js";

let tmpDir: string;
let skill: ReturnType<typeof createMemoSkill>;

beforeAll(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-test-"));
	skill = createMemoSkill(tmpDir);
});

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("skill_memo", () => {
	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_memo");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("saves and reads a memo", async () => {
		const save = await skill.execute(
			{ action: "save", key: "test1", content: "hello world" },
			{},
		);
		expect(save.success).toBe(true);

		const read = await skill.execute({ action: "read", key: "test1" }, {});
		expect(read.success).toBe(true);
		expect(read.output).toBe("hello world");
	});

	it("lists memos", async () => {
		await skill.execute({ action: "save", key: "list-a", content: "aaa" }, {});
		await skill.execute({ action: "save", key: "list-b", content: "bbb" }, {});
		const list = await skill.execute({ action: "list" }, {});
		expect(list.success).toBe(true);
		const keys = JSON.parse(list.output);
		expect(keys).toContain("list-a");
		expect(keys).toContain("list-b");
	});

	it("deletes a memo", async () => {
		await skill.execute({ action: "save", key: "del-me", content: "temp" }, {});
		const del = await skill.execute({ action: "delete", key: "del-me" }, {});
		expect(del.success).toBe(true);

		const read = await skill.execute({ action: "read", key: "del-me" }, {});
		expect(read.success).toBe(false);
		expect(read.error).toContain("not found");
	});

	it("sanitizes key (no path traversal)", async () => {
		const save = await skill.execute(
			{ action: "save", key: "../evil", content: "hacked" },
			{},
		);
		expect(save.success).toBe(true);

		// File should be saved with sanitized name, not path-traversal
		const files = fs.readdirSync(tmpDir);
		expect(files.some((f) => f.includes(".."))).toBe(false);
	});

	it("returns error for unknown action", async () => {
		const result = await skill.execute({ action: "unknown" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown action");
	});

	it("returns error when reading nonexistent memo", async () => {
		const result = await skill.execute(
			{ action: "read", key: "nonexistent" },
			{},
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("returns error when key is missing for save", async () => {
		const result = await skill.execute(
			{ action: "save", content: "no key" },
			{},
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("required");
	});
});
