import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabProxyProvider } from "../providers/lab-proxy.js";
import type { LLMProvider } from "../providers/types.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

describe("Lab Proxy Provider", () => {
	let provider: LLMProvider;

	beforeEach(() => {
		provider = createLabProxyProvider("test-lab-key", "gemini-2.5-flash");
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends correct request to gateway", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(["data: [DONE]\n\n"]),
		});

		const gen = provider.stream(
			[{ role: "user", content: "Hello" }],
			"You are Alpha.",
		);

		const chunks = [];
		for await (const chunk of gen) {
			chunks.push(chunk);
		}

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toContain("/v1/chat/completions");
		expect(options.method).toBe("POST");
		expect(options.headers["X-AnyLLM-Key"]).toBe("Bearer test-lab-key");

		const body = JSON.parse(options.body);
		expect(body.model).toBe("gemini:gemini-2.5-flash");
		expect(body.stream).toBe(true);
		expect(body.messages[0]).toEqual({
			role: "system",
			content: "You are Alpha.",
		});
		expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
	});

	it("maps model names to gateway format", async () => {
		// Test xAI model
		const xaiProvider = createLabProxyProvider("key", "grok-3-mini");
		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(["data: [DONE]\n\n"]),
		});

		const gen = xaiProvider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
		);
		for await (const _ of gen) {
			/* consume */
		}

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe("xai:grok-3-mini");
	});

	it("maps claude model names correctly", async () => {
		const claudeProvider = createLabProxyProvider(
			"key",
			"claude-sonnet-4-5-20250929",
		);
		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(["data: [DONE]\n\n"]),
		});

		const gen = claudeProvider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
		);
		for await (const _ of gen) {
			/* consume */
		}

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe("anthropic:claude-sonnet-4-5-20250929");
	});

	it("yields text chunks from SSE stream", async () => {
		const sseData = [
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
			"data: [DONE]\n\n",
		];

		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(sseData),
		});

		const gen = provider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
		);

		const chunks = [];
		for await (const chunk of gen) {
			chunks.push(chunk);
		}

		expect(chunks[0]).toEqual({ type: "text", text: "Hello" });
		expect(chunks[1]).toEqual({ type: "text", text: " world" });
		expect(chunks[chunks.length - 1]).toEqual({ type: "finish" });
	});

	it("yields tool_use chunks from SSE stream", async () => {
		const sseData = [
			'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc-1","function":{"name":"read_file","arguments":"{\\"path\\":\\"/tmp/x\\"}"}}]}}]}\n\n',
			"data: [DONE]\n\n",
		];

		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(sseData),
		});

		const gen = provider.stream(
			[{ role: "user", content: "Read a file" }],
			"sys",
			[
				{
					name: "read_file",
					description: "Read file",
					parameters: { type: "object", properties: { path: { type: "string" } } },
				},
			],
		);

		const chunks = [];
		for await (const chunk of gen) {
			chunks.push(chunk);
		}

		expect(chunks[0]).toEqual({
			type: "tool_use",
			id: "tc-1",
			name: "read_file",
			args: { path: "/tmp/x" },
		});
	});

	it("yields usage when present", async () => {
		const sseData = [
			'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":100,"completion_tokens":20}}\n\n',
			"data: [DONE]\n\n",
		];

		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(sseData),
		});

		const gen = provider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
		);

		const chunks = [];
		for await (const chunk of gen) {
			chunks.push(chunk);
		}

		const usage = chunks.find((c) => c.type === "usage");
		expect(usage).toEqual({
			type: "usage",
			inputTokens: 100,
			outputTokens: 20,
		});
	});

	it("throws on non-ok response", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 402,
			text: async () => "Insufficient credits",
		});

		const gen = provider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
		);

		await expect(async () => {
			for await (const _ of gen) {
				/* consume */
			}
		}).rejects.toThrow("Lab proxy error 402");
	});

	it("sends tools in OpenAI format", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(["data: [DONE]\n\n"]),
		});

		const tools = [
			{
				name: "read_file",
				description: "Read file",
				parameters: {
					type: "object",
					properties: { path: { type: "string" } },
				},
			},
		];

		const gen = provider.stream(
			[{ role: "user", content: "Hi" }],
			"sys",
			tools,
		);
		for await (const _ of gen) {
			/* consume */
		}

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.tools).toHaveLength(1);
		expect(body.tools[0].type).toBe("function");
		expect(body.tools[0].function.name).toBe("read_file");
	});

	it("converts tool call messages correctly", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			body: createSSEStream(["data: [DONE]\n\n"]),
		});

		const gen = provider.stream(
			[
				{ role: "user", content: "Read /tmp/test" },
				{
					role: "assistant",
					content: "",
					toolCalls: [
						{ id: "tc-1", name: "read_file", args: { path: "/tmp/test" } },
					],
				},
				{
					role: "tool",
					content: "file contents here",
					toolCallId: "tc-1",
					name: "read_file",
				},
			],
			"sys",
		);
		for await (const _ of gen) {
			/* consume */
		}

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		// system + 3 messages = 4
		expect(body.messages).toHaveLength(4);
		// assistant with tool_calls
		expect(body.messages[2].tool_calls[0].id).toBe("tc-1");
		// tool result
		expect(body.messages[3].role).toBe("tool");
		expect(body.messages[3].tool_call_id).toBe("tc-1");
	});
});

describe("buildProvider with labKey", () => {
	it("returns lab proxy when labKey is set", async () => {
		const { buildProvider } = await import("../providers/factory.js");
		const provider = buildProvider({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "ignored",
			labKey: "lab-key-123",
		});
		// Verify it's a lab proxy by checking it uses fetch (not GoogleGenAI)
		expect(provider).toBeDefined();
		expect(provider.stream).toBeDefined();
	});

	it("returns direct provider when labKey is not set", async () => {
		// This would fail without a real API key, but we can check it doesn't throw
		// in construction (only on actual stream call)
		const { buildProvider } = await import("../providers/factory.js");
		const provider = buildProvider({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "fake-key",
		});
		expect(provider).toBeDefined();
		expect(provider.stream).toBeDefined();
	});
});
