import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, StreamChunk, ToolDefinition } from "../types.js";

const { mockCreate } = vi.hoisted(() => ({
	mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
	return {
		default: class MockAnthropic {
			messages = { create: mockCreate };
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

describe("anthropic provider — tool calling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("passes tools parameter in Anthropic format", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 10 } },
				};
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: "Hello" },
				};
				yield {
					type: "message_delta",
					delta: { stop_reason: "end_turn" },
					usage: { output_tokens: 5 },
				};
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		for await (const _ of provider.stream([], "system", SAMPLE_TOOLS)) {
			// consume
		}

		expect(mockCreate).toHaveBeenCalledOnce();
		const [createArgs] = mockCreate.mock.calls[0];
		expect(createArgs.tools).toEqual([
			{
				name: "skill_time",
				description: "Get current time",
				input_schema: SAMPLE_TOOLS[0].parameters,
			},
		]);
	});

	it("does not pass tools when none provided", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 5 } },
				};
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: "Hi" },
				};
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		for await (const _ of provider.stream([], "system")) {
			// consume
		}

		const [createArgs] = mockCreate.mock.calls[0];
		expect(createArgs.tools).toBeUndefined();
	});

	it("parses content_block_start tool_use and input_json_delta", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 15 } },
				};
				// Tool use block start
				yield {
					type: "content_block_start",
					index: 0,
					content_block: {
						type: "tool_use",
						id: "toolu_abc123",
						name: "skill_time",
						input: {},
					},
				};
				// Partial JSON delta
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: '{"format":' },
				};
				// More JSON delta
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: '"iso"}' },
				};
				// Block stop → emit tool_use
				yield { type: "content_block_stop", index: 0 };
				// Usage
				yield {
					type: "message_delta",
					delta: { stop_reason: "tool_use" },
					usage: { output_tokens: 30 },
				};
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toEqual({
			type: "tool_use",
			id: "toolu_abc123",
			name: "skill_time",
			args: { format: "iso" },
		});

		const usage = chunks.find((c) => c.type === "usage");
		expect(usage).toEqual({
			type: "usage",
			inputTokens: 15,
			outputTokens: 30,
		});
	});

	it("handles text + tool_use in same response", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 10 } },
				};
				// Text block
				yield {
					type: "content_block_start",
					index: 0,
					content_block: { type: "text", text: "" },
				};
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: "Let me check the time." },
				};
				yield { type: "content_block_stop", index: 0 };
				// Tool use block
				yield {
					type: "content_block_start",
					index: 1,
					content_block: {
						type: "tool_use",
						id: "toolu_xyz",
						name: "skill_time",
						input: {},
					},
				};
				yield {
					type: "content_block_delta",
					index: 1,
					delta: { type: "input_json_delta", partial_json: '{"format":"iso"}' },
				};
				yield { type: "content_block_stop", index: 1 };
				yield {
					type: "message_delta",
					delta: { stop_reason: "tool_use" },
					usage: { output_tokens: 20 },
				};
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const textChunks = chunks.filter((c) => c.type === "text");
		expect(textChunks).toHaveLength(1);
		expect((textChunks[0] as { text: string }).text).toBe(
			"Let me check the time.",
		);

		const toolUseChunks = chunks.filter((c) => c.type === "tool_use");
		expect(toolUseChunks).toHaveLength(1);
		expect(toolUseChunks[0]).toMatchObject({
			id: "toolu_xyz",
			name: "skill_time",
			args: { format: "iso" },
		});
	});

	it("formats tool call history in Anthropic message format", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 10 } },
				};
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: "It is 12:00" },
				};
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		const messages: ChatMessage[] = [
			{ role: "user", content: "What time is it?" },
			{
				role: "assistant",
				content: "",
				toolCalls: [
					{ id: "toolu_1", name: "skill_time", args: { format: "iso" } },
				],
			},
			{
				role: "tool",
				content: "2026-02-19T12:00:00+09:00",
				toolCallId: "toolu_1",
				name: "skill_time",
			},
		];

		for await (const _ of provider.stream(messages, "system", SAMPLE_TOOLS)) {
			// consume
		}

		const [createArgs] = mockCreate.mock.calls[0];
		const sent = createArgs.messages;

		// User message
		expect(sent[0]).toEqual({ role: "user", content: "What time is it?" });

		// Assistant with tool_use content blocks
		expect(sent[1].role).toBe("assistant");
		expect(sent[1].content).toEqual([
			{
				type: "tool_use",
				id: "toolu_1",
				name: "skill_time",
				input: { format: "iso" },
			},
		]);

		// Tool result (user role in Anthropic format)
		expect(sent[2].role).toBe("user");
		expect(sent[2].content).toEqual([
			{
				type: "tool_result",
				tool_use_id: "toolu_1",
				content: "2026-02-19T12:00:00+09:00",
			},
		]);

		// System prompt goes in system field, not messages
		expect(createArgs.system).toBe("system");
	});

	it("handles malformed JSON in tool arguments gracefully", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					type: "message_start",
					message: { usage: { input_tokens: 10 } },
				};
				yield {
					type: "content_block_start",
					index: 0,
					content_block: {
						type: "tool_use",
						id: "toolu_bad",
						name: "skill_time",
						input: {},
					},
				};
				yield {
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: "{broken" },
				};
				yield { type: "content_block_stop", index: 0 };
			})(),
		);

		const { createAnthropicProvider } = await import("../anthropic.js");
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toBeDefined();
		expect((toolUse as { args: Record<string, unknown> }).args).toEqual({});
	});
});
