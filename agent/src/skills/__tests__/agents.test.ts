import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createAgentsSkill } from "../built-in/agents.js";
import type { SkillDefinition } from "../types.js";

describe("skill_agents", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "agents.list":
						respond.ok({
							agents: [
								{ id: "alpha", name: "Alpha", model: "gemini-2.0-flash" },
								{ id: "coder", name: "Coder", model: "gemini-2.0-flash" },
							],
						});
						break;
					case "agents.create":
						respond.ok({
							id: `new-${Date.now()}`,
							name: params.name,
							created: true,
						});
						break;
					case "agents.update":
						respond.ok({ id: params.id, updated: true });
						break;
					case "agents.delete":
						respond.ok({ id: params.id, deleted: true });
						break;
					case "agents.files.list":
						respond.ok({
							files: [
								{ path: "system.md", size: 128 },
								{ path: "config.yaml", size: 64 },
							],
						});
						break;
					case "agents.files.get":
						respond.ok({
							path: params.path,
							content: "# Agent instructions\nBe helpful.",
						});
						break;
					case "agents.files.set":
						respond.ok({ path: params.path, written: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"agents.list",
					"agents.create",
					"agents.update",
					"agents.delete",
					"agents.files.list",
					"agents.files.get",
					"agents.files.set",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createAgentsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_agents");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
	});

	it("lists agents", async () => {
		const result = await skill.execute(
			{ action: "list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.agents).toHaveLength(2);
		expect(parsed.agents[0].name).toBe("Alpha");
	});

	it("creates an agent", async () => {
		const result = await skill.execute(
			{ action: "create", name: "Writer", description: "Creative writer" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.created).toBe(true);
		expect(parsed.name).toBe("Writer");
	});

	it("requires name for create", async () => {
		const result = await skill.execute(
			{ action: "create" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("name is required");
	});

	it("updates an agent", async () => {
		const result = await skill.execute(
			{ action: "update", id: "alpha", name: "Alpha v2" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.updated).toBe(true);
	});

	it("requires id for update", async () => {
		const result = await skill.execute(
			{ action: "update", name: "x" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("id is required");
	});

	it("deletes an agent", async () => {
		const result = await skill.execute(
			{ action: "delete", id: "coder" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.deleted).toBe(true);
	});

	it("requires id for delete", async () => {
		const result = await skill.execute(
			{ action: "delete" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("id is required");
	});

	// --- File operations ---

	it("lists agent files", async () => {
		const result = await skill.execute(
			{ action: "files_list", agentId: "alpha" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.files).toHaveLength(2);
		expect(parsed.files[0].path).toBe("system.md");
	});

	it("requires agentId for files_list", async () => {
		const result = await skill.execute(
			{ action: "files_list" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("agentId is required");
	});

	it("gets agent file content", async () => {
		const result = await skill.execute(
			{ action: "files_get", agentId: "alpha", path: "system.md" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.content).toContain("Agent instructions");
	});

	it("requires agentId for files_get", async () => {
		const result = await skill.execute(
			{ action: "files_get", path: "system.md" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("agentId is required");
	});

	it("requires path for files_get", async () => {
		const result = await skill.execute(
			{ action: "files_get", agentId: "alpha" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("path is required");
	});

	it("sets agent file content", async () => {
		const result = await skill.execute(
			{
				action: "files_set",
				agentId: "alpha",
				path: "system.md",
				content: "# Updated\nNew content.",
			},
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.written).toBe(true);
	});

	it("requires agentId for files_set", async () => {
		const result = await skill.execute(
			{ action: "files_set", path: "x.md", content: "y" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("agentId is required");
	});

	it("requires path for files_set", async () => {
		const result = await skill.execute(
			{ action: "files_set", agentId: "alpha", content: "y" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("path is required");
	});

	it("requires content for files_set", async () => {
		const result = await skill.execute(
			{ action: "files_set", agentId: "alpha", path: "x.md" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("content is required");
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "list" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway not connected");
	});

	it("returns error for unknown action", async () => {
		const result = await skill.execute(
			{ action: "invalid" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown action");
	});
});
