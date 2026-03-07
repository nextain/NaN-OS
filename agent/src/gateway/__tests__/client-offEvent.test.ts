import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "../client.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

describe("GatewayClient.offEvent", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(_method, _params, respond) => {
				respond.ok({});
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

	it("removes a registered handler", () => {
		const handler = vi.fn();
		client.onEvent(handler);
		client.offEvent(handler);

		// Emit a fake event to verify handler is no longer called
		// Access private handleEvent via casting
		(client as any).handleEvent({
			type: "event",
			event: "test",
			payload: {},
		});

		expect(handler).not.toHaveBeenCalled();
	});

	it("does not remove other handlers", () => {
		const handler1 = vi.fn();
		const handler2 = vi.fn();
		client.onEvent(handler1);
		client.onEvent(handler2);

		client.offEvent(handler1);

		(client as any).handleEvent({
			type: "event",
			event: "test",
			payload: {},
		});

		expect(handler1).not.toHaveBeenCalled();
		expect(handler2).toHaveBeenCalledOnce();

		// Cleanup
		client.offEvent(handler2);
	});

	it("is a no-op for unregistered handler", () => {
		const handler = vi.fn();
		// Should not throw
		client.offEvent(handler);
	});

	it("only removes the first matching reference", () => {
		const handler = vi.fn();
		client.onEvent(handler);
		client.onEvent(handler); // registered twice

		client.offEvent(handler); // removes first

		(client as any).handleEvent({
			type: "event",
			event: "test",
			payload: {},
		});

		// Still called once (second registration remains)
		expect(handler).toHaveBeenCalledOnce();

		// Cleanup
		client.offEvent(handler);
	});
});
