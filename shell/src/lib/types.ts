// === Provider ===

export type ProviderId =
	| "gemini"
	| "openai"
	| "anthropic"
	| "xai"
	| "zai"
	| "ollama";

export interface ProviderConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
	labKey?: string;
}

// === Chat Messages ===

export interface CostEntry {
	inputTokens: number;
	outputTokens: number;
	cost: number;
	provider: ProviderId;
	model: string;
}

export interface ToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	status: "running" | "success" | "error";
	output?: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	cost?: CostEntry;
	toolCalls?: ToolCall[];
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
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	disabledSkills?: string[];
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
	| {
			type: "approval_request";
			requestId: string;
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
			tier: number;
			description: string;
	  }
	| {
			type: "config_update";
			requestId: string;
			action: "enable_skill" | "disable_skill";
			skillName: string;
	  }
	| {
			type: "gateway_approval_request";
			requestId: string;
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "log_entry";
			requestId: string;
			level: string;
			message: string;
			timestamp: string;
	  }
	| { type: "finish"; requestId: string }
	| { type: "error"; requestId: string; message: string };

// === Skill Manifest (from ~/.cafelua/skills/{name}/skill.json) ===

export interface SkillManifestInfo {
	name: string;
	description: string;
	type: "gateway" | "command" | "built-in";
	tier: number;
	source: string;
	gatewaySkill?: string;
}

// === Audit (matches Rust structs in audit.rs) ===

export interface AuditEvent {
	id: number;
	timestamp: string;
	request_id: string;
	event_type: string;
	tool_name: string | null;
	tool_call_id: string | null;
	tier: number | null;
	success: boolean | null;
	payload: string | null;
}

export interface AuditFilter {
	request_id?: string;
	event_type?: string;
	tool_name?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
}

// === Channels ===

export interface ChannelAccountInfo {
	accountId: string;
	name?: string;
	connected: boolean;
	enabled: boolean;
	lastError?: string;
}

export interface ChannelInfo {
	id: string;
	label: string;
	accounts: ChannelAccountInfo[];
}

export interface AuditStats {
	total_events: number;
	by_event_type: [string, number][];
	by_tool_name: [string, number][];
	total_cost: number;
}

// === Device Pairing ===

export interface DeviceInfo {
	deviceId: string;
	name: string;
	platform?: string;
	lastSeen?: string;
}

export interface PairRequest {
	requestId: string;
	nodeId: string;
	status: "pending" | "approved" | "rejected";
	createdAt?: string;
}

// === Gateway Status ===

export interface GatewayStatus {
	ok: boolean;
	version?: string;
	uptime?: number;
	methods?: string[];
}

// === Log Entry ===

export interface LogEntry {
	level: string;
	message: string;
	timestamp: string;
}
