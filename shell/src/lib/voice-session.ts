/**
 * Gateway WebSocket session for Gemini Live API voice conversation.
 * Plain WebSocket — no SDK dependency needed.
 */
import { Logger } from "./logger";

export interface ToolDeclaration {
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
}

export interface VoiceSessionConfig {
	gatewayUrl: string;
	naiaKey: string;
	voice?: string;
	systemInstruction?: string;
	tools?: ToolDeclaration[];
	model?: string;
}

export interface VoiceSession {
	connect: (config: VoiceSessionConfig) => Promise<void>;
	sendAudio: (pcmBase64: string) => void;
	sendText: (text: string) => void;
	sendToolResponse: (callId: string, result: unknown) => void;
	disconnect: () => void;
	readonly isConnected: boolean;

	onAudio: ((pcmBase64: string) => void) | null;
	onInputTranscript: ((text: string) => void) | null;
	onOutputTranscript: ((text: string) => void) | null;
	onToolCall:
		| ((id: string, name: string, args: Record<string, unknown>) => void)
		| null;
	onTurnEnd: (() => void) | null;
	onInterrupted: (() => void) | null;
	onError: ((error: Error) => void) | null;
	onDisconnect: (() => void) | null;
}

export function createVoiceSession(): VoiceSession {
	let ws: WebSocket | null = null;
	let connected = false;

	const session: VoiceSession = {
		onAudio: null,
		onInputTranscript: null,
		onOutputTranscript: null,
		onToolCall: null,
		onTurnEnd: null,
		onInterrupted: null,
		onError: null,
		onDisconnect: null,

		get isConnected() {
			return connected;
		},

		async connect(config: VoiceSessionConfig) {
			const wsUrl = `${config.gatewayUrl.replace(/^http/, "ws")}/v1/live`;
			ws = new WebSocket(wsUrl);

			return new Promise<void>((resolve, reject) => {
				if (!ws) return reject(new Error("WebSocket not created"));

				const timeout = setTimeout(() => {
					reject(new Error("Connection timeout"));
					ws?.close();
				}, 15000);

				ws.onopen = () => {
					Logger.info("VoiceSession", "WebSocket connected, sending setup");
					ws?.send(
						JSON.stringify({
							setup: {
								apiKey: `Bearer ${config.naiaKey}`,
								voice: config.voice ?? "Puck",
								systemInstruction: config.systemInstruction,
								tools: config.tools,
								model: config.model,
							},
						}),
					);
				};

				ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data);
						if (msg.setupComplete) {
							clearTimeout(timeout);
							connected = true;
							Logger.info("VoiceSession", "setup complete");
							resolve();
							return;
						}
						if (msg.error) {
							clearTimeout(timeout);
							const err = new Error(msg.error.message || "Setup failed");
							reject(err);
							session.onError?.(err);
							return;
						}
						handleMessage(msg);
					} catch {
						// ignore malformed
					}
				};

				ws.onerror = () => {
					clearTimeout(timeout);
					const err = new Error("WebSocket error");
					reject(err);
					session.onError?.(err);
				};

				ws.onclose = () => {
					clearTimeout(timeout);
					const wasConnected = connected;
					connected = false;
					Logger.info("VoiceSession", "disconnected");
					if (!wasConnected) {
						reject(new Error("Connection closed before setup completed"));
					}
					session.onDisconnect?.();
				};
			});
		},

		sendAudio(pcmBase64: string) {
			if (!ws || !connected) return;
			ws.send(
				JSON.stringify({
					realtimeInput: {
						mediaChunks: [
							{ mimeType: "audio/pcm;rate=16000", data: pcmBase64 },
						],
					},
				}),
			);
		},

		sendText(text: string) {
			if (!ws || !connected) return;
			ws.send(
				JSON.stringify({
					clientContent: {
						turns: [{ role: "user", parts: [{ text }] }],
						turnComplete: true,
					},
				}),
			);
		},

		sendToolResponse(callId: string, result: unknown) {
			if (!ws || !connected) return;
			ws.send(
				JSON.stringify({
					toolResponse: {
						functionResponses: [{ id: callId, response: { result } }],
					},
				}),
			);
		},

		disconnect() {
			connected = false;
			if (ws) {
				ws.close();
				ws = null;
			}
		},
	};

	function handleMessage(msg: Record<string, unknown>) {
		const sc = msg.serverContent as Record<string, unknown> | undefined;
		if (sc) {
			const mt = sc.modelTurn as
				| { parts?: { inlineData?: { data: string }; text?: string }[] }
				| undefined;
			if (mt?.parts) {
				for (const part of mt.parts) {
					if (part.inlineData?.data) {
						session.onAudio?.(part.inlineData.data);
					}
				}
			}

			const itx = sc.inputTranscription as { text?: string } | undefined;
			if (itx?.text) {
				session.onInputTranscript?.(itx.text);
			}

			const otx = sc.outputTranscription as { text?: string } | undefined;
			if (otx?.text) {
				session.onOutputTranscript?.(otx.text);
			}

			if (sc.turnComplete) {
				session.onTurnEnd?.();
			}

			if (sc.interrupted) {
				session.onInterrupted?.();
			}
		}

		const tc = msg.toolCall as
			| {
					functionCalls?: {
						id: string;
						name: string;
						args: Record<string, unknown>;
					}[];
			  }
			| undefined;
		if (tc?.functionCalls) {
			for (const fc of tc.functionCalls) {
				session.onToolCall?.(fc.id, fc.name, fc.args ?? {});
			}
		}
	}

	return session;
}
