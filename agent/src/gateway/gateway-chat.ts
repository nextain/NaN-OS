/**
 * Route chat messages through the Gateway's chat.send RPC.
 *
 * Flow (confirmed via E2E):
 * 1. gateway.request("chat.send", { message, sessionKey, idempotencyKey })
 *    → { runId, status: "started" }
 *    - sessionKey is REQUIRED (defaults to "agent:main:main")
 *    - idempotencyKey is REQUIRED (auto-generated UUID)
 * 2. Gateway pushes events:
 *    - event:"agent" stream:"lifecycle" data.phase:"start"
 *    - event:"agent" stream:"assistant" data.text (delta text)
 *    - event:"chat"  state:"delta"  message.content[0].text
 *    - event:"agent" stream:"lifecycle" data.phase:"end"
 *    - event:"chat"  state:"final"  message.content[0].text (final response)
 * 3. We listen for events, emit text deltas via writeLine, and resolve on "end"/"final".
 *
 * If chat.send is unavailable, falls back to agent → agent.wait → transcript.
 */
import { randomUUID } from "node:crypto";
import type { GatewayClient } from "./client.js";
import type { GatewayEvent } from "./types.js";

export interface GatewayChatOptions {
	message: string;
	sessionKey?: string;
	requestId: string;
	writeLine: (data: unknown) => void;
	signal?: AbortSignal;
}

interface ChatSendPayload {
	runId: string;
	status?: string;
}

interface TranscriptPayload {
	messages: Array<{ role: string; content: string }>;
}

const CHAT_TIMEOUT_MS = 180_000;
const DEFAULT_SESSION_KEY = "agent:main:main";

/**
 * Send a chat message via the Gateway and return the response via writeLine.
 *
 * Tries chat.send (streaming) first. Falls back to agent (batch).
 */
export async function handleChatViaGateway(
	client: GatewayClient,
	options: GatewayChatOptions,
): Promise<void> {
	const methods = new Set(client.availableMethods);

	if (methods.has("chat.send")) {
		return handleChatStreaming(client, options);
	}

	if (methods.has("agent") && methods.has("agent.wait")) {
		return handleChatBatch(client, options);
	}

	throw new Error("Gateway does not support chat.send or agent methods");
}

/**
 * Streaming path: chat.send → event stream → writeLine
 *
 * Gateway events (confirmed via E2E):
 * - event:"agent" stream:"assistant" → data.delta contains text chunks
 * - event:"agent" stream:"lifecycle" data.phase:"end" → agent finished
 * - event:"chat" state:"final" → final message (also signals completion)
 */
async function handleChatStreaming(
	client: GatewayClient,
	options: GatewayChatOptions,
): Promise<void> {
	const { message, requestId, writeLine, signal } = options;
	const sessionKey = options.sessionKey || DEFAULT_SESSION_KEY;
	const idempotencyKey = randomUUID();

	// 1. Send chat request
	const result = (await client.request("chat.send", {
		message,
		sessionKey,
		idempotencyKey,
	})) as ChatSendPayload;

	const runId = result.runId;

	// 2. Listen for streaming events
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let emittedText = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				writeLine({ type: "error", requestId, message: "Gateway chat timeout" });
				reject(new Error("Gateway chat timeout"));
			}
		}, CHAT_TIMEOUT_MS);

		const settle = (err?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		};

		if (signal) {
			signal.addEventListener("abort", () => settle(new Error("Chat cancelled")), { once: true });
		}

		client.onEvent((event: GatewayEvent) => {
			if (settled) return;
			const payload = (event.payload ?? {}) as Record<string, unknown>;

			// Filter by runId
			if (payload.runId && payload.runId !== runId) return;

			if (event.event === "agent") {
				const stream = payload.stream as string | undefined;
				const data = (payload.data ?? {}) as Record<string, unknown>;

				if (stream === "assistant") {
					// Text delta from agent
					const text = (data.delta ?? data.text ?? "") as string;
					if (text) {
						writeLine({ type: "text", requestId, text });
						emittedText = true;
					}
				} else if (stream === "lifecycle") {
					if (data.phase === "end") {
						// Agent finished — emit finish
						writeLine({ type: "finish", requestId });
						settle();
					}
				}
			} else if (event.event === "chat") {
				const state = payload.state as string | undefined;

				if (state === "delta" || state === "final") {
					// Extract text from message.content[0].text
					const msg = payload.message as Record<string, unknown> | undefined;
					const contentArr = msg?.content as Array<Record<string, unknown>> | undefined;
					if (contentArr && contentArr.length > 0) {
						const text = contentArr[0].text as string | undefined;
						if (text && !emittedText) {
							// Only emit if we haven't already from agent stream
							writeLine({ type: "text", requestId, text });
							emittedText = true;
						}
					}
				}

				if (state === "final") {
					if (!settled) {
						writeLine({ type: "finish", requestId });
						settle();
					}
				}
			}
		});
	});
}

/**
 * Batch fallback: agent → agent.wait → sessions.transcript
 *
 * Used when chat.send is not available.
 */
async function handleChatBatch(
	client: GatewayClient,
	options: GatewayChatOptions,
): Promise<void> {
	const { message, requestId, writeLine } = options;
	const sessionKey = options.sessionKey || DEFAULT_SESSION_KEY;

	const agentResult = (await client.request("agent", {
		message,
		sessionKey,
		idempotencyKey: randomUUID(),
	})) as ChatSendPayload;

	await client.request("agent.wait", {
		runId: agentResult.runId,
		timeoutMs: CHAT_TIMEOUT_MS,
	});

	try {
		const transcript = (await client.request("sessions.transcript", {
			key: sessionKey,
		})) as TranscriptPayload;

		const assistantMsgs = transcript.messages.filter((m) => m.role === "assistant");
		const lastMsg = assistantMsgs[assistantMsgs.length - 1]?.content ?? "";

		if (lastMsg) {
			writeLine({ type: "text", requestId, text: lastMsg });
		}
	} catch {
		// Transcript fetch failed — still emit finish
	}

	writeLine({ type: "finish", requestId });
}
