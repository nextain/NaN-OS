import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type NodeInfo,
	approveDevicePair,
	approveNodePair,
	describeNode,
	listDevicePairings,
	listNodePairRequests,
	listNodes,
	rejectDevicePair,
	rejectNodePair,
	renameNode,
	requestNodePair,
	revokeDeviceToken,
	rotateDeviceToken,
	verifyNodePair,
} from "../device-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_NODES: NodeInfo[] = [
	{
		id: "node-1",
		name: "Desktop",
		status: "online",
		lastSeen: 1700000000000,
	},
	{
		id: "node-2",
		name: "Laptop",
		status: "offline",
		lastSeen: 1699990000000,
	},
];

const MOCK_PAIRINGS = [
	{ deviceId: "dev-1", nodeName: "Desktop", status: "approved" },
];

const MOCK_PAIR_REQUESTS = [
	{ requestId: "req-1", nodeId: "node-1", status: "pending", code: "123456" },
];

describe("device-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "node.list":
						respond.ok({ nodes: MOCK_NODES });
						break;
					case "device.pair.list":
						respond.ok({ pairings: MOCK_PAIRINGS });
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
						respond.ok({
							nodeId: params.nodeId,
							renamed: true,
						});
						break;
					case "node.pair.request":
						respond.ok({
							requestId: "req-new",
							nodeId: params.nodeId,
							status: "pending",
						});
						break;
					case "node.pair.list":
						respond.ok({ requests: MOCK_PAIR_REQUESTS });
						break;
					case "node.pair.approve":
						respond.ok({
							requestId: params.requestId,
							approved: true,
						});
						break;
					case "node.pair.reject":
						respond.ok({
							requestId: params.requestId,
							rejected: true,
						});
						break;
					case "node.pair.verify":
						respond.ok({
							requestId: params.requestId,
							verified: true,
						});
						break;
					case "device.pair.approve":
						respond.ok({
							deviceId: params.deviceId,
							approved: true,
						});
						break;
					case "device.pair.reject":
						respond.ok({
							deviceId: params.deviceId,
							rejected: true,
						});
						break;
					case "device.token.rotate":
						respond.ok({
							deviceId: params.deviceId,
							token: "new-token-xyz",
						});
						break;
					case "device.token.revoke":
						respond.ok({
							deviceId: params.deviceId,
							revoked: true,
						});
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
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
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	describe("listNodes", () => {
		it("returns node list", async () => {
			const result = await listNodes(client);

			expect(result.nodes).toHaveLength(2);
			expect(result.nodes[0].name).toBe("Desktop");
			expect(result.nodes[0].status).toBe("online");
		});
	});

	describe("listDevicePairings", () => {
		it("returns pairing list", async () => {
			const result = await listDevicePairings(client);

			expect(result.pairings).toHaveLength(1);
			expect(result.pairings[0].status).toBe("approved");
		});
	});

	describe("describeNode", () => {
		it("returns node details", async () => {
			const result = await describeNode(client, "node-1");

			expect(result.id).toBe("node-1");
			expect(result.version).toBe("1.0.0");
			expect(result.capabilities).toContain("exec");
		});
	});

	describe("renameNode", () => {
		it("renames a node", async () => {
			const result = await renameNode(client, "node-1", "Workstation");

			expect(result.renamed).toBe(true);
		});
	});

	describe("node pairing", () => {
		it("requests pairing", async () => {
			const result = await requestNodePair(client, "node-1");

			expect(result.requestId).toBe("req-new");
			expect(result.status).toBe("pending");
		});

		it("lists pair requests", async () => {
			const result = await listNodePairRequests(client);

			expect(result.requests).toHaveLength(1);
			expect(result.requests[0].code).toBe("123456");
		});

		it("approves pair request", async () => {
			const result = await approveNodePair(client, "req-1");

			expect(result.approved).toBe(true);
		});

		it("rejects pair request", async () => {
			const result = await rejectNodePair(client, "req-1");

			expect(result.rejected).toBe(true);
		});

		it("verifies pair request with code", async () => {
			const result = await verifyNodePair(client, "req-1", "123456");

			expect(result.verified).toBe(true);
		});
	});

	describe("device pairing", () => {
		it("approves device pair", async () => {
			const result = await approveDevicePair(client, "dev-1");

			expect(result.approved).toBe(true);
		});

		it("rejects device pair", async () => {
			const result = await rejectDevicePair(client, "dev-1");

			expect(result.rejected).toBe(true);
		});
	});

	describe("device tokens", () => {
		it("rotates token", async () => {
			const result = await rotateDeviceToken(client, "dev-1");

			expect(result.token).toBe("new-token-xyz");
		});

		it("revokes token", async () => {
			const result = await revokeDeviceToken(client, "dev-1");

			expect(result.revoked).toBe(true);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(listNodes(disconnected)).rejects.toThrow(/not connected/i);
		});
	});
});
