import { PassThrough } from "node:stream";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { StreamChunk } from "../types.js";

// Hoisted mocks
const { mockSpawn } = vi.hoisted(() => ({
	mockSpawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: mockSpawn,
}));

/** Helper: create a fake child process with controllable stdout/stderr */
function createFakeChild() {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new PassThrough();
	const child = {
		stdout,
		stderr,
		stdin,
		killed: false,
		pid: 12345,
		kill: vi.fn(() => {
			child.killed = true;
		}),
		on: vi.fn(),
	};
	return child;
}

/** Helper: emit lines on child stdout then close + trigger exit */
function feedChildAndExit(
	child: ReturnType<typeof createFakeChild>,
	lines: string[],
	exitCode = 0,
) {
	for (const line of lines) {
		child.stdout.write(`${line}\n`);
	}
	child.stdout.end();

	// Trigger "close" event
	const closeHandler = child.on.mock.calls.find(
		(c: unknown[]) => c[0] === "close",
	);
	if (closeHandler) closeHandler[1](exitCode);
}

/** Helper: trigger spawn error + close */
function triggerSpawnError(
	child: ReturnType<typeof createFakeChild>,
	code: string,
	message: string,
) {
	// End stdout first so readline finishes
	child.stdout.end();

	const errorHandler = child.on.mock.calls.find(
		(c: unknown[]) => c[0] === "error",
	);
	if (errorHandler) {
		const err = new Error(message) as NodeJS.ErrnoException;
		err.code = code;
		errorHandler[1](err);
	}

	const closeHandler = child.on.mock.calls.find(
		(c: unknown[]) => c[0] === "close",
	);
	if (closeHandler) closeHandler[1](1);
}

/** Helper: collect all chunks from the provider stream */
async function collectChunks(
	provider: import("../types.js").LLMProvider,
	messages: import("../types.js").ChatMessage[],
	systemPrompt: string,
	tools?: import("../types.js").ToolDefinition[],
	signal?: AbortSignal,
): Promise<StreamChunk[]> {
	const chunks: StreamChunk[] = [];
	for await (const chunk of provider.stream(
		messages,
		systemPrompt,
		tools,
		signal,
	)) {
		chunks.push(chunk);
	}
	return chunks;
}

