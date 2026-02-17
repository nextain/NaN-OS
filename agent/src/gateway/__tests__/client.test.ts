import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { GatewayClient } from "../client.js";
import { createMockGateway, type MockGateway } from "./mock-gateway.js";

let mock: MockGateway;

beforeAll(() => {
	mock = createMockGateway((method, params, respond) => {
		switch (method) {
			case "health":
				respond.ok({ status: "ok", uptime: 123 });
				break;
			case "exec.bash":
				respond.ok({ stdout: "hello world\n", exitCode: 0 });
				break;
			case "fail":
				respond.error("NOT_FOUND", "method not found");
				break;
			default:
				respond.error("UNKNOWN", `unknown method: ${method}`);
		}
	});
});

afterAll(() => {
	mock.close();
});

describe("GatewayClient — handshake", () => {
	it("completes protocol v3 handshake (challenge → connect → hello-ok)", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });
		expect(client.isConnected()).toBe(true);
		client.close();
	});

	it("stores available methods from hello-ok response", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });
		expect(client.availableMethods).toContain("exec.bash");
		expect(client.availableMethods).toContain("sessions.spawn");
		client.close();
	});

	it("sends correct auth params in connect request", async () => {
		// Create a mock that captures connect params
		let connectParams: Record<string, unknown> | null = null;
		const captureMock = new WebSocketServer({ port: 0 });
		const capturePort = (captureMock.address() as { port: number }).port;

		captureMock.on("connection", (ws) => {
			ws.send(
				JSON.stringify({
					type: "event",
					event: "connect.challenge",
					payload: { nonce: "test-nonce" },
				}),
			);
			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.method === "connect") {
					connectParams = msg.params as Record<string, unknown>;
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { protocol: 3, features: { methods: [] } },
						}),
					);
				}
			});
		});

		const client = new GatewayClient();
			await client.connect(`ws://127.0.0.1:${capturePort}`, {
				token: "my-secret-token",
				clientId: "desktop",
				platform: "linux",
				mode: "gui",
			});

			expect(connectParams).toBeDefined();
			if (!connectParams) {
				throw new Error("connect params not captured");
			}
			const params = connectParams as unknown as Record<string, unknown>;
			expect(params.auth).toEqual({
				token: "my-secret-token",
			});
			expect(params.minProtocol).toBe(3);
			expect(params.maxProtocol).toBe(3);
			const clientInfo = params.client as Record<string, unknown>;
			expect(clientInfo.id).toBe("desktop");
			expect(clientInfo.platform).toBe("linux");
			expect(clientInfo.mode).toBe("gui");

		client.close();
		captureMock.close();
	});

	it("rejects if server sends error to connect", async () => {
		const rejectMock = new WebSocketServer({ port: 0 });
		const rejectPort = (rejectMock.address() as { port: number }).port;

		rejectMock.on("connection", (ws) => {
			ws.send(
				JSON.stringify({
					type: "event",
					event: "connect.challenge",
					payload: { nonce: "test-nonce" },
				}),
			);
			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.method === "connect") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: false,
							error: { code: "AUTH_FAILED", message: "invalid token" },
						}),
					);
				}
			});
		});

		const client = new GatewayClient();
		await expect(
			client.connect(`ws://127.0.0.1:${rejectPort}`, { token: "bad-token" }),
		).rejects.toThrow("invalid token");

		expect(client.isConnected()).toBe(false);
		rejectMock.close();
	});

	it("rejects on connection failure", async () => {
		const client = new GatewayClient();
		await expect(
			client.connect("ws://127.0.0.1:19999", { token: "bad-token" }),
		).rejects.toThrow();
		expect(client.isConnected()).toBe(false);
	});

	it("uses default clientId 'cli' when not specified", async () => {
		let connectParams: Record<string, unknown> | null = null;
		const defaultMock = new WebSocketServer({ port: 0 });
		const defaultPort = (defaultMock.address() as { port: number }).port;

		defaultMock.on("connection", (ws) => {
			ws.send(
				JSON.stringify({
					type: "event",
					event: "connect.challenge",
					payload: { nonce: "test-nonce" },
				}),
			);
			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.method === "connect") {
					connectParams = msg.params as Record<string, unknown>;
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { protocol: 3, features: { methods: [] } },
						}),
					);
				}
			});
		});

			const client = new GatewayClient();
			await client.connect(`ws://127.0.0.1:${defaultPort}`, { token: "tok" });
			expect(connectParams).toBeDefined();
			if (!connectParams) {
				throw new Error("connect params not captured");
			}
			const params = connectParams as unknown as Record<string, unknown>;
			const clientInfo = params.client as Record<string, unknown>;
			expect(clientInfo.id).toBe("cli");
			expect(clientInfo.platform).toBe("linux");
			expect(clientInfo.mode).toBe("cli");

		client.close();
		defaultMock.close();
	});

	it("omits device.signature when signing fails", async () => {
		let connectParams: Record<string, unknown> | null = null;
		const captureMock = new WebSocketServer({ port: 0 });
		const capturePort = (captureMock.address() as { port: number }).port;

		captureMock.on("connection", (ws) => {
			ws.send(
				JSON.stringify({
					type: "event",
					event: "connect.challenge",
					payload: { nonce: "test-nonce" },
				}),
			);
			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.method === "connect") {
					connectParams = msg.params as Record<string, unknown>;
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { protocol: 3, features: { methods: [] } },
						}),
					);
				}
			});
		});

		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${capturePort}`, {
			token: "tok",
			device: {
				id: "device-1",
				publicKey: "fake-public-key",
				privateKeyPem: "not-a-valid-private-key",
			},
		});

		expect(connectParams).toBeDefined();
		if (!connectParams) {
			throw new Error("connect params not captured");
		}
		const params = connectParams as Record<string, unknown>;
		const deviceInfo = params.device as Record<string, unknown>;
		expect(deviceInfo.id).toBe("device-1");
		expect(deviceInfo.publicKey).toBe("fake-public-key");
		expect("signature" in deviceInfo).toBe(false);

		client.close();
		captureMock.close();
	});
});

describe("GatewayClient — request/response", () => {
	it("sends request and receives response", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });

		const result = await client.request("health", {});
		expect(result).toEqual({ status: "ok", uptime: 123 });

		client.close();
	});

	it("executes bash command via gateway", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });

		const result = await client.request("exec.bash", {
			command: "echo hello world",
		});
		expect(result).toEqual({ stdout: "hello world\n", exitCode: 0 });

		client.close();
	});

	it("handles error responses", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });

		await expect(client.request("fail", {})).rejects.toThrow(
			"method not found",
		);

		client.close();
	});

	it("receives events via onEvent handler", async () => {
		const client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });

		const events: unknown[] = [];
		client.onEvent((evt) => events.push(evt));

		// Send an event from server (using "event" type like real Gateway)
		for (const ws of mock.clients) {
			ws.send(
				JSON.stringify({
					type: "event",
					event: "exec.approval.requested",
					payload: { id: "approval-1", command: "rm -rf /" },
				}),
			);
		}

		await vi.waitFor(() => expect(events.length).toBe(1));
		expect(events[0]).toMatchObject({
			event: "exec.approval.requested",
			payload: { id: "approval-1", command: "rm -rf /" },
		});

		client.close();
	});
});
