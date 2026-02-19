import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createApprovalsSkill } from "../built-in/approvals.js";
import type { SkillDefinition } from "../types.js";

describe("skill_approvals", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "exec.approvals.get":
						respond.ok({
							allowedTools: ["read_file", "web_search"],
							blockedPatterns: ["rm -rf *"],
						});
						break;
					case "exec.approvals.set":
						respond.ok({ updated: true });
						break;
					case "exec.approvals.resolve":
						respond.ok({
							requestId: params.requestId,
							resolved: true,
						});
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"exec.approvals.get",
					"exec.approvals.set",
					"exec.approvals.resolve",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createApprovalsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_approvals");
		expect(skill.tier).toBe(2);
		expect(skill.requiresGateway).toBe(true);
	});

	it("gets approval rules", async () => {
		const result = await skill.execute(
			{ action: "get_rules" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.allowedTools).toContain("read_file");
		expect(parsed.blockedPatterns).toContain("rm -rf *");
	});

	it("sets approval rules", async () => {
		const result = await skill.execute(
			{
				action: "set_rules",
				allowedTools: ["read_file"],
				blockedPatterns: [],
			},
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.updated).toBe(true);
	});

	it("resolves an approval", async () => {
		const result = await skill.execute(
			{ action: "resolve", requestId: "req-42", decision: "approve" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.resolved).toBe(true);
	});

	it("requires requestId for resolve", async () => {
		const result = await skill.execute(
			{ action: "resolve", decision: "approve" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("requestId is required");
	});

	it("requires decision for resolve", async () => {
		const result = await skill.execute(
			{ action: "resolve", requestId: "req-42" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("decision is required");
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "get_rules" }, {});
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
