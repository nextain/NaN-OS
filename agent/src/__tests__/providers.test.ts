import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCost } from "../providers/cost.js";

// Hoisted shared mock for Gemini generateContentStream
const { mockGenerateContentStream } = vi.hoisted(() => ({
	mockGenerateContentStream: vi.fn(),
}));

function defaultGeminiStream() {
	return {
		async *[Symbol.asyncIterator]() {
			yield { text: "Hello ", usageMetadata: undefined, functionCalls: undefined };
			yield {
				text: "world!",
				functionCalls: undefined,
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 5,
				},
			};
		},
	};
}

// Mock @google/genai with shared mock
vi.mock("@google/genai", () => {
	class MockGoogleGenAI {
		models = {
			generateContentStream: mockGenerateContentStream,
		};
	}
	return { GoogleGenAI: MockGoogleGenAI };
});

// Mock openai
vi.mock("openai", () => {
	class MockOpenAI {
		chat = {
			completions: {
				create: vi.fn().mockResolvedValue({
					async *[Symbol.asyncIterator]() {
						yield {
							choices: [{ delta: { content: "Grok " } }],
							usage: null,
						};
						yield {
							choices: [{ delta: { content: "says hi" } }],
							usage: {
								prompt_tokens: 20,
								completion_tokens: 10,
							},
						};
					},
				}),
			},
		};
	}
	return { default: MockOpenAI };
});

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
	class MockAnthropic {
		messages = {
			create: vi.fn().mockResolvedValue({
				async *[Symbol.asyncIterator]() {
					yield {
						type: "content_block_delta",
						delta: { type: "text_delta", text: "Claude " },
					};
					yield {
						type: "content_block_delta",
						delta: { type: "text_delta", text: "here" },
					};
					yield {
						type: "message_delta",
						usage: { output_tokens: 8 },
					};
					yield {
						type: "message_start",
						message: { usage: { input_tokens: 15 } },
					};
				},
			}),
		};
	}
	return { default: MockAnthropic };
});

beforeEach(() => {
	mockGenerateContentStream.mockReset();
	mockGenerateContentStream.mockResolvedValue(defaultGeminiStream());
});

describe("cost calculation", () => {
	it("calculates Gemini cost correctly", () => {
		const cost = calculateCost("gemini-2.5-flash", 1000, 500);
		expect(cost).toBeCloseTo(0.00045, 6);
	});

	it("calculates xAI cost correctly", () => {
		const cost = calculateCost("grok-3-mini", 1000, 500);
		expect(cost).toBeCloseTo(0.00055, 6);
	});

	it("calculates Anthropic cost correctly", () => {
		const cost = calculateCost("claude-sonnet-4-5-20250929", 1000, 500);
		expect(cost).toBeCloseTo(0.0105, 6);
	});

	it("returns 0 for unknown model", () => {
		expect(calculateCost("unknown-model", 100, 50)).toBe(0);
	});
});

describe("Gemini provider", () => {
	it("streams text and usage chunks", async () => {
		const { createGeminiProvider } = await import("../providers/gemini.js");
		const provider = createGeminiProvider("test-key", "gemini-2.5-flash");
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);
		expect(chunks.some((c: any) => c.type === "usage")).toBe(true);
		expect(chunks.some((c: any) => c.type === "finish")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Hello world!");
	});
});

describe("Gemini provider function calling", () => {
	it("yields tool_use chunk when model requests a function call", async () => {
		mockGenerateContentStream.mockResolvedValueOnce({
			async *[Symbol.asyncIterator]() {
				yield {
					text: undefined,
					functionCalls: [
						{
							id: "fc-1",
							name: "execute_command",
							args: { command: "echo hello" },
						},
					],
					usageMetadata: {
						promptTokenCount: 10,
						candidatesTokenCount: 5,
					},
				};
			},
		});

		const { createGeminiProvider } = await import("../providers/gemini.js");
		const provider = createGeminiProvider("test-key", "gemini-2.5-flash");

		const tools = [
			{
				name: "execute_command",
				description: "Execute a command",
				parameters: {
					type: "object",
					properties: { command: { type: "string" } },
					required: ["command"],
				},
			},
		];

		const chunks: unknown[] = [];
		for await (const chunk of provider.stream(
			[{ role: "user", content: "echo hello 해줘" }],
			"You are Alpha.",
			tools,
		)) {
			chunks.push(chunk);
		}

		const toolUse = chunks.find((c: any) => c.type === "tool_use") as any;
		expect(toolUse).toBeDefined();
		expect(toolUse.id).toBe("fc-1");
		expect(toolUse.name).toBe("execute_command");
		expect(toolUse.args).toEqual({ command: "echo hello" });
	});

	it("passes tool definitions to Gemini API", async () => {
		const { createGeminiProvider } = await import("../providers/gemini.js");
		const provider = createGeminiProvider("test-key", "gemini-2.5-flash");

		const tools = [
			{
				name: "read_file",
				description: "Read a file",
				parameters: { type: "object", properties: {}, required: [] },
			},
		];

		const chunks: unknown[] = [];
		for await (const chunk of provider.stream(
			[{ role: "user", content: "test" }],
			"system",
			tools,
		)) {
			chunks.push(chunk);
		}

		expect(mockGenerateContentStream).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.objectContaining({
					tools: [
						{
							functionDeclarations: [
								expect.objectContaining({ name: "read_file" }),
							],
						},
					],
				}),
			}),
		);
	});

	it("handles tool result messages in conversation", async () => {
		const { createGeminiProvider } = await import("../providers/gemini.js");
		const provider = createGeminiProvider("test-key", "gemini-2.5-flash");

		const messages = [
			{ role: "user" as const, content: "파일 읽어줘" },
			{
				role: "assistant" as const,
				content: "",
				toolCalls: [
					{
						id: "fc-1",
						name: "read_file",
						args: { path: "/tmp/test.txt" },
					},
				],
			},
			{
				role: "tool" as const,
				content: "file contents here",
				toolCallId: "fc-1",
				name: "read_file",
			},
		];

		const chunks: unknown[] = [];
		for await (const chunk of provider.stream(messages, "system")) {
			chunks.push(chunk);
		}

		const call = mockGenerateContentStream.mock.calls;
		const lastCall = call[call.length - 1][0] as any;

		// Should have 3 contents: user text, model functionCall, user functionResponse
		expect(lastCall.contents).toHaveLength(3);
		expect(lastCall.contents[0].role).toBe("user");
		expect(lastCall.contents[1].role).toBe("model");
		expect(lastCall.contents[2].role).toBe("user");
	});
});

describe("xAI provider", () => {
	it("streams text and usage chunks", async () => {
		const { createXAIProvider } = await import("../providers/xai.js");
		const provider = createXAIProvider("test-key", "grok-3-mini");
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);
		expect(chunks.some((c: any) => c.type === "usage")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Grok says hi");
	});
});

describe("Anthropic provider", () => {
	it("streams text and usage chunks", async () => {
		const { createAnthropicProvider } = await import(
			"../providers/anthropic.js"
		);
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Claude here");
	});
});
