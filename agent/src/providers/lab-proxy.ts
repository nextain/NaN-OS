/**
 * Lab Proxy Provider — routes LLM calls through any-llm Gateway (GCP).
 * Uses OpenAI-compatible chat completions API with X-AnyLLM-Key auth.
 */
import type {
	AgentStream,
	ChatMessage,
	LLMProvider,
	StreamChunk,
	ToolDefinition,
} from "./types.js";

export const GATEWAY_URL =
	"https://cafelua-gateway-789741003661.asia-northeast3.run.app";

/** Map local model names to gateway format (provider:model) */
function toGatewayModel(model: string): string {
	if (model.startsWith("gemini")) return `gemini:${model}`;
	if (model.startsWith("grok")) return `xai:${model}`;
	if (model.startsWith("claude")) return `anthropic:${model}`;
	return model;
}

function toOpenAIMessages(
	messages: ChatMessage[],
	systemPrompt: string,
): unknown[] {
	const result: unknown[] = [{ role: "system", content: systemPrompt }];
	for (const m of messages) {
		if (m.toolCalls && m.toolCalls.length > 0) {
			result.push({
				role: "assistant",
				content: m.content || null,
				tool_calls: m.toolCalls.map((tc) => ({
					id: tc.id,
					type: "function",
					function: { name: tc.name, arguments: JSON.stringify(tc.args) },
				})),
			});
		} else if (m.role === "tool") {
			result.push({
				role: "tool",
				tool_call_id: m.toolCallId,
				content: m.content,
			});
		} else {
			result.push({ role: m.role, content: m.content });
		}
	}
	return result;
}

function toOpenAITools(
	tools: ToolDefinition[],
): { type: "function"; function: unknown }[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

export function createLabProxyProvider(
	labKey: string,
	model: string,
): LLMProvider {
	return {
		async *stream(messages, systemPrompt, tools, signal): AgentStream {
			const body: Record<string, unknown> = {
				model: toGatewayModel(model),
				messages: toOpenAIMessages(messages, systemPrompt),
				stream: true,
				stream_options: { include_usage: true },
			};
			if (tools && tools.length > 0) {
				body.tools = toOpenAITools(tools);
			}

			const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-AnyLLM-Key": `Bearer ${labKey}`,
				},
				body: JSON.stringify(body),
				signal,
			});

			if (!res.ok) {
				const errText = await res.text().catch(() => "");
				throw new Error(
					`Lab proxy error ${res.status}: ${errText.slice(0, 200)}`,
				);
			}

			if (!res.body) {
				throw new Error("Lab proxy: no response body");
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let totalInput = 0;
			let totalOutput = 0;

			// Accumulate tool call arguments across multiple SSE chunks
			const pendingToolCalls = new Map<
				number,
				{ id: string; name: string; args: string }
			>();

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed.startsWith("data: ")) continue;
						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						let parsed: Record<string, unknown>;
						try {
							parsed = JSON.parse(data);
						} catch {
							continue;
						}

						const choices = parsed.choices as
							| { delta?: Record<string, unknown> }[]
							| undefined;
						if (!choices?.[0]?.delta) continue;
						const delta = choices[0].delta;

						// Text content
						if (delta.content && typeof delta.content === "string") {
							yield { type: "text", text: delta.content } satisfies StreamChunk;
						}

						// Tool calls — accumulate arguments across chunks
						const toolCalls = delta.tool_calls as
							| {
									index: number;
									id?: string;
									function?: { name?: string; arguments?: string };
							  }[]
							| undefined;
						if (toolCalls) {
							for (const tc of toolCalls) {
								const existing = pendingToolCalls.get(tc.index);
								if (tc.id && tc.function?.name) {
									// First chunk for this tool call
									pendingToolCalls.set(tc.index, {
										id: tc.id,
										name: tc.function.name,
										args: tc.function.arguments ?? "",
									});
								} else if (existing && tc.function?.arguments) {
									// Continuation chunk — append arguments
									existing.args += tc.function.arguments;
								}
							}
						}

						// Usage info
						const usage = parsed.usage as
							| {
									prompt_tokens?: number;
									completion_tokens?: number;
							  }
							| undefined;
						if (usage) {
							totalInput = usage.prompt_tokens ?? totalInput;
							totalOutput = usage.completion_tokens ?? totalOutput;
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			// Emit accumulated tool calls
			for (const tc of pendingToolCalls.values()) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(tc.args || "{}");
				} catch {
					// malformed JSON — emit empty args
				}
				yield {
					type: "tool_use",
					id: tc.id,
					name: tc.name,
					args,
				} satisfies StreamChunk;
			}

			// Emit usage
			if (totalInput > 0 || totalOutput > 0) {
				yield {
					type: "usage",
					inputTokens: totalInput,
					outputTokens: totalOutput,
				} satisfies StreamChunk;
			}

			yield { type: "finish" } satisfies StreamChunk;
		},
	};
}
