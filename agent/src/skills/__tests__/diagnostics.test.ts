import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createDiagnosticsSkill } from "../built-in/diagnostics.js";
import type { SkillDefinition } from "../types.js";

describe("skill_diagnostics", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, _params, respond) => {
				switch (method) {
					case "health":
						respond.ok({
							status: "healthy",
							uptime: 12345,
							version: "0.1.0",
						});
						break;
					case "status":
						respond.ok({
							status: "running",
							gateway: "openclaw-0.1.0",
							connectedClients: 2,
						});
						break;
					case "usage.status":
						respond.ok({
							totalRequests: 100,
							totalTokens: 50000,
							activeProviders: ["gemini", "xai"],
						});
						break;
					case "usage.cost":
						respond.ok({
							totalCost: 1.25,
							breakdown: [
								{ provider: "gemini", cost: 0.75 },
								{ provider: "xai", cost: 0.5 },
							],
						});
						break;
					case "logs.tail":
						respond.ok({ tailing: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"health",
					"status",
					"usage.status",
					"usage.cost",
					"logs.tail",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createDiagnosticsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_diagnostics");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(true);
	});

	it("gets health", async () => {
		const result = await skill.execute(
			{ action: "health" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.status).toBe("healthy");
		expect(parsed.uptime).toBe(12345);
	});

	it("gets status", async () => {
		const result = await skill.execute(
			{ action: "status" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.status).toBe("running");
		expect(parsed.connectedClients).toBe(2);
	});

	it("gets usage status", async () => {
		const result = await skill.execute(
			{ action: "usage_status" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.totalRequests).toBe(100);
	});

	it("gets usage cost", async () => {
		const result = await skill.execute(
			{ action: "usage_cost" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.totalCost).toBe(1.25);
		expect(parsed.breakdown).toHaveLength(2);
	});

	it("starts logs tail", async () => {
		const result = await skill.execute(
			{ action: "logs_start" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.tailing).toBe(true);
	});

	it("stops logs tail", async () => {
		const result = await skill.execute(
			{ action: "logs_stop" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "health" }, {});
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
