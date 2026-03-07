import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getApprovalRules,
	resolveApproval,
	setApprovalRules,
} from "../approvals-proxy.js";
import { GatewayClient } from "../client.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_RULES = {
	allowedTools: ["skill_time", "skill_weather", "read_file"],
	blockedPatterns: ["rm -rf /", "chmod 777"],
};

describe("approvals-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "exec.approvals.get":
						respond.ok(MOCK_RULES);
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
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
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
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	describe("getApprovalRules", () => {
		it("returns approval rules", async () => {
			const result = await getApprovalRules(client);

			expect(result.allowedTools).toHaveLength(3);
			expect(result.allowedTools).toContain("skill_time");
			expect(result.blockedPatterns).toContain("rm -rf /");
		});
	});

	describe("setApprovalRules", () => {
		it("updates approval rules", async () => {
			const result = await setApprovalRules(client, {
				allowedTools: ["skill_time"],
			});

			expect(result.updated).toBe(true);
		});
	});

	describe("resolveApproval", () => {
		it("resolves an approval request", async () => {
			const result = await resolveApproval(client, "req-123", "approve");

			expect(result.requestId).toBe("req-123");
			expect(result.resolved).toBe(true);
		});

		it("rejects an approval request", async () => {
			const result = await resolveApproval(client, "req-456", "reject");

			expect(result.requestId).toBe("req-456");
			expect(result.resolved).toBe(true);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getApprovalRules(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
