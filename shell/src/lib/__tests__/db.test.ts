import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("db", () => {
	beforeEach(() => {
		mockInvoke.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("createSession calls Tauri with correct args", async () => {
		const session = {
			id: "s1",
			created_at: 1000,
			title: "Test",
			summary: null,
		};
		mockInvoke.mockResolvedValueOnce(session);

		const { createSession } = await import("../db");
		const result = await createSession("s1", "Test");

		expect(mockInvoke).toHaveBeenCalledWith("memory_create_session", {
			id: "s1",
			title: "Test",
		});
		expect(result).toEqual(session);
	});

	it("createSession without title", async () => {
		const session = {
			id: "s1",
			created_at: 1000,
			title: null,
			summary: null,
		};
		mockInvoke.mockResolvedValueOnce(session);

		const { createSession } = await import("../db");
		const result = await createSession("s1");

		expect(mockInvoke).toHaveBeenCalledWith("memory_create_session", {
			id: "s1",
			title: null,
		});
		expect(result).toEqual(session);
	});

	it("getLastSession returns session or null", async () => {
		mockInvoke.mockResolvedValueOnce(null);

		const { getLastSession } = await import("../db");
		const result = await getLastSession();

		expect(mockInvoke).toHaveBeenCalledWith("memory_get_last_session");
		expect(result).toBeNull();
	});

	it("getRecentSessions calls with limit", async () => {
		mockInvoke.mockResolvedValueOnce([]);

		const { getRecentSessions } = await import("../db");
		const result = await getRecentSessions(5);

		expect(mockInvoke).toHaveBeenCalledWith("memory_get_sessions", {
			limit: 5,
		});
		expect(result).toEqual([]);
	});

	it("saveMessage sends MessageRow to backend", async () => {
		const msg = {
			id: "m1",
			session_id: "s1",
			role: "user",
			content: "Hello",
			timestamp: 1000,
			cost_json: null,
			tool_calls_json: null,
		};

		const { saveMessage } = await import("../db");
		await saveMessage(msg);

		expect(mockInvoke).toHaveBeenCalledWith("memory_save_message", {
			msg,
		});
	});

	it("getSessionMessages calls with session_id", async () => {
		mockInvoke.mockResolvedValueOnce([]);

		const { getSessionMessages } = await import("../db");
		const result = await getSessionMessages("s1");

		expect(mockInvoke).toHaveBeenCalledWith("memory_get_messages", {
			sessionId: "s1",
		});
		expect(result).toEqual([]);
	});

	it("searchMessages calls with query and limit", async () => {
		mockInvoke.mockResolvedValueOnce([]);

		const { searchMessages } = await import("../db");
		const result = await searchMessages("Rust", 10);

		expect(mockInvoke).toHaveBeenCalledWith("memory_search", {
			query: "Rust",
			limit: 10,
		});
		expect(result).toEqual([]);
	});

	it("deleteSession calls with session_id", async () => {
		const { deleteSession } = await import("../db");
		await deleteSession("s1");

		expect(mockInvoke).toHaveBeenCalledWith("memory_delete_session", {
			sessionId: "s1",
		});
	});

	it("updateSessionTitle calls with id and title", async () => {
		const { updateSessionTitle } = await import("../db");
		await updateSessionTitle("s1", "New Title");

		expect(mockInvoke).toHaveBeenCalledWith("memory_update_title", {
			sessionId: "s1",
			title: "New Title",
		});
	});

	// === Conversion helpers ===

	it("chatMessageToRow converts ChatMessage to MessageRow", async () => {
		const { chatMessageToRow } = await import("../db");
		const row = chatMessageToRow("sess-1", {
			id: "m1",
			role: "assistant",
			content: "Hello",
			timestamp: 1000,
			cost: {
				inputTokens: 100,
				outputTokens: 50,
				cost: 0.001,
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
			toolCalls: [
				{
					toolCallId: "tc-1",
					toolName: "read_file",
					args: { path: "/a" },
					status: "success",
					output: "contents",
				},
			],
		});

		expect(row.id).toBe("m1");
		expect(row.session_id).toBe("sess-1");
		expect(row.role).toBe("assistant");
		expect(row.content).toBe("Hello");
		expect(row.timestamp).toBe(1000);
		expect(JSON.parse(row.cost_json!)).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			cost: 0.001,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
		expect(JSON.parse(row.tool_calls_json!)).toHaveLength(1);
	});

	it("chatMessageToRow sets null for missing cost/toolCalls", async () => {
		const { chatMessageToRow } = await import("../db");
		const row = chatMessageToRow("sess-1", {
			id: "m2",
			role: "user",
			content: "Hi",
			timestamp: 2000,
		});

		expect(row.cost_json).toBeNull();
		expect(row.tool_calls_json).toBeNull();
	});

	it("rowToChatMessage converts MessageRow to ChatMessage", async () => {
		const { rowToChatMessage } = await import("../db");
		const msg = rowToChatMessage({
			id: "m1",
			session_id: "sess-1",
			role: "assistant",
			content: "Hello",
			timestamp: 1000,
			cost_json: JSON.stringify({
				inputTokens: 100,
				outputTokens: 50,
				cost: 0.001,
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
			tool_calls_json: JSON.stringify([
				{
					toolCallId: "tc-1",
					toolName: "read_file",
					args: { path: "/a" },
					status: "success",
					output: "contents",
				},
			]),
		});

		expect(msg.id).toBe("m1");
		expect(msg.role).toBe("assistant");
		expect(msg.content).toBe("Hello");
		expect(msg.timestamp).toBe(1000);
		expect(msg.cost?.inputTokens).toBe(100);
		expect(msg.toolCalls).toHaveLength(1);
		expect(msg.toolCalls![0].toolCallId).toBe("tc-1");
	});

	it("rowToChatMessage handles null cost/toolCalls", async () => {
		const { rowToChatMessage } = await import("../db");
		const msg = rowToChatMessage({
			id: "m2",
			session_id: "sess-1",
			role: "user",
			content: "Hi",
			timestamp: 2000,
			cost_json: null,
			tool_calls_json: null,
		});

		expect(msg.cost).toBeUndefined();
		expect(msg.toolCalls).toBeUndefined();
	});
});
