import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, StreamChunk, ToolDefinition } from "../types.js";

const { mockCreate } = vi.hoisted(() => ({
	mockCreate: vi.fn(),
}));

vi.mock("openai", () => {
	return {
		default: class MockOpenAI {
			chat = { completions: { create: mockCreate } };
		},
	};
});

const SAMPLE_TOOLS: ToolDefinition[] = [
	{
		name: "skill_time",
		description: "Get current time",
		parameters: {
			type: "object",
			properties: { format: { type: "string" } },
		},
	},
];

describe("xai provider — tool calling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("passes tools parameter in OpenAI format", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: "Hello" } }],
					usage: null,
				};
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		expect(mockCreate).toHaveBeenCalledOnce();
		const [createArgs] = mockCreate.mock.calls[0];
		expect(createArgs.tools).toEqual([
			{
				type: "function",
				function: {
					name: "skill_time",
					description: "Get current time",
					parameters: SAMPLE_TOOLS[0].parameters,
				},
			},
		]);
	});

	it("does not pass tools when none provided", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield { choices: [{ delta: { content: "Hi" } }], usage: null };
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		for await (const _ of provider.stream([], "system")) {
			// consume
		}

		const [createArgs] = mockCreate.mock.calls[0];
		expect(createArgs.tools).toBeUndefined();
	});

	it("parses tool_calls delta chunks and emits tool_use", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				// First chunk: tool call start with partial arguments
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_abc123",
										function: {
											name: "skill_time",
											arguments: '{"format":',
										},
									},
								],
							},
						},
					],
					usage: null,
				};
				// Continuation chunk: more arguments
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: { arguments: '"iso"}' },
									},
								],
							},
						},
					],
					usage: null,
				};
				// Usage chunk
				yield {
					choices: [{ delta: {} }],
					usage: { prompt_tokens: 10, completion_tokens: 20 },
				};
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toEqual({
			type: "tool_use",
			id: "call_abc123",
			name: "skill_time",
			args: { format: "iso" },
		});

		const usage = chunks.find((c) => c.type === "usage");
		expect(usage).toEqual({
			type: "usage",
			inputTokens: 10,
			outputTokens: 20,
		});
	});

	it("handles multiple concurrent tool calls", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_1",
										function: {
											name: "skill_time",
											arguments: '{"format":"iso"}',
										},
									},
									{
										index: 1,
										id: "call_2",
										function: {
											name: "skill_time",
											arguments: '{"format":"unix"}',
										},
									},
								],
							},
						},
					],
					usage: null,
				};
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUseChunks = chunks.filter((c) => c.type === "tool_use");
		expect(toolUseChunks).toHaveLength(2);
		expect(toolUseChunks[0]).toMatchObject({
			name: "skill_time",
			args: { format: "iso" },
		});
		expect(toolUseChunks[1]).toMatchObject({
			name: "skill_time",
			args: { format: "unix" },
		});
	});

	it("formats tool call history in messages correctly", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: "The time is 12:00" } }],
					usage: null,
				};
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		const messages: ChatMessage[] = [
			{ role: "user", content: "What time is it?" },
			{
				role: "assistant",
				content: "",
				toolCalls: [
					{ id: "call_1", name: "skill_time", args: { format: "iso" } },
				],
			},
			{
				role: "tool",
				content: "2026-02-19T12:00:00+09:00",
				toolCallId: "call_1",
				name: "skill_time",
			},
		];

		for await (const _ of provider.stream(messages, "system", SAMPLE_TOOLS)) {
			// consume
		}

		const [createArgs] = mockCreate.mock.calls[0];
		const sent = createArgs.messages;

		// System prompt first
		expect(sent[0]).toEqual({ role: "system", content: "system" });

		// User message
		expect(sent[1]).toEqual({ role: "user", content: "What time is it?" });

		// Assistant with tool_calls
		expect(sent[2].role).toBe("assistant");
		expect(sent[2].tool_calls).toHaveLength(1);
		expect(sent[2].tool_calls[0]).toEqual({
			id: "call_1",
			type: "function",
			function: {
				name: "skill_time",
				arguments: JSON.stringify({ format: "iso" }),
			},
		});

		// Tool result
		expect(sent[3]).toEqual({
			role: "tool",
			tool_call_id: "call_1",
			content: "2026-02-19T12:00:00+09:00",
		});
	});

	it("handles malformed JSON in tool arguments gracefully", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_bad",
										function: {
											name: "skill_time",
											arguments: "{invalid json",
										},
									},
								],
							},
						},
					],
					usage: null,
				};
			})(),
		);

		const { createXAIProvider } = await import("../xai.js");
		const provider = createXAIProvider("test-key", "grok-3");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toBeDefined();
		// Should emit empty args on malformed JSON
		expect((toolUse as { args: Record<string, unknown> }).args).toEqual({});
	});
});
