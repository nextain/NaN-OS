import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentResponseChunk, ProviderConfig } from "./types";

interface SendChatOptions {
	message: string;
	provider: ProviderConfig;
	history: { role: "user" | "assistant"; content: string }[];
	onChunk: (chunk: AgentResponseChunk) => void;
	requestId: string;
	ttsVoice?: string;
	ttsApiKey?: string;
	systemPrompt?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	disabledSkills?: string[];
}

const RESPONSE_TIMEOUT_MS = 120_000; // Safety: clean up listener if no finish/error

export async function sendChatMessage(opts: SendChatOptions): Promise<void> {
	const {
		message,
		provider,
		history,
		onChunk,
		requestId,
		ttsVoice,
		ttsApiKey,
		systemPrompt,
		enableTools,
		gatewayUrl,
		gatewayToken,
		disabledSkills,
	} = opts;

	const request = {
		type: "chat_request",
		requestId,
		provider,
		messages: [...history, { role: "user", content: message }],
		...(ttsVoice && { ttsVoice }),
		...(ttsApiKey && { ttsApiKey }),
		...(systemPrompt && { systemPrompt }),
		...(enableTools != null && { enableTools }),
		...(gatewayUrl && { gatewayUrl }),
		...(gatewayToken && { gatewayToken }),
		...(disabledSkills && disabledSkills.length > 0 && { disabledSkills }),
	};

	// Listen for agent responses before sending to avoid race conditions
	const unlisten = await listen<string>("agent_response", (event) => {
		try {
			const raw =
				typeof event.payload === "string"
					? event.payload
					: JSON.stringify(event.payload);
			const chunk = JSON.parse(raw) as AgentResponseChunk;
			if (chunk.requestId !== requestId) return;
			onChunk(chunk);

			if (chunk.type === "finish" || chunk.type === "error") {
				clearTimeout(timeoutId);
				unlisten();
			}
		} catch {
			// Ignore malformed events
		}
	});

	// Safety timeout: clean up listener if agent never sends finish/error
	const timeoutId = setTimeout(() => {
		unlisten();
		onChunk({ type: "error", requestId, message: "Agent response timeout" });
	}, RESPONSE_TIMEOUT_MS);

	try {
		await invoke("send_to_agent_command", {
			message: JSON.stringify(request),
		});
	} catch (err) {
		clearTimeout(timeoutId);
		unlisten();
		throw err;
	}
}

export async function cancelChat(requestId: string): Promise<void> {
	await invoke("cancel_stream", { requestId });
}
