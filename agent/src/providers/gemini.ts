import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { AgentStream, ChatMessage, LLMProvider, ToolDefinition } from "./types.js";

function toGeminiContents(messages: ChatMessage[]) {
	return messages.map((m) => {
		if (m.toolCalls && m.toolCalls.length > 0) {
			return {
				role: "model",
				parts: m.toolCalls.map((tc) => ({
					functionCall: { id: tc.id, name: tc.name, args: tc.args },
				})),
			};
		}
		if (m.role === "tool") {
			return {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: m.toolCallId,
							name: m.name,
							response: { output: m.content },
						},
					},
				],
			};
		}
		return {
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.content }],
		};
	});
}

export function createGeminiProvider(
	apiKey: string,
	model: string,
): LLMProvider {
	const client = new GoogleGenAI({ apiKey });

	return {
		async *stream(messages, systemPrompt, tools): AgentStream {
			const contents = toGeminiContents(messages);

			const geminiTools = tools
				? [
						{
							functionDeclarations: tools.map((t) => ({
								name: t.name,
								description: t.description,
								parameters: t.parameters,
							})),
						},
					]
				: undefined;

			const response = await client.models.generateContentStream({
				model,
				contents,
				config: {
					systemInstruction: systemPrompt,
					temperature: 0.7,
					tools: geminiTools,
					toolConfig: geminiTools
						? { functionCallingConfig: { mode: "AUTO" as any } }
						: undefined,
				},
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const chunk of response) {
				const text = chunk.text;
				if (text) {
					yield { type: "text", text };
				}

				const functionCalls = chunk.functionCalls;
				if (functionCalls) {
					for (const fc of functionCalls) {
						yield {
							type: "tool_use",
							id: fc.id || randomUUID(),
							name: fc.name || "unknown",
							args: fc.args || {},
						};
					}
				}

				if (chunk.usageMetadata) {
					inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
					outputTokens =
						chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
				}
			}

			if (inputTokens > 0 || outputTokens > 0) {
				yield { type: "usage", inputTokens, outputTokens };
			}
			yield { type: "finish" };
		},
	};
}
