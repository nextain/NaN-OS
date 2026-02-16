import * as readline from "node:readline";
import { type ChatRequest, parseRequest } from "./protocol.js";
import { calculateCost } from "./providers/cost.js";
import { buildProvider } from "./providers/factory.js";
import { ALPHA_SYSTEM_PROMPT } from "./system-prompt.js";
import { synthesizeSpeech } from "./tts/google-tts.js";

const activeStreams = new Map<string, AbortController>();

const EMOTION_TAG_RE = /^\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/i;

function writeLine(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data)}\n`);
}

export async function handleChatRequest(req: ChatRequest): Promise<void> {
	const {
		requestId,
		provider: providerConfig,
		messages,
		systemPrompt,
		ttsVoice,
		ttsApiKey,
	} = req;
	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	try {
		const provider = buildProvider(providerConfig);
		const stream = provider.stream(
			messages,
			systemPrompt ?? ALPHA_SYSTEM_PROMPT,
		);

		let fullText = "";
		let usageData: { inputTokens: number; outputTokens: number } | null = null;

		for await (const chunk of stream) {
			if (controller.signal.aborted) break;

			if (chunk.type === "text") {
				fullText += chunk.text;
				writeLine({ type: "text", requestId, text: chunk.text });
			} else if (chunk.type === "usage") {
				usageData = {
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
				};
			}
		}

		// TTS synthesis — only when ttsVoice is set (client controls enable/disable)
		const googleKey = ttsVoice
			? ttsApiKey ||
				(providerConfig.provider === "gemini" ? providerConfig.apiKey : null)
			: null;
		if (googleKey && fullText.trim()) {
			const cleanText = fullText.replace(EMOTION_TAG_RE, "");
			try {
				const audio = await synthesizeSpeech(cleanText, googleKey, ttsVoice);
				if (audio) {
					writeLine({ type: "audio", requestId, data: audio });
				}
			} catch {
				// TTS failure is non-critical
			}
		}

		// Send usage + finish after TTS
		if (usageData) {
			const cost = calculateCost(
				providerConfig.model,
				usageData.inputTokens,
				usageData.outputTokens,
			);
			writeLine({
				type: "usage",
				requestId,
				inputTokens: usageData.inputTokens,
				outputTokens: usageData.outputTokens,
				cost,
				model: providerConfig.model,
			});
		}
		writeLine({ type: "finish", requestId });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		writeLine({ type: "error", requestId, message });
	} finally {
		activeStreams.delete(requestId);
	}
}

function main(): void {
	const rl = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});

	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		const request = parseRequest(trimmed);
		if (!request) {
			writeLine({
				type: "error",
				requestId: "unknown",
				message: "Invalid request",
			});
			return;
		}

		if (request.type === "cancel_stream") {
			const controller = activeStreams.get(request.requestId);
			if (controller) {
				controller.abort();
				activeStreams.delete(request.requestId);
			}
			return;
		}

		if (request.type === "chat_request") {
			handleChatRequest(request);
		}
	});

	rl.on("close", () => {
		process.exit(0);
	});

	// Signal readiness
	writeLine({ type: "ready" });
}

main();
