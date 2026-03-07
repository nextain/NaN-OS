import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import { executeTool } from "../tool-bridge.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

describe("tool-bridge security — path traversal", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, _params, respond) => {
				switch (method) {
					case "exec.bash":
						respond.ok({ stdout: "ok", exitCode: 0 });
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{ methods: ["exec.bash"] },
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("blocks null byte in read_file path", async () => {
		const result = await executeTool(client, "read_file", {
			path: "/etc/passwd\0.txt",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/null byte/i);
	});

	it("blocks .. traversal in read_file path", async () => {
		const result = await executeTool(client, "read_file", {
			path: "/home/user/../../../etc/shadow",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/directory traversal/i);
	});

	it("blocks .. traversal in write_file path", async () => {
		const result = await executeTool(client, "write_file", {
			path: "../../etc/crontab",
			content: "malicious",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/directory traversal/i);
	});

	it("blocks .. traversal in apply_diff path", async () => {
		const result = await executeTool(client, "apply_diff", {
			path: "../../../etc/hosts",
			search: "old",
			replace: "new",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/directory traversal/i);
	});

	it("blocks .. traversal in search_files pattern", async () => {
		const result = await executeTool(client, "search_files", {
			pattern: "../../secret",
			path: "/home/user",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/directory traversal/i);
	});

	it("blocks .. traversal in search_files path", async () => {
		const result = await executeTool(client, "search_files", {
			pattern: "*.txt",
			path: "/home/../../etc",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/directory traversal/i);
	});

	it("allows normal paths without ..", async () => {
		const result = await executeTool(client, "read_file", {
			path: "/home/user/documents/file.txt",
		});

		// Should succeed (command runs via mock gateway)
		expect(result.success).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("allows paths with .. in file/dir names (not as segment)", async () => {
		const result = await executeTool(client, "read_file", {
			path: "/home/user/my..file.txt",
		});

		// "my..file.txt" contains ".." but not as a path segment
		expect(result.success).toBe(true);
		expect(result.error).toBeUndefined();
	});
});
