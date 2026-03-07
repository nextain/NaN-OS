import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock config
vi.mock("../config", () => ({
	loadConfig: vi.fn(),
	resolveGatewayUrl: vi.fn(),
}));

// Mock chat-service
const mockDirectToolCall = vi.fn();
vi.mock("../chat-service", () => ({
	directToolCall: (...args: unknown[]) => mockDirectToolCall(...args),
}));

import { loadConfig, resolveGatewayUrl } from "../config";

describe("gateway-sessions", () => {
	beforeEach(() => {
		(loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({
			enableTools: true,
			gatewayToken: "test-token",
		});
		(resolveGatewayUrl as ReturnType<typeof vi.fn>).mockReturnValue(
			"ws://localhost:18789",
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe("listGatewaySessions", () => {
		it("returns parsed sessions from Gateway", async () => {
			mockDirectToolCall.mockResolvedValueOnce({
				success: true,
				output: JSON.stringify({
					sessions: [
						{
							key: "agent:main:main",
							label: "Main Chat",
							messageCount: 5,
							createdAt: 1000,
							updatedAt: 2000,
							metadata: { summary: "Test summary" },
						},
						{
							key: "discord:channel:123",
							label: "Discord",
							messageCount: 3,
							createdAt: 500,
							updatedAt: 1500,
						},
					],
				}),
			});

			const { listGatewaySessions } = await import("../gateway-sessions");
			const sessions = await listGatewaySessions(50);

			expect(sessions).toHaveLength(2);
			expect(sessions[0].key).toBe("agent:main:main");
			expect(sessions[0].summary).toBe("Test summary");
			expect(sessions[1].key).toBe("discord:channel:123");
			expect(sessions[1].summary).toBeUndefined();
		});

		it("includes per-channel-peer Discord sessions", async () => {
			mockDirectToolCall.mockResolvedValueOnce({
				success: true,
				output: JSON.stringify({
					sessions: [
						{
							key: "agent:main:discord:direct:865850174651498506",
							label: "Discord DM",
							messageCount: 10,
							createdAt: 1000,
							updatedAt: 3000,
						},
					],
				}),
			});

			const { listGatewaySessions } = await import("../gateway-sessions");
			const sessions = await listGatewaySessions(50);

			expect(sessions).toHaveLength(1);
			expect(sessions[0].key).toBe(
				"agent:main:discord:direct:865850174651498506",
			);
		});

		it("returns empty array when Gateway unavailable", async () => {
			(resolveGatewayUrl as ReturnType<typeof vi.fn>).mockReturnValue(null);

			const { listGatewaySessions } = await import("../gateway-sessions");
			const sessions = await listGatewaySessions();

			expect(sessions).toEqual([]);
			expect(mockDirectToolCall).not.toHaveBeenCalled();
		});

		it("returns empty array on Gateway error", async () => {
			mockDirectToolCall.mockRejectedValueOnce(new Error("Connection refused"));

			const { listGatewaySessions } = await import("../gateway-sessions");
			const sessions = await listGatewaySessions();

			expect(sessions).toEqual([]);
		});
	});

	describe("getGatewayHistory", () => {
		it("returns parsed ChatMessages from Gateway", async () => {
			mockDirectToolCall.mockResolvedValueOnce({
				success: true,
				output: JSON.stringify({
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: "Hello" }],
							timestamp: 1000,
						},
						{
							role: "assistant",
							content: [{ type: "text", text: "Hi there!" }],
							timestamp: 2000,
						},
					],
				}),
			});

			const { getGatewayHistory } = await import("../gateway-sessions");
			const messages = await getGatewayHistory("agent:main:main");

			expect(messages).toHaveLength(2);
			expect(messages[0].role).toBe("user");
			expect(messages[0].content).toBe("Hello");
			expect(messages[1].role).toBe("assistant");
			expect(messages[1].content).toBe("Hi there!");
		});

		it("filters out non-user/assistant roles", async () => {
			mockDirectToolCall.mockResolvedValueOnce({
				success: true,
				output: JSON.stringify({
					messages: [
						{
							role: "system",
							content: [{ type: "text", text: "System prompt" }],
						},
						{
							role: "user",
							content: [{ type: "text", text: "Hello" }],
							timestamp: 1000,
						},
					],
				}),
			});

			const { getGatewayHistory } = await import("../gateway-sessions");
			const messages = await getGatewayHistory("agent:main:main");

			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe("user");
		});
	});

	describe("deleteGatewaySession", () => {
		it("returns true on success", async () => {
			mockDirectToolCall.mockResolvedValueOnce({ success: true, output: "" });

			const { deleteGatewaySession } = await import("../gateway-sessions");
			const result = await deleteGatewaySession("agent:main:old");

			expect(result).toBe(true);
			expect(mockDirectToolCall).toHaveBeenCalledWith(
				expect.objectContaining({
					toolName: "skill_sessions",
					args: { action: "delete", key: "agent:main:old" },
				}),
			);
		});
	});

	describe("patchGatewaySession", () => {
		it("patches session metadata", async () => {
			mockDirectToolCall.mockResolvedValueOnce({ success: true, output: "" });

			const { patchGatewaySession } = await import("../gateway-sessions");
			const result = await patchGatewaySession("agent:main:main", {
				summary: "Test summary",
			});

			expect(result).toBe(true);
			expect(mockDirectToolCall).toHaveBeenCalledWith(
				expect.objectContaining({
					toolName: "skill_sessions",
					args: {
						action: "patch",
						key: "agent:main:main",
						metadata: { summary: "Test summary" },
					},
				}),
			);
		});
	});

	describe("resetGatewaySession", () => {
		it("resets session via Gateway", async () => {
			mockDirectToolCall.mockResolvedValueOnce({ success: true, output: "" });

			const { resetGatewaySession } = await import("../gateway-sessions");
			const result = await resetGatewaySession();

			expect(result).toBe(true);
			expect(mockDirectToolCall).toHaveBeenCalledWith(
				expect.objectContaining({
					toolName: "skill_sessions",
					args: { action: "reset", key: "agent:main:main" },
				}),
			);
		});
	});
});
