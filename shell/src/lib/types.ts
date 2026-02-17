// === Provider ===

export type ProviderId = "gemini" | "xai" | "anthropic";

export interface ProviderConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
}

// === Chat Messages ===

export interface CostEntry {
	inputTokens: number;
	outputTokens: number;
	cost: number;
	provider: ProviderId;
	model: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	cost?: CostEntry;
}

// === Agent Protocol (stdin/stdout JSON lines) ===

export interface AgentRequest {
	type: "chat_request";
	requestId: string;
	provider: ProviderConfig;
	messages: { role: "user" | "assistant"; content: string }[];
	systemPrompt?: string;
	ttsVoice?: string;
	ttsApiKey?: string;
}

export type AgentResponseChunk =
	| { type: "text"; requestId: string; text: string }
	| { type: "audio"; requestId: string; data: string }
	| {
			type: "tool_use";
			requestId: string;
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "tool_result";
			requestId: string;
			toolCallId: string;
			toolName: string;
			output: string;
			success: boolean;
	  }
	| {
			type: "usage";
			requestId: string;
			inputTokens: number;
			outputTokens: number;
			cost: number;
			model: string;
	  }
	| { type: "finish"; requestId: string }
	| { type: "error"; requestId: string; message: string };
