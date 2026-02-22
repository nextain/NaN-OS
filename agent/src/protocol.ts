import type { ProviderConfig } from "./providers/types.js";

export interface ChatRequest {
	type: "chat_request";
	requestId: string;
	provider: ProviderConfig;
	messages: { role: "user" | "assistant"; content: string }[];
	systemPrompt?: string;
	ttsVoice?: string;
	ttsApiKey?: string;
	ttsEngine?: "auto" | "openclaw" | "google";
	ttsProvider?: "google" | "edge" | "openai" | "elevenlabs" | "nextain";
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	disabledSkills?: string[];
	routeViaGateway?: boolean;
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
}

export interface CancelRequest {
	type: "cancel_stream";
	requestId: string;
}

export interface ApprovalResponse {
	type: "approval_response";
	requestId: string;
	toolCallId: string;
	decision: "once" | "always" | "reject";
	message?: string;
}

/** Direct tool execution request (bypasses LLM, no token cost) */
export interface ToolRequest {
	type: "tool_request";
	requestId: string;
	toolName: string;
	args: Record<string, unknown>;
	gatewayUrl?: string;
	gatewayToken?: string;
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
}

export type AgentRequest =
	| ChatRequest
	| CancelRequest
	| ApprovalResponse
	| ToolRequest;

export function parseRequest(line: string): AgentRequest | null {
	try {
		const obj = JSON.parse(line);
		if (!obj || typeof obj.type !== "string") return null;
		if (
			obj.type === "chat_request" ||
			obj.type === "cancel_stream" ||
			obj.type === "approval_response" ||
			obj.type === "tool_request"
		) {
			return obj as AgentRequest;
		}
		return null;
	} catch {
		return null;
	}
}
