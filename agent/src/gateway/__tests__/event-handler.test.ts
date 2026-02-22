import { describe, expect, it, vi } from "vitest";
import { createGatewayEventHandler } from "../event-handler.js";
import type { GatewayEvent } from "../types.js";

describe("event-handler", () => {
	it("dispatches exec.approval.requested to writeLine", () => {
		const writeLine = vi.fn();
		const pendingApprovals = new Map();
		const handler = createGatewayEventHandler(writeLine, pendingApprovals);

		const event: GatewayEvent = {
			type: "event",
			event: "exec.approval.requested",
			payload: {
				requestId: "req-1",
				toolCallId: "tc-1",
				toolName: "execute_command",
				args: { command: "ls" },
			},
		};

		handler(event);

		expect(writeLine).toHaveBeenCalledOnce();
		expect(writeLine).toHaveBeenCalledWith({
			type: "gateway_approval_request",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "execute_command",
			args: { command: "ls" },
		});
	});

	it("dispatches logs.entry to writeLine", () => {
		const writeLine = vi.fn();
		const pendingApprovals = new Map();
		const handler = createGatewayEventHandler(writeLine, pendingApprovals);

		const event: GatewayEvent = {
			type: "event",
			event: "logs.entry",
			payload: {
				level: "info",
				message: "Gateway started",
				timestamp: 1700000000000,
			},
		};

		handler(event);

		expect(writeLine).toHaveBeenCalledOnce();
		expect(writeLine).toHaveBeenCalledWith({
			type: "log_entry",
			level: "info",
			message: "Gateway started",
			timestamp: 1700000000000,
		});
	});

	it("ignores unknown events", () => {
		const writeLine = vi.fn();
		const pendingApprovals = new Map();
		const handler = createGatewayEventHandler(writeLine, pendingApprovals);

		const event: GatewayEvent = {
			type: "event",
			event: "some.unknown.event",
			payload: {},
		};

		handler(event);

		expect(writeLine).not.toHaveBeenCalled();
	});

	it("dispatches channel.message as discord_message", () => {
		const writeLine = vi.fn();
		const pendingApprovals = new Map();
		const handler = createGatewayEventHandler(writeLine, pendingApprovals);

		const event: GatewayEvent = {
			type: "event",
			event: "channel.message",
			payload: {
				from: "user123",
				content: "Hello from Discord",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
		};

		handler(event);

		expect(writeLine).toHaveBeenCalledOnce();
		expect(writeLine).toHaveBeenCalledWith({
			type: "discord_message",
			requestId: "gateway",
			from: "user123",
			content: "Hello from Discord",
			timestamp: "2026-01-01T00:00:00.000Z",
		});
	});

	it("handles events with missing payload gracefully", () => {
		const writeLine = vi.fn();
		const pendingApprovals = new Map();
		const handler = createGatewayEventHandler(writeLine, pendingApprovals);

		const event: GatewayEvent = {
			type: "event",
			event: "logs.entry",
		};

		handler(event);

		expect(writeLine).toHaveBeenCalledWith({
			type: "log_entry",
			level: undefined,
			message: undefined,
			timestamp: undefined,
		});
	});
});
