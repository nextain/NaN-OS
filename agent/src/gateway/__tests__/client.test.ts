import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { GatewayClient } from "../client.js";

// Simple mock Gateway server for testing
let mockServer: WebSocketServer;
let serverPort: number;

beforeAll(async () => {
	mockServer = new WebSocketServer({ port: 0 });
	serverPort = (mockServer.address() as { port: number }).port;

	mockServer.on("connection", (ws) => {
		ws.on("message", (raw) => {
			const msg = JSON.parse(raw.toString());
			if (msg.type === "req") {
				// Echo back a response
				if (msg.method === "health") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { status: "ok", uptime: 123 },
						}),
					);
				} else if (msg.method === "exec.bash") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { stdout: "hello world\n", exitCode: 0 },
						}),
					);
				} else if (msg.method === "fail") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: false,
							error: { code: "NOT_FOUND", message: "method not found" },
						}),
					);
				}
			}
		});
	});
});

afterAll(() => {
	mockServer.close();
});

describe("GatewayClient", () => {
	it("connects to WebSocket server", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");
		expect(client.isConnected()).toBe(true);
		client.close();
	});

	it("sends request and receives response", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");

		const result = await client.request("health", {});
		expect(result).toEqual({ status: "ok", uptime: 123 });

		client.close();
	});

	it("executes bash command via gateway", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");

		const result = await client.request("exec.bash", {
			command: "echo hello world",
		});
		expect(result).toEqual({ stdout: "hello world\n", exitCode: 0 });

		client.close();
	});

	it("handles error responses", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");

		await expect(client.request("fail", {})).rejects.toThrow("method not found");

		client.close();
	});

	it("handles connection failure gracefully", async () => {
		const client = new GatewayClient();
		await expect(
			client.connect("ws://127.0.0.1:19999", "bad-token"),
		).rejects.toThrow();
		expect(client.isConnected()).toBe(false);
	});

	it("receives events via onEvent handler", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");

		const events: unknown[] = [];
		client.onEvent((evt) => events.push(evt));

		// Send an event from server
		for (const ws of mockServer.clients) {
			ws.send(
				JSON.stringify({
					type: "evt",
					event: "exec.approval.requested",
					payload: { id: "approval-1", command: "rm -rf /" },
				}),
			);
		}

		// Wait for event to arrive
		await vi.waitFor(() => expect(events.length).toBe(1));
		expect(events[0]).toEqual({
			type: "evt",
			event: "exec.approval.requested",
			payload: { id: "approval-1", command: "rm -rf /" },
		});

		client.close();
	});
});
