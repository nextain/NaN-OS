import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamChunk, ToolDefinition } from "../types.js";

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

describe("openai provider — tool calling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("passes tools and parses tool_calls delta", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_oai_1",
										function: {
											name: "skill_time",
											arguments: '{"format":"iso"}',
										},
									},
								],
							},
						},
					],
					usage: null,
				};
				yield {
					choices: [{ delta: {} }],
					usage: { prompt_tokens: 8, completion_tokens: 12 },
				};
			})(),
		);

		const { createOpenAIProvider } = await import("../openai.js");
		const provider = createOpenAIProvider("test-key", "gpt-4o");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		// Verify tools were passed
		const [createArgs] = mockCreate.mock.calls[0];
		expect(createArgs.tools).toBeDefined();
		expect(createArgs.tools[0].type).toBe("function");
		expect(createArgs.tools[0].function.name).toBe("skill_time");

		// Verify tool_use chunk
		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toEqual({
			type: "tool_use",
			id: "call_oai_1",
			name: "skill_time",
			args: { format: "iso" },
		});
	});

	it("accumulates fragmented tool_calls arguments", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_frag",
										function: { name: "skill_time", arguments: '{"fo' },
									},
								],
							},
						},
					],
					usage: null,
				};
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: { arguments: 'rmat"' },
									},
								],
							},
						},
					],
					usage: null,
				};
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: { arguments: ':"unix"}' },
									},
								],
							},
						},
					],
					usage: null,
				};
			})(),
		);

		const { createOpenAIProvider } = await import("../openai.js");
		const provider = createOpenAIProvider("test-key", "gpt-4o");

		const chunks: StreamChunk[] = [];
		for await (const chunk of provider.stream([], "system", SAMPLE_TOOLS)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c) => c.type === "tool_use");
		expect(toolUse).toEqual({
			type: "tool_use",
			id: "call_frag",
			name: "skill_time",
			args: { format: "unix" },
		});
	});

	it("includes tool result messages in conversation", async () => {
		mockCreate.mockReturnValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: "Done." } }],
					usage: null,
				};
			})(),
		);

		const { createOpenAIProvider } = await import("../openai.js");
		const provider = createOpenAIProvider("test-key", "gpt-4o");

		const messages = [
			{ role: "user" as const, content: "time?" },
			{
				role: "assistant" as const,
				content: "",
				toolCalls: [{ id: "c1", name: "skill_time", args: { format: "iso" } }],
			},
			{
				role: "tool" as const,
				content: "2026-02-19T12:00:00Z",
				toolCallId: "c1",
				name: "skill_time",
			},
		];

		for await (const _ of provider.stream(messages, "sys", SAMPLE_TOOLS)) {
			// consume
		}

		const [createArgs] = mockCreate.mock.calls[0];
		const sent = createArgs.messages;

		// Should include tool message (not filtered out)
		const toolMsg = sent.find(
			(m: Record<string, unknown>) => m.role === "tool",
		);
		expect(toolMsg).toBeDefined();
		expect(toolMsg.tool_call_id).toBe("c1");
		expect(toolMsg.content).toBe("2026-02-19T12:00:00Z");
	});
});