describe("claude-code-cli provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.CLAUDE_CODE_PATH;
		delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
		delete process.env.MAX_THINKING_TOKENS;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("text response parsing", () => {
		it("parses system(init) → assistant(text) → result → yields text + usage + finish", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "Hello" }],
				"You are Naia.",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "system",
					subtype: "init",
					apiKeySource: "env",
					cwd: "/tmp",
					sessionId: "sess-1",
				}),
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "Hello! I'm Naia." }],
						usage: { input_tokens: 100, output_tokens: 50 },
						stop_reason: "end_turn",
					},
				}),
				JSON.stringify({
					type: "result",
					total_cost_usd: 0.003,
					is_error: false,
				}),
			]);

			const chunks = await streamPromise;

			const textChunks = chunks.filter((c) => c.type === "text");
			expect(textChunks).toHaveLength(1);
			expect((textChunks[0] as { text: string }).text).toBe(
				"Hello! I'm Naia.",
			);

			const usageChunks = chunks.filter((c) => c.type === "usage");
			expect(usageChunks).toHaveLength(1);
			const usage = usageChunks[0] as {
				inputTokens: number;
				outputTokens: number;
			};
			expect(usage.inputTokens).toBe(100);
			expect(usage.outputTokens).toBe(50);

			expect(chunks.some((c) => c.type === "finish")).toBe(true);
		});
	});

	describe("tool_use parsing", () => {
		it("yields tool_use chunk with id, name, and args", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "Read file" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "tool-abc",
								name: "execute_command",
								input: { command: "ls -la" },
							},
						],
						usage: { input_tokens: 50, output_tokens: 20 },
					},
				}),
				JSON.stringify({
					type: "result",
					total_cost_usd: 0.001,
					is_error: false,
				}),
			]);

			const chunks = await streamPromise;
			const toolUse = chunks.find((c) => c.type === "tool_use") as {
				type: "tool_use";
				id: string;
				name: string;
				args: Record<string, unknown>;
			};

			expect(toolUse).toBeDefined();
			expect(toolUse.id).toBe("tool-abc");
			expect(toolUse.name).toBe("execute_command");
			expect(toolUse.args).toEqual({ command: "ls -la" });
		});

		it("generates UUID for tool_use without id", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								name: "read_file",
								input: { path: "/tmp/test" },
							},
						],
						usage: { input_tokens: 10, output_tokens: 5 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			const chunks = await streamPromise;
			const toolUse = chunks.find((c) => c.type === "tool_use") as {
				type: "tool_use";
				id: string;
			};
			expect(toolUse).toBeDefined();
			expect(toolUse.id).toBeTruthy();
			expect(toolUse.id.length).toBeGreaterThan(0);
		});
	});

	describe("thinking blocks", () => {
		it("yields thinking content as thinking chunk", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "Think about this" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{
								type: "thinking",
								thinking: "Let me consider the problem...",
							},
							{ type: "text", text: "Here is my answer." },
						],
						usage: { input_tokens: 30, output_tokens: 40 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			const chunks = await streamPromise;
			const thinkingChunks = chunks.filter((c) => c.type === "thinking");
			expect(thinkingChunks).toHaveLength(1);
			expect((thinkingChunks[0] as { text: string }).text).toBe(
				"Let me consider the problem...",
			);
			const textChunks = chunks.filter((c) => c.type === "text");
			expect(textChunks).toHaveLength(1);
			expect((textChunks[0] as { text: string }).text).toBe(
				"Here is my answer.",
			);
		});

		it("yields redacted_thinking as indicator", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{ type: "redacted_thinking", data: "REDACTED" },
							{ type: "text", text: "Visible text." },
						],
						usage: { input_tokens: 10, output_tokens: 10 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			const chunks = await streamPromise;
			const thinkingChunks = chunks.filter((c) => c.type === "thinking");
			expect(thinkingChunks).toHaveLength(1);
			expect((thinkingChunks[0] as { text: string }).text).toBe("[Redacted thinking block]");
			const textChunks = chunks.filter((c) => c.type === "text");
			expect(textChunks).toHaveLength(1);
			expect((textChunks[0] as { text: string }).text).toBe("Visible text.");
		});
	});

	describe("error handling", () => {
		it("throws on error message type", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "error",
					error: { message: "Something went wrong" },
				}),
			]);

			await expect(streamPromise).rejects.toThrow("Something went wrong");
		});

		it("throws on API Error in content text", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{
								type: "text",
								text: "API Error: 429 Rate limit exceeded",
							},
						],
						usage: { input_tokens: 5, output_tokens: 5 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: true }),
			]);

			await expect(streamPromise).rejects.toThrow("API Error");
		});

		it("throws with helpful message on ENOENT (CLI not found)", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			triggerSpawnError(child, "ENOENT", "spawn claude ENOENT");

			await expect(streamPromise).rejects.toThrow(/Claude Code CLI not found/);
		});

		it("throws with helpful message on E2BIG", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			triggerSpawnError(child, "E2BIG", "spawn E2BIG");

			await expect(streamPromise).rejects.toThrow(/too large|E2BIG/i);
		});

		it("throws on non-zero exit code with stderr", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			child.stderr.write("Some internal error\n");
			child.stdout.end();

			const closeHandler = child.on.mock.calls.find(
				(c: unknown[]) => c[0] === "close",
			);
			if (closeHandler) closeHandler[1](1);

			await expect(streamPromise).rejects.toThrow("Some internal error");
		});
	});

	describe("system-prompt-file", () => {
		it("uses --system-prompt-file for prompts > 64KB", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const longPrompt = "x".repeat(66_000); // > 64KB (65536)

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				longPrompt,
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "ok" }],
						usage: { input_tokens: 10, output_tokens: 2 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			await streamPromise;

			// Verify spawn was called with --system-prompt-file flag (not --system-prompt)
			const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--system-prompt-file");
			expect(spawnArgs).not.toContain("--system-prompt");

			// The file path should contain "claude-system-prompt"
			const fileIdx = spawnArgs.indexOf("--system-prompt-file");
			expect(spawnArgs[fileIdx + 1]).toContain("claude-system-prompt");
		});

		it("uses --system-prompt for prompts <= 64KB", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"Short system prompt",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "ok" }],
						usage: { input_tokens: 10, output_tokens: 2 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			await streamPromise;

			const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--system-prompt");
			expect(spawnArgs).not.toContain("--system-prompt-file");
		});
	});

	describe("AbortSignal", () => {
		it("kills child process when signal is aborted", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const controller = new AbortController();

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
				undefined,
				controller.signal,
			);

			// Abort after a tick
			setTimeout(() => {
				controller.abort();
				child.stdout.end();
				const closeHandler = child.on.mock.calls.find(
					(c: unknown[]) => c[0] === "close",
				);
				if (closeHandler) closeHandler[1](0);
			}, 10);

			const chunks = await streamPromise;
			expect(child.kill).toHaveBeenCalled();
		});
	});

	describe("ENV variables", () => {
		it("removes ANTHROPIC_API_KEY and sets telemetry env vars", async () => {
			process.env.ANTHROPIC_API_KEY = "sk-secret";

			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "ok" }],
						usage: { input_tokens: 1, output_tokens: 1 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			await streamPromise;

			const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<
				string,
				string
			>;
			expect(spawnEnv.ANTHROPIC_API_KEY).toBeUndefined();
			expect(spawnEnv.CLAUDECODE).toBeUndefined();
			expect(spawnEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");

			delete process.env.ANTHROPIC_API_KEY;
		});
	});

	describe("usage tracking", () => {
		it("uses latest usage values from assistant messages", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "Part 1. " }],
						usage: { input_tokens: 50, output_tokens: 20 },
					},
				}),
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "Part 2." }],
						usage: { input_tokens: 60, output_tokens: 30 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			const chunks = await streamPromise;
			const usageChunks = chunks.filter((c) => c.type === "usage");
			expect(usageChunks).toHaveLength(1);
			const usage = usageChunks[0] as {
				inputTokens: number;
				outputTokens: number;
			};
			expect(usage.inputTokens).toBe(60);
			expect(usage.outputTokens).toBe(30);
		});

		it("handles cache token info in usage", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const streamPromise = collectChunks(
				provider,
				[{ role: "user", content: "test" }],
				"system",
			);

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "cached" }],
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_read_input_tokens: 80,
							cache_creation_input_tokens: 20,
						},
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			const chunks = await streamPromise;
			const usage = chunks.find((c) => c.type === "usage") as {
				inputTokens: number;
				outputTokens: number;
			};
			expect(usage.inputTokens).toBe(100);
			expect(usage.outputTokens).toBe(50);
		});
	});

	describe("toClaudeMessages", () => {
		it("converts user/assistant messages correctly", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const messages = [
				{ role: "user" as const, content: "Hello" },
				{ role: "assistant" as const, content: "Hi there" },
				{ role: "user" as const, content: "How are you?" },
			];

			const streamPromise = collectChunks(provider, messages, "system");

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "fine" }],
						usage: { input_tokens: 10, output_tokens: 5 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			await streamPromise;
			expect(mockSpawn).toHaveBeenCalled();
		});

		it("converts toolCalls to tool_use messages", async () => {
			const child = createFakeChild();
			mockSpawn.mockReturnValue(child);

			const { createClaudeCodeCliProvider } = await import(
				"../claude-code-cli.js"
			);
			const provider = createClaudeCodeCliProvider("claude-sonnet-4-5-20250929");

			const messages = [
				{ role: "user" as const, content: "run ls" },
				{
					role: "assistant" as const,
					content: "",
					toolCalls: [
						{
							id: "tc-1",
							name: "execute_command",
							args: { command: "ls" },
						},
					],
				},
				{
					role: "tool" as const,
					content: "file1.txt\nfile2.txt",
					toolCallId: "tc-1",
					name: "execute_command",
				},
			];

			const streamPromise = collectChunks(provider, messages, "system");

			feedChildAndExit(child, [
				JSON.stringify({
					type: "assistant",
					message: {
						content: [{ type: "text", text: "done" }],
						usage: { input_tokens: 10, output_tokens: 5 },
					},
				}),
				JSON.stringify({ type: "result", total_cost_usd: 0, is_error: false }),
			]);

			await streamPromise;
			expect(mockSpawn).toHaveBeenCalled();
		});
	});
});
