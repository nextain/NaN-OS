import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentResponseChunk } from "../../lib/types";
import { useAvatarStore } from "../../stores/avatar";
import { useChatStore } from "../../stores/chat";
import { ChatPanel } from "../ChatPanel";

// Mock chat-service — capture onChunk callback
let capturedOnChunk: ((chunk: AgentResponseChunk) => void) | null = null;
vi.mock("../../lib/chat-service", () => ({
	sendChatMessage: vi
		.fn()
		.mockImplementation(
			(opts: { onChunk: (chunk: AgentResponseChunk) => void }) => {
				capturedOnChunk = opts.onChunk;
				return Promise.resolve();
			},
		),
	cancelChat: vi.fn().mockResolvedValue(undefined),
}));

// Mock Tauri APIs (needed by chat-service and approval flow)
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

// Mock Audio element (not available in jsdom)
vi.stubGlobal(
	"Audio",
	class {
		src = "";
		onended: (() => void) | null = null;
		onerror: (() => void) | null = null;
		play() {
			return Promise.resolve();
		}
	},
);

describe("ChatPanel", () => {
	afterEach(() => {
		cleanup();
		capturedOnChunk = null;
		mockInvoke.mockResolvedValue(undefined);
		useChatStore.setState(useChatStore.getInitialState());
		useAvatarStore.setState(useAvatarStore.getInitialState());
	});

	it("renders input field and buttons", () => {
		render(<ChatPanel />);
		expect(screen.getByPlaceholderText(/메시지|message/i)).toBeDefined();
		const buttons = screen.getAllByRole("button");
		expect(buttons.length).toBeGreaterThanOrEqual(2);
	});

	it("does not send empty message", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ apiKey: "test-key", provider: "gemini", model: "gemini-2.5-flash" }),
		);
		render(<ChatPanel />);
		// Send button is the last button in the input bar
		const buttons = screen.getAllByRole("button");
		const sendBtn = buttons.find((b) => b.textContent === "↑")!;
		fireEvent.click(sendBtn);
		// No messages should be added
		expect(useChatStore.getState().messages).toHaveLength(0);
		localStorage.removeItem("naia-config");
	});

	it("sends message on Enter", async () => {
		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "안녕" } });
		fireEvent.keyDown(input, { key: "Enter" });

		// Wait for async state updates
		await new Promise((r) => setTimeout(r, 50));

		// User message + assistant error message (no API key)
		const { messages } = useChatStore.getState();
		expect(messages.length).toBeGreaterThanOrEqual(1);
		expect(messages[0].content).toBe("안녕");
		expect(messages[0].role).toBe("user");
	});

	it("displays session cost header", () => {
		useChatStore.setState({ totalSessionCost: 0.005 });
		render(<ChatPanel />);
		expect(screen.getByText(/\$0\.005/)).toBeDefined();
	});

	it("shows streaming indicator when streaming", () => {
		useChatStore.setState({
			isStreaming: true,
			streamingContent: "응답 중...",
		});
		render(<ChatPanel />);
		expect(screen.getByText(/응답 중/)).toBeDefined();
	});

	it("renders ToolActivity for tool_use chunk during streaming", async () => {
		// Set up API key so sendChatMessage is actually called
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "파일 읽어줘" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		expect(capturedOnChunk).not.toBeNull();
		capturedOnChunk!({
			type: "tool_use",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "read_file",
			args: { path: "/test.txt" },
		});

		// Store should have the tool call
		const { streamingToolCalls } = useChatStore.getState();
		expect(streamingToolCalls).toHaveLength(1);
		expect(streamingToolCalls[0].toolName).toBe("read_file");
		expect(streamingToolCalls[0].status).toBe("running");

		localStorage.removeItem("naia-config");
	});

	it("updates tool call on tool_result chunk", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "파일 읽어줘" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		capturedOnChunk!({
			type: "tool_use",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "read_file",
			args: { path: "/test.txt" },
		});

		capturedOnChunk!({
			type: "tool_result",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "read_file",
			output: "file contents",
			success: true,
		});

		const { streamingToolCalls } = useChatStore.getState();
		expect(streamingToolCalls[0].status).toBe("success");
		expect(streamingToolCalls[0].output).toBe("file contents");

		localStorage.removeItem("naia-config");
	});

	it("renders ToolActivity for completed messages with toolCalls", () => {
		useChatStore.setState({
			messages: [
				{
					id: "msg-1",
					role: "assistant",
					content: "파일을 읽었습니다.",
					timestamp: Date.now(),
					toolCalls: [
						{
							toolCallId: "tc-1",
							toolName: "read_file",
							args: { path: "/test.txt" },
							status: "success",
							output: "contents",
						},
					],
				},
			],
		});

		render(<ChatPanel />);
		// Should render the tool activity label
		expect(screen.getByText(/파일 읽기|Read File/)).toBeDefined();
	});

	it("sets pendingApproval on approval_request chunk", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "npm test 실행해" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		expect(capturedOnChunk).not.toBeNull();
		capturedOnChunk!({
			type: "approval_request",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "execute_command",
			args: { command: "npm test" },
			tier: 2,
			description: "명령 실행: npm test",
		});

		const { pendingApproval } = useChatStore.getState();
		expect(pendingApproval).not.toBeNull();
		expect(pendingApproval!.toolName).toBe("execute_command");

		localStorage.removeItem("naia-config");
	});

	it("auto-approves when tool is in allowedTools", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
				allowedTools: ["execute_command"],
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "npm test 실행해" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		expect(capturedOnChunk).not.toBeNull();
		capturedOnChunk!({
			type: "approval_request",
			requestId: "req-1",
			toolCallId: "tc-1",
			toolName: "execute_command",
			args: { command: "npm test" },
			tier: 2,
			description: "명령 실행: npm test",
		});

		// Should NOT set pendingApproval (auto-approved)
		const { pendingApproval } = useChatStore.getState();
		expect(pendingApproval).toBeNull();

		localStorage.removeItem("naia-config");
	});

	it("renders PermissionModal when pendingApproval is set", () => {
		useChatStore.setState({
			isStreaming: true,
			streamingContent: "",
			pendingApproval: {
				requestId: "req-1",
				toolCallId: "tc-1",
				toolName: "execute_command",
				args: { command: "npm test" },
				tier: 2,
				description: "명령 실행: npm test",
			},
		});

		render(<ChatPanel />);
		expect(
			screen.getByText(/도구 실행 승인|Tool Execution Approval/),
		).toBeDefined();
	});

	it("sets isSpeaking and pendingAudio on audio chunk", async () => {
		// Set up API key so sendChatMessage is actually called
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "안녕" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		// Simulate audio chunk via captured callback
		expect(capturedOnChunk).not.toBeNull();
		capturedOnChunk!({
			type: "audio",
			requestId: "req-1",
			data: "base64audio==",
		});

		// isSpeaking should be set (Audio element playback triggers this)
		expect(useAvatarStore.getState().isSpeaking).toBe(true);
		expect(useAvatarStore.getState().pendingAudio).toBe("base64audio==");

		localStorage.removeItem("naia-config");
	});

	// === Memory integration ===

	it("loads previous session on mount", async () => {
		const session = {
			id: "sess-prev",
			created_at: 1000,
			title: null,
			summary: null,
		};
		const rows = [
			{
				id: "m1",
				session_id: "sess-prev",
				role: "user",
				content: "이전 메시지",
				timestamp: 1000,
				cost_json: null,
				tool_calls_json: null,
			},
			{
				id: "m2",
				session_id: "sess-prev",
				role: "assistant",
				content: "이전 응답",
				timestamp: 2000,
				cost_json: null,
				tool_calls_json: null,
			},
		];

		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_get_last_session") return Promise.resolve(session);
			if (cmd === "memory_get_messages") return Promise.resolve(rows);
			return Promise.resolve(undefined);
		});

		render(<ChatPanel />);
		await new Promise((r) => setTimeout(r, 100));

		const state = useChatStore.getState();
		expect(state.sessionId).toBe("sess-prev");
		expect(state.messages).toHaveLength(2);
		expect(state.messages[0].content).toBe("이전 메시지");
		expect(state.messages[1].content).toBe("이전 응답");
	});

	it("renders new conversation button", () => {
		render(<ChatPanel />);
		const btn = screen.getByTitle(/새 대화|New Chat/);
		expect(btn).toBeDefined();
		expect(btn.textContent).toBe("+");
	});

	it("new conversation resets messages and creates session", async () => {
		// Pre-populate some state
		useChatStore.setState({
			sessionId: "old-session",
			messages: [
				{
					id: "m1",
					role: "user",
					content: "old",
					timestamp: 1000,
				},
			],
		});

		const newSession = {
			id: "new-session",
			created_at: 5000,
			title: null,
			summary: null,
		};
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_create_session")
				return Promise.resolve(newSession);
			return Promise.resolve(undefined);
		});

		render(<ChatPanel />);
		const btn = screen.getByTitle(/새 대화|New Chat/);
		fireEvent.click(btn);

		await new Promise((r) => setTimeout(r, 100));

		const state = useChatStore.getState();
		expect(state.messages).toHaveLength(0);
		expect(state.sessionId).toBe("new-session");
	});
});
