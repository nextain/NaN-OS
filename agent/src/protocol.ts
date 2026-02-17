import type { ProviderConfig } from "./providers/types.js";

export interface ChatRequest {
	type: "chat_request";
	requestId: string;
	provider: ProviderConfig;
	messages: { role: "user" | "assistant"; content: string }[];
	systemPrompt?: string;
	ttsVoice?: string;
	ttsApiKey?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
}

export interface CancelRequest {
	type: "cancel_stream";
	requestId: string;
}

export type AgentRequest = ChatRequest | CancelRequest;

export function parseRequest(line: string): AgentRequest | null {
	try {
		const obj = JSON.parse(line);
		if (!obj || typeof obj.type !== "string") return null;
		if (obj.type === "chat_request" || obj.type === "cancel_stream") {
			return obj as AgentRequest;
		}
		return null;
	} catch {
		return null;
	}
}
