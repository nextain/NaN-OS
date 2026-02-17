import Anthropic from "@anthropic-ai/sdk";
import type { AgentStream, LLMProvider } from "./types.js";

export function createAnthropicProvider(
	apiKey: string,
	model: string,
): LLMProvider {
	const client = new Anthropic({ apiKey });

	return {
		async *stream(messages, systemPrompt, _tools): AgentStream {
			const textMessages = messages.filter(
				(m) => m.role === "user" || m.role === "assistant",
			);
			const stream = await client.messages.create({
				model,
				max_tokens: 4096,
				temperature: 0.7,
				system: systemPrompt,
				messages: textMessages.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
				stream: true,
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const event of stream) {
				if (
					event.type === "content_block_delta" &&
					event.delta.type === "text_delta"
				) {
					yield { type: "text", text: event.delta.text };
				}
				if (event.type === "message_start" && event.message?.usage) {
					inputTokens = event.message.usage.input_tokens ?? 0;
				}
				if (event.type === "message_delta" && event.usage) {
					outputTokens =
						(event.usage as { output_tokens?: number }).output_tokens ?? 0;
				}
			}

			if (inputTokens > 0 || outputTokens > 0) {
				yield { type: "usage", inputTokens, outputTokens };
			}
			yield { type: "finish" };
		},
	};
}
