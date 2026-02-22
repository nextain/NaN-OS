import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	getGatewayStatus,
	getHealth,
	getUsageCost,
	getUsageStatus,
	pollLogsTail,
} from "../diagnostics-proxy.js";
import { createMockGateway, type MockGateway } from "./mock-gateway.js";

describe("diagnostics-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "health":
						respond.ok({
							status: "ok",
							uptime: 86400,
							version: "1.2.3",
						});
						break;
					case "usage.status":
						respond.ok({
							totalRequests: 150,
							totalTokens: 50000,
							activeProviders: ["gemini", "xai"],
						});
						break;
					case "usage.cost":
						respond.ok({
							totalCost: 1.23,
							breakdown: [
								{ provider: "gemini", cost: 0.8 },
								{ provider: "xai", cost: 0.43 },
							],
						});
						break;
					case "status":
						respond.ok({
							status: "running",
							gateway: "openclaw",
							connectedClients: 3,
						});
						break;
					case "logs.tail":
						respond.ok({
							file: "/tmp/openclaw/test.log",
							cursor: params.cursor ?? 1000,
							size: 1000,
							lines: params.cursor ? [] : ['{"0":"test log","_meta":{"logLevelName":"INFO"},"time":"2026-01-01T00:00:00Z"}'],
						});
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"health",
					"usage.status",
					"usage.cost",
					"status",
					"logs.tail",
				],
			},
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

	describe("getHealth", () => {
		it("returns health status", async () => {
			const result = await getHealth(client);

			expect(result.status).toBe("ok");
			expect(result.uptime).toBe(86400);
			expect(result.version).toBe("1.2.3");
		});
	});

	describe("getUsageStatus", () => {
		it("returns usage statistics", async () => {
			const result = await getUsageStatus(client);

			expect(result.totalRequests).toBe(150);
			expect(result.totalTokens).toBe(50000);
		});
	});

	describe("getUsageCost", () => {
		it("returns cost breakdown", async () => {
			const result = await getUsageCost(client);

			expect(result.totalCost).toBe(1.23);
			expect(result.breakdown).toHaveLength(2);
		});
	});

	describe("getGatewayStatus", () => {
		it("returns gateway status", async () => {
			const result = await getGatewayStatus(client);

			expect(result.status).toBe("running");
			expect(result.gateway).toBe("openclaw");
			expect(result.connectedClients).toBe(3);
		});
	});

	describe("pollLogsTail", () => {
		it("returns log lines and cursor on initial poll", async () => {
			const result = await pollLogsTail(client);

			expect(result.file).toBe("/tmp/openclaw/test.log");
			expect(result.cursor).toBe(1000);
			expect(result.lines).toHaveLength(1);
		});

		it("returns empty lines when polling with cursor at end", async () => {
			const result = await pollLogsTail(client, 1000);

			expect(result.lines).toHaveLength(0);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getHealth(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
