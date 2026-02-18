import { Logger } from "./logger";
import type { MessageRow } from "./db";
import type { ProviderId } from "./types";

/** Summarize a list of messages into 2-3 sentences using LLM API */
export async function summarizeSession(
	messages: MessageRow[],
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<string> {
	if (messages.length === 0) return "";

	const conversationText = messages
		.map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
		.join("\n");

	const prompt = `Summarize this conversation in 2-3 sentences in the same language as the conversation. Focus on key topics discussed and any decisions made.\n\n${conversationText}`;

	try {
		return await callLlmApi(prompt, apiKey, provider, model);
	} catch (err) {
		Logger.warn("memory-processor", "Summarization failed", {
			error: String(err),
		});
		return "";
	}
}

/** Extract key facts from messages + summary using LLM API */
export async function extractFacts(
	messages: MessageRow[],
	summary: string,
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<Array<{ key: string; value: string }>> {
	if (messages.length === 0) return [];

	const conversationText = messages
		.map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
		.join("\n")
		.slice(0, 3000);

	const prompt = `Extract key facts about the user from this conversation. Return ONLY a JSON array of {"key": "...", "value": "..."} objects. Focus on: user preferences, personal info they shared, important decisions. If no facts, return [].

Summary: ${summary}

Conversation:
${conversationText}`;

	try {
		const response = await callLlmApi(prompt, apiKey, provider, model);
		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];
		return JSON.parse(jsonMatch[0]);
	} catch (err) {
		Logger.warn("memory-processor", "Fact extraction failed", {
			error: String(err),
		});
		return [];
	}
}

/** Generic LLM API call (supports gemini, xai, anthropic) */
async function callLlmApi(
	prompt: string,
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<string> {
	switch (provider) {
		case "gemini":
			return callGemini(prompt, apiKey, model || "gemini-2.5-flash");
		case "xai":
			return callOpenAICompat(
				prompt,
				apiKey,
				"https://api.x.ai/v1/chat/completions",
				model || "grok-3-mini",
			);
		case "anthropic":
			return callAnthropic(
				prompt,
				apiKey,
				model || "claude-sonnet-4-5-20250929",
			);
		default:
			throw new Error(`Unsupported provider: ${provider}`);
	}
}

async function callGemini(
	prompt: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: { maxOutputTokens: 256, temperature: 0.3 },
		}),
	});
	if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
	const data = await res.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAICompat(
	prompt: string,
	apiKey: string,
	baseUrl: string,
	model: string,
): Promise<string> {
	const res = await fetch(baseUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
			max_tokens: 256,
			temperature: 0.3,
		}),
	});
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(
	prompt: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			max_tokens: 256,
			messages: [{ role: "user", content: prompt }],
		}),
	});
	if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
	const data = await res.json();
	return data.content?.[0]?.text || "";
}
