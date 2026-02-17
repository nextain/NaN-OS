import OpenAI from "openai";
import type { AgentStream, LLMProvider } from "./types.js";

export function createXAIProvider(apiKey: string, model: string): LLMProvider {
	const client = new OpenAI({
		baseURL: "https://api.x.ai/v1",
		apiKey,
	});

	return {
		async *stream(messages, systemPrompt, _tools): AgentStream {
			const textMessages = messages.filter((m) => m.role !== "tool");
			const stream = await client.chat.completions.create({
				model,
				temperature: 0.7,
				messages: [
					{ role: "system", content: systemPrompt },
					...textMessages.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					})),
				],
				stream: true,
				stream_options: { include_usage: true },
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta;
				if (delta?.content) {
					yield { type: "text", text: delta.content };
				}
				if (chunk.usage) {
					inputTokens = chunk.usage.prompt_tokens ?? 0;
					outputTokens = chunk.usage.completion_tokens ?? 0;
				}
			}

			if (inputTokens > 0 || outputTokens > 0) {
				yield { type: "usage", inputTokens, outputTokens };
			}
			yield { type: "finish" };
		},
	};
}
