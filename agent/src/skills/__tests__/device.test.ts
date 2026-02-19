import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createDeviceSkill } from "../built-in/device.js";
import type { SkillDefinition } from "../types.js";

describe("skill_device", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "node.list":
						respond.ok({
							nodes: [
								{ id: "n1", name: "Desktop", status: "online" },
								{ id: "n2", name: "Laptop", status: "offline" },
							],
						});
						break;
					case "node.describe":
						respond.ok({
							id: params.nodeId,
							name: "Desktop",
							status: "online",
							version: "1.0.0",
							platform: "linux",
							capabilities: ["exec", "fs"],
						});
						break;
					case "node.rename":
						respond.ok({ nodeId: params.nodeId, renamed: true });
						break;
					case "node.pair.request":
						respond.ok({
							requestId: "req-1",
							nodeId: params.nodeId,
							status: "pending",
						});
						break;
					case "node.pair.list":
						respond.ok({
							requests: [
								{ requestId: "req-1", nodeId: "n3", status: "pending" },
							],
						});
						break;
					case "node.pair.approve":
						respond.ok({ requestId: params.requestId, approved: true });
						break;
					case "node.pair.reject":
						respond.ok({ requestId: params.requestId, rejected: true });
						break;
					case "node.pair.verify":
						respond.ok({ requestId: params.requestId, verified: true });
						break;
					case "device.pair.list":
						respond.ok({
							pairings: [
								{ deviceId: "d1", nodeName: "Phone", status: "paired" },
							],
						});
						break;
					case "device.pair.approve":
						respond.ok({ deviceId: params.deviceId, approved: true });
						break;
					case "device.pair.reject":
						respond.ok({ deviceId: params.deviceId, rejected: true });
						break;
					case "device.token.rotate":
						respond.ok({
							deviceId: params.deviceId,
							token: "new-token-123",
						});
						break;
					case "device.token.revoke":
						respond.ok({ deviceId: params.deviceId, revoked: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"node.list",
					"node.describe",
					"node.rename",
					"node.pair.request",
					"node.pair.list",
					"node.pair.approve",
					"node.pair.reject",
					"node.pair.verify",
					"device.pair.list",
					"device.pair.approve",
					"device.pair.reject",
					"device.token.rotate",
					"device.token.revoke",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createDeviceSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_device");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
	});

	it("lists nodes", async () => {
		const result = await skill.execute(
			{ action: "node_list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.nodes).toHaveLength(2);
		expect(parsed.nodes[0].name).toBe("Desktop");
	});

	it("describes a node", async () => {
		const result = await skill.execute(
			{ action: "node_describe", nodeId: "n1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.name).toBe("Desktop");
		expect(parsed.capabilities).toContain("exec");
	});

	it("requires nodeId for node_describe", async () => {
		const result = await skill.execute(
			{ action: "node_describe" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("nodeId is required");
	});

	it("renames a node", async () => {
		const result = await skill.execute(
			{ action: "node_rename", nodeId: "n1", name: "Workstation" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.renamed).toBe(true);
	});

	it("requests node pairing", async () => {
		const result = await skill.execute(
			{ action: "pair_request", nodeId: "n3" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.status).toBe("pending");
	});

	it("lists pair requests", async () => {
		const result = await skill.execute(
			{ action: "pair_list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.requests).toHaveLength(1);
	});

	it("approves pair request", async () => {
		const result = await skill.execute(
			{ action: "pair_approve", requestId: "req-1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.approved).toBe(true);
	});

	it("rejects pair request", async () => {
		const result = await skill.execute(
			{ action: "pair_reject", requestId: "req-1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.rejected).toBe(true);
	});

	it("verifies pair request", async () => {
		const result = await skill.execute(
			{ action: "pair_verify", requestId: "req-1", code: "123456" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.verified).toBe(true);
	});

	it("lists device pairings", async () => {
		const result = await skill.execute(
			{ action: "device_list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.pairings).toHaveLength(1);
	});

	it("approves device pairing", async () => {
		const result = await skill.execute(
			{ action: "device_approve", deviceId: "d1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
	});

	it("rejects device pairing", async () => {
		const result = await skill.execute(
			{ action: "device_reject", deviceId: "d1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
	});

	it("rotates device token", async () => {
		const result = await skill.execute(
			{ action: "token_rotate", deviceId: "d1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.token).toBe("new-token-123");
	});

	it("revokes device token", async () => {
		const result = await skill.execute(
			{ action: "token_revoke", deviceId: "d1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.revoked).toBe(true);
	});

	// --- Validation: missing required params ---

	it("requires nodeId for node_rename", async () => {
		const result = await skill.execute(
			{ action: "node_rename", name: "x" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("nodeId is required");
	});

	it("requires name for node_rename", async () => {
		const result = await skill.execute(
			{ action: "node_rename", nodeId: "n1" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("name is required");
	});

	it("requires nodeId for pair_request", async () => {
		const result = await skill.execute(
			{ action: "pair_request" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("nodeId is required");
	});

	it("requires requestId for pair_approve", async () => {
		const result = await skill.execute(
			{ action: "pair_approve" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("requestId is required");
	});

	it("requires requestId for pair_reject", async () => {
		const result = await skill.execute(
			{ action: "pair_reject" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("requestId is required");
	});

	it("requires requestId for pair_verify", async () => {
		const result = await skill.execute(
			{ action: "pair_verify", code: "123" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("requestId is required");
	});

	it("requires code for pair_verify", async () => {
		const result = await skill.execute(
			{ action: "pair_verify", requestId: "req-1" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("code is required");
	});

	it("requires deviceId for device_approve", async () => {
		const result = await skill.execute(
			{ action: "device_approve" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("deviceId is required");
	});

	it("requires deviceId for device_reject", async () => {
		const result = await skill.execute(
			{ action: "device_reject" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("deviceId is required");
	});

	it("requires deviceId for token_rotate", async () => {
		const result = await skill.execute(
			{ action: "token_rotate" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("deviceId is required");
	});

	it("requires deviceId for token_revoke", async () => {
		const result = await skill.execute(
			{ action: "token_revoke" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("deviceId is required");
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "node_list" }, {});
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
