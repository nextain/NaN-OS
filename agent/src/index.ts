import * as readline from "node:readline";
import { GatewayClient } from "./gateway/client.js";
import { GATEWAY_TOOLS, executeTool } from "./gateway/tool-bridge.js";
import { type ChatRequest, parseRequest } from "./protocol.js";
import { calculateCost } from "./providers/cost.js";
import { buildProvider } from "./providers/factory.js";
import type { ChatMessage, StreamChunk } from "./providers/types.js";
import { ALPHA_SYSTEM_PROMPT } from "./system-prompt.js";
import { synthesizeSpeech } from "./tts/google-tts.js";

const activeStreams = new Map<string, AbortController>();

const EMOTION_TAG_RE = /^\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/i;
const MAX_TOOL_ITERATIONS = 10;

function writeLine(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data)}\n`);
}

export async function handleChatRequest(req: ChatRequest): Promise<void> {
	const {
		requestId,
		provider: providerConfig,
		messages: rawMessages,
		systemPrompt,
		ttsVoice,
		ttsApiKey,
		enableTools,
		gatewayUrl,
		gatewayToken,
	} = req;
	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	let gateway: GatewayClient | null = null;

	try {
		const provider = buildProvider(providerConfig);
		const effectiveSystemPrompt = systemPrompt ?? ALPHA_SYSTEM_PROMPT;
		const tools =
			enableTools && gatewayUrl ? GATEWAY_TOOLS : undefined;

		// Connect to Gateway if tools enabled
		if (enableTools && gatewayUrl) {
			gateway = new GatewayClient();
			await gateway.connect(gatewayUrl, gatewayToken || "");
		}

		// Build conversation messages
		const chatMessages: ChatMessage[] = rawMessages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		let fullText = "";
		let totalInputTokens = 0;
		let totalOutputTokens = 0;

		// Tool call loop
		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
			if (controller.signal.aborted) break;

			const stream = provider.stream(
				chatMessages,
				effectiveSystemPrompt,
				tools,
			);

			const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];

			for await (const chunk of stream) {
				if (controller.signal.aborted) break;

				if (chunk.type === "text") {
					fullText += chunk.text;
					writeLine({ type: "text", requestId, text: chunk.text });
				} else if (chunk.type === "tool_use") {
					toolCalls.push({
						id: chunk.id,
						name: chunk.name,
						args: chunk.args,
					});
					writeLine({
						type: "tool_use",
						requestId,
						toolCallId: chunk.id,
						toolName: chunk.name,
						args: chunk.args,
					});
				} else if (chunk.type === "usage") {
					totalInputTokens += chunk.inputTokens;
					totalOutputTokens += chunk.outputTokens;
				}
			}

			// No tool calls — done
			if (toolCalls.length === 0 || !gateway) break;

			// Add assistant's tool call message to conversation
			chatMessages.push({
				role: "assistant",
				content: "",
				toolCalls: toolCalls.map((tc) => ({
					id: tc.id,
					name: tc.name,
					args: tc.args,
				})),
			});

			// Execute each tool and add results
			for (const call of toolCalls) {
				const result = await executeTool(gateway, call.name, call.args);
				writeLine({
					type: "tool_result",
					requestId,
					toolCallId: call.id,
					toolName: call.name,
					output: result.output || result.error || "",
					success: result.success,
				});
				chatMessages.push({
					role: "tool",
					content: result.success
						? result.output
						: `Error: ${result.error}`,
					toolCallId: call.id,
					name: call.name,
				});
			}
		}

		// TTS synthesis — only when ttsVoice is set
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

		// Send usage + finish
		if (totalInputTokens > 0 || totalOutputTokens > 0) {
			const cost = calculateCost(
				providerConfig.model,
				totalInputTokens,
				totalOutputTokens,
			);
			writeLine({
				type: "usage",
				requestId,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				cost,
				model: providerConfig.model,
			});
		}
		writeLine({ type: "finish", requestId });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		writeLine({ type: "error", requestId, message });
	} finally {
		if (gateway) {
			gateway.close();
		}
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
