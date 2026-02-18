import { invoke } from "@tauri-apps/api/core";
import { Logger } from "./logger";
import type { ChatMessage } from "./types";

// === Types (mirror Rust structs) ===

export interface Session {
	id: string;
	created_at: number;
	title: string | null;
	summary: string | null;
}

export interface MessageRow {
	id: string;
	session_id: string;
	role: string;
	content: string;
	timestamp: number;
	cost_json: string | null;
	tool_calls_json: string | null;
}

// === MemoryProcessor interface (pluggable, Phase 4.4b+) ===

export interface Fact {
	id: string;
	key: string;
	value: string;
	source: string | null;
	updated_at: number;
}

export interface MemoryProcessor {
	summarize(messages: MessageRow[]): Promise<string>;
	extractFacts?(messages: MessageRow[]): Promise<Fact[]>;
	semanticSearch?(query: string, limit: number): Promise<MessageRow[]>;
}

// === CRUD wrappers ===

export async function createSession(
	id: string,
	title?: string,
): Promise<Session> {
	return invoke("memory_create_session", { id, title: title ?? null });
}

export async function getLastSession(): Promise<Session | null> {
	return invoke("memory_get_last_session");
}

export async function getRecentSessions(limit: number): Promise<Session[]> {
	return invoke("memory_get_sessions", { limit });
}

export async function saveMessage(msg: MessageRow): Promise<void> {
	return invoke("memory_save_message", { msg });
}

export async function getSessionMessages(
	sessionId: string,
): Promise<MessageRow[]> {
	return invoke("memory_get_messages", { sessionId });
}

export async function searchMessages(
	query: string,
	limit: number,
): Promise<MessageRow[]> {
	return invoke("memory_search", { query, limit });
}

export async function deleteSession(sessionId: string): Promise<void> {
	return invoke("memory_delete_session", { sessionId });
}

export async function updateSessionTitle(
	sessionId: string,
	title: string,
): Promise<void> {
	return invoke("memory_update_title", { sessionId, title });
}

// === ChatMessage ↔ MessageRow conversion ===

export function chatMessageToRow(
	sessionId: string,
	msg: ChatMessage,
): MessageRow {
	return {
		id: msg.id,
		session_id: sessionId,
		role: msg.role,
		content: msg.content,
		timestamp: msg.timestamp,
		cost_json: msg.cost ? JSON.stringify(msg.cost) : null,
		tool_calls_json: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
	};
}

export function rowToChatMessage(row: MessageRow): ChatMessage {
	return {
		id: row.id,
		role: row.role as ChatMessage["role"],
		content: row.content,
		timestamp: row.timestamp,
		cost: row.cost_json ? JSON.parse(row.cost_json) : undefined,
		toolCalls: row.tool_calls_json
			? JSON.parse(row.tool_calls_json)
			: undefined,
	};
}

// === Helpers ===

export function generateSessionId(): string {
	return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Load last session's messages, or create a new session if none exists. */
export async function loadOrCreateSession(): Promise<{
	session: Session;
	messages: MessageRow[];
}> {
	try {
		const last = await getLastSession();
		if (last) {
			const messages = await getSessionMessages(last.id);
			return { session: last, messages };
		}
	} catch (err) {
		Logger.warn("db", "Failed to load last session", {
			error: String(err),
		});
	}

	const session = await createSession(generateSessionId());
	return { session, messages: [] };
}
