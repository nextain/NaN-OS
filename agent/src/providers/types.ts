export type ProviderId = "gemini" | "xai" | "anthropic";

export interface ProviderConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
	labKey?: string;
}

/** Tool call info returned by LLM function calling */
export interface ToolCallInfo {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

/** Chat message types including tool call/result messages */
export interface ChatMessage {
	role: "user" | "assistant" | "tool";
	content: string;
	toolCalls?: ToolCallInfo[];
	toolCallId?: string;
	name?: string;
}

/** Tool definition for LLM function calling */
export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/** Chunk types emitted by a provider stream */
export type StreamChunk =
	| { type: "text"; text: string }
	| {
			type: "tool_use";
			id: string;
			name: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "usage";
			inputTokens: number;
			outputTokens: number;
	  }
	| { type: "finish" };

/** Async generator that yields streaming chunks */
export type AgentStream = AsyncGenerator<StreamChunk, void, undefined>;

/** Provider interface — each LLM provider implements this */
export interface LLMProvider {
	stream(
		messages: ChatMessage[],
		systemPrompt: string,
		tools?: ToolDefinition[],
	): AgentStream;
}
