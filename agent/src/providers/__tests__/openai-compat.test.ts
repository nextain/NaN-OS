import { describe, expect, it } from "vitest";
import { toOpenAIMessages, toOpenAITools } from "../openai-compat.js";
import type { ChatMessage, ToolDefinition } from "../types.js";

describe("openai-compat", () => {
	describe("toOpenAIMessages", () => {
		it("prepends system prompt", () => {
			const result = toOpenAIMessages([], "You are a helper");

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				role: "system",
				content: "You are a helper",
			});
		});

		it("maps user and assistant messages", () => {
			const messages: ChatMessage[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
			];
			const result = toOpenAIMessages(messages, "sys");

			expect(result).toHaveLength(3);
			expect(result[1]).toEqual({ role: "user", content: "Hello" });
			expect(result[2]).toEqual({ role: "assistant", content: "Hi there" });
		});

		it("maps tool call messages with function format", () => {
			const messages: ChatMessage[] = [
				{
					role: "assistant",
					content: "",
					toolCalls: [
						{ id: "call_1", name: "get_time", args: { format: "iso" } },
					],
				},
			];
			const result = toOpenAIMessages(messages, "sys");

			expect(result[1]).toEqual({
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: {
							name: "get_time",
							arguments: '{"format":"iso"}',
						},
					},
				],
			});
		});

		it("maps tool result messages", () => {
			const messages: ChatMessage[] = [
				{
					role: "tool",
					content: "2026-02-19T12:00:00Z",
					toolCallId: "call_1",
				},
			];
			const result = toOpenAIMessages(messages, "sys");

			expect(result[1]).toEqual({
				role: "tool",
				tool_call_id: "call_1",
				content: "2026-02-19T12:00:00Z",
			});
		});

		it("handles multiple tool calls in one message", () => {
			const messages: ChatMessage[] = [
				{
					role: "assistant",
					content: "Let me check",
					toolCalls: [
						{ id: "c1", name: "time", args: {} },
						{ id: "c2", name: "weather", args: { city: "Seoul" } },
					],
				},
			];
			const result = toOpenAIMessages(messages, "sys");

			expect(result[1].role).toBe("assistant");
			const toolCalls = (result[1] as { tool_calls: unknown[] }).tool_calls;
			expect(toolCalls).toHaveLength(2);
		});
	});

	describe("toOpenAITools", () => {
		it("maps tool definitions to OpenAI format", () => {
			const tools: ToolDefinition[] = [
				{
					name: "get_time",
					description: "Get the current time",
					parameters: {
						type: "object",
						properties: { format: { type: "string" } },
					},
				},
			];
			const result = toOpenAITools(tools);

			expect(result).toEqual([
				{
					type: "function",
					function: {
						name: "get_time",
						description: "Get the current time",
						parameters: {
							type: "object",
							properties: { format: { type: "string" } },
						},
					},
				},
			]);
		});

		it("handles empty tools array", () => {
			expect(toOpenAITools([])).toEqual([]);
		});

		it("preserves all tool fields", () => {
			const tools: ToolDefinition[] = [
				{
					name: "search",
					description: "Search files",
					parameters: {
						type: "object",
						properties: {
							query: { type: "string" },
							limit: { type: "number" },
						},
						required: ["query"],
					},
				},
			];
			const result = toOpenAITools(tools);

			expect(result[0].function.parameters).toEqual(tools[0].parameters);
		});
	});
});
