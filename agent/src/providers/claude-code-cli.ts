import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type {
	AgentStream,
	ChatMessage,
	LLMProvider,
	ToolDefinition,
} from "./types.js";

type ClaudeCodeChunk = {
	type: string;
	subtype?: string;
	message?: {
		content?: Array<
			| { type: "text"; text?: string }
			| { type: "thinking"; thinking?: string }
			| { type: "tool_use"; id?: string; name?: string; input?: unknown }
			| { type: string; [key: string]: unknown }
		>;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
		};
	};
};

const CLAUDE_CODE_TIMEOUT_MS = 600_000;

// Keep Claude Code from executing local tools directly.
const DISALLOWED_TOOLS = [
	"Task",
	"Bash",
	"Glob",
	"Grep",
	"LS",
	"Read",
	"Edit",
	"MultiEdit",
	"Write",
	"NotebookRead",
	"NotebookEdit",
	"WebFetch",
	"TodoRead",
	"TodoWrite",
	"WebSearch",
].join(",");

function toClaudeMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
	const result: Array<Record<string, unknown>> = [];
	for (const m of messages) {
		if (m.toolCalls && m.toolCalls.length > 0) {
			result.push({
				role: "assistant",
				content: m.toolCalls.map((tc) => ({
					type: "tool_use",
					id: tc.id,
					name: tc.name,
					input: tc.args,
				})),
			});
			continue;
		}

		if (m.role === "tool") {
			result.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: m.toolCallId,
						content: m.content,
					},
				],
			});
			continue;
		}

		result.push({
			role: m.role === "assistant" ? "assistant" : "user",
			content: m.content,
		});
	}
	return result;
}

export function createClaudeCodeCliProvider(model: string): LLMProvider {
	return {
		async *stream(messages, systemPrompt, tools, signal): AgentStream {
			const cliPath = process.env.CLAUDE_CODE_PATH || "claude";
			const args = [
				"--system-prompt",
				systemPrompt,
				"--verbose",
				"--output-format",
				"stream-json",
				"--disallowedTools",
				DISALLOWED_TOOLS,
				"--max-turns",
				"1",
				"--model",
				model,
				"-p",
			];

			const env = { ...process.env };
			delete env.ANTHROPIC_API_KEY;

			const child = spawn(cliPath, args, {
				stdio: ["pipe", "pipe", "pipe"],
				env,
			});

			let stderr = "";
			let inputTokens = 0;
			let outputTokens = 0;
			let processExited = false;

			const onAbort = () => {
				if (!child.killed) child.kill("SIGTERM");
			};
			signal?.addEventListener("abort", onAbort);

			try {
				if (!child.stdin || !child.stdout || !child.stderr) {
					throw new Error("Failed to start Claude Code CLI stdio pipes.");
				}

				child.stderr.setEncoding("utf8");
				child.stderr.on("data", (chunk: string) => {
					stderr += chunk;
				});

				const exitPromise = new Promise<number>((resolve, reject) => {
					child.on("error", (err) => reject(err));
					child.on("close", (code) => {
						processExited = true;
						resolve(code ?? -1);
					});
				});

				const payload = JSON.stringify(toClaudeMessages(messages));
				child.stdin.write(payload);
				child.stdin.end();

				child.stdout.setEncoding("utf8");
				let buffer = "";

				for await (const rawChunk of child.stdout) {
					if (signal?.aborted) break;

					buffer += String(rawChunk);
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;

						let chunk: ClaudeCodeChunk | null = null;
						try {
							chunk = JSON.parse(trimmed) as ClaudeCodeChunk;
						} catch {
							continue;
						}
						if (!chunk) continue;

							if (chunk.type === "assistant" && chunk.message) {
							const usage = chunk.message.usage;
							if (usage) {
								inputTokens = usage.input_tokens ?? inputTokens;
								outputTokens = usage.output_tokens ?? outputTokens;
							}

								for (const c of chunk.message.content ?? []) {
									if (c.type === "text" && typeof c.text === "string") {
										yield { type: "text", text: c.text };
									} else if (c.type === "tool_use") {
										const toolId =
											typeof c.id === "string" && c.id.length > 0
												? c.id
												: randomUUID();
										const toolName =
											typeof c.name === "string" && c.name.length > 0
												? c.name
												: "unknown";
										yield {
											type: "tool_use",
											id: toolId,
											name: toolName,
										args:
											c.input && typeof c.input === "object"
												? (c.input as Record<string, unknown>)
												: {},
									};
								}
							}
						}
					}
				}

				const timeoutPromise = new Promise<number>((resolve) =>
					setTimeout(() => resolve(-999), CLAUDE_CODE_TIMEOUT_MS),
				);
				const exitCode = await Promise.race([exitPromise, timeoutPromise]);
				if (exitCode === -999) {
					if (!child.killed) child.kill("SIGTERM");
					throw new Error("Claude Code CLI timed out.");
				}
				if (exitCode !== 0) {
					const errMsg = stderr.trim();
					if (errMsg.includes("ENOENT")) {
						throw new Error(
							"Claude Code CLI not found. Install `claude` or set CLAUDE_CODE_PATH.",
						);
					}
					throw new Error(
						errMsg || `Claude Code CLI exited with code ${String(exitCode)}.`,
					);
				}

				if (inputTokens > 0 || outputTokens > 0) {
					yield { type: "usage", inputTokens, outputTokens };
				}
				yield { type: "finish" };
			} finally {
				signal?.removeEventListener("abort", onAbort);
				if (!processExited && !child.killed) {
					child.kill("SIGTERM");
				}
			}
		},
	};
}
