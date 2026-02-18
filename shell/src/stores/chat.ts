import { create } from "zustand";
import { Logger } from "../lib/logger";
import type {
	ChatMessage,
	CostEntry,
	ProviderId,
	ToolCall,
} from "../lib/types";

export interface PendingApproval {
	requestId: string;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	tier: number;
	description: string;
}

interface ChatState {
	sessionId: string | null;
	messages: ChatMessage[];
	isStreaming: boolean;
	streamingContent: string;
	streamingToolCalls: ToolCall[];
	provider: ProviderId;
	totalSessionCost: number;
	pendingApproval: PendingApproval | null;

	setSessionId: (id: string) => void;
	setMessages: (messages: ChatMessage[]) => void;
	addMessage: (msg: Pick<ChatMessage, "role" | "content">) => void;
	startStreaming: () => void;
	appendStreamChunk: (text: string) => void;
	addStreamingToolUse: (
		toolCallId: string,
		toolName: string,
		args: Record<string, unknown>,
	) => void;
	updateStreamingToolResult: (
		toolCallId: string,
		success: boolean,
		output: string,
	) => void;
	finishStreaming: () => void;
	addCostEntry: (entry: CostEntry) => void;
	setProvider: (provider: ProviderId) => void;
	setPendingApproval: (approval: PendingApproval) => void;
	clearPendingApproval: () => void;
	newConversation: () => void;
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useChatStore = create<ChatState>()((set, get) => ({
	sessionId: null,
	messages: [],
	isStreaming: false,
	streamingContent: "",
	streamingToolCalls: [],
	provider: "gemini",
	totalSessionCost: 0,
	pendingApproval: null,

	setSessionId: (id) => set({ sessionId: id }),

	setMessages: (messages) => set({ messages }),

	addMessage: (msg) =>
		set((s) => ({
			messages: [
				...s.messages,
				{ ...msg, id: generateId(), timestamp: Date.now() },
			],
		})),

	startStreaming: () =>
		set({ isStreaming: true, streamingContent: "", streamingToolCalls: [] }),

	appendStreamChunk: (text) =>
		set((s) => ({ streamingContent: s.streamingContent + text })),

	addStreamingToolUse: (toolCallId, toolName, args) =>
		set((s) => {
			if (s.streamingToolCalls.some((tc) => tc.toolCallId === toolCallId)) {
				return s;
			}
			return {
				streamingToolCalls: [
					...s.streamingToolCalls,
					{ toolCallId, toolName, args, status: "running" as const },
				],
			};
		}),

	updateStreamingToolResult: (toolCallId, success, output) =>
		set((s) => {
			const found = s.streamingToolCalls.some(
				(tc) => tc.toolCallId === toolCallId,
			);
			if (!found) {
				Logger.warn("ChatStore", "tool_result for unknown toolCallId", {
					toolCallId,
				});
				return s;
			}
			return {
				streamingToolCalls: s.streamingToolCalls.map((tc) =>
					tc.toolCallId === toolCallId
						? {
								...tc,
								status: (success ? "success" : "error") as "success" | "error",
								output,
							}
						: tc,
				),
			};
		}),

	finishStreaming: () => {
		const { isStreaming, streamingContent, streamingToolCalls } = get();
		if (!isStreaming) return;
		const toolCalls =
			streamingToolCalls.length > 0 ? streamingToolCalls : undefined;
		set((s) => ({
			isStreaming: false,
			streamingContent: "",
			streamingToolCalls: [],
			pendingApproval: null,
			messages: [
				...s.messages,
				{
					id: generateId(),
					role: "assistant" as const,
					content: streamingContent,
					timestamp: Date.now(),
					toolCalls,
				},
			],
		}));
	},

	addCostEntry: (entry) =>
		set((s) => {
			const messages = [...s.messages];
			let attached = false;
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i].role === "assistant") {
					messages[i] = { ...messages[i], cost: entry };
					attached = true;
					break;
				}
			}
			if (!attached) {
				Logger.warn("ChatStore", "No assistant message to attach cost entry");
			}
			return {
				messages,
				totalSessionCost: s.totalSessionCost + entry.cost,
			};
		}),

	setProvider: (provider) => set({ provider }),

	setPendingApproval: (approval) => set({ pendingApproval: approval }),

	clearPendingApproval: () => set({ pendingApproval: null }),

	newConversation: () =>
		set({
			sessionId: null,
			messages: [],
			isStreaming: false,
			streamingContent: "",
			streamingToolCalls: [],
			totalSessionCost: 0,
			pendingApproval: null,
		}),
}));
