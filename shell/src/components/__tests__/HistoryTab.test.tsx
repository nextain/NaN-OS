import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../../stores/chat";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Import after mocks
import { HistoryTab } from "../HistoryTab";

describe("HistoryTab", () => {
	const onLoadSession = vi.fn();

	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
		onLoadSession.mockReset();
		useChatStore.setState(useChatStore.getInitialState());
	});

	it("shows empty state when no sessions", async () => {
		mockInvoke.mockResolvedValue([]);
		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText(/대화 기록이 없|No conversation/)).toBeDefined();
		});
	});

	it("renders session list", async () => {
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_get_sessions_with_count") {
				return Promise.resolve([
					{
						id: "s1",
						created_at: Date.now(),
						title: "Test Session",
						summary: null,
						message_count: 5,
					},
				]);
			}
			return Promise.resolve(undefined);
		});

		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText("Test Session")).toBeDefined();
		});
	});

	it("marks current session", async () => {
		useChatStore.setState({ sessionId: "s1" });
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_get_sessions_with_count") {
				return Promise.resolve([
					{
						id: "s1",
						created_at: Date.now(),
						title: "Current",
						summary: null,
						message_count: 3,
					},
				]);
			}
			return Promise.resolve(undefined);
		});

		const { container } = render(
			<HistoryTab onLoadSession={onLoadSession} />,
		);
		await waitFor(() => {
			const current = container.querySelector(".history-item.current");
			expect(current).not.toBeNull();
		});
	});

	it("loads session on click", async () => {
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_get_sessions_with_count") {
				return Promise.resolve([
					{
						id: "s2",
						created_at: Date.now(),
						title: "Other",
						summary: null,
						message_count: 2,
					},
				]);
			}
			if (cmd === "memory_get_messages") {
				return Promise.resolve([
					{
						id: "m1",
						session_id: "s2",
						role: "user",
						content: "Hello",
						timestamp: 1000,
						cost_json: null,
						tool_calls_json: null,
					},
				]);
			}
			return Promise.resolve(undefined);
		});

		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText("Other")).toBeDefined();
		});

		const btn = screen.getByText("Other");
		fireEvent.click(btn);

		await waitFor(() => {
			expect(onLoadSession).toHaveBeenCalled();
			const state = useChatStore.getState();
			expect(state.sessionId).toBe("s2");
			expect(state.messages).toHaveLength(1);
		});
	});

	it("deletes session on confirm", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);

		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "memory_get_sessions_with_count") {
				return Promise.resolve([
					{
						id: "s1",
						created_at: Date.now(),
						title: "To Delete",
						summary: null,
						message_count: 1,
					},
				]);
			}
			if (cmd === "memory_delete_session") {
				return Promise.resolve(undefined);
			}
			return Promise.resolve(undefined);
		});

		const { container } = render(
			<HistoryTab onLoadSession={onLoadSession} />,
		);
		await waitFor(() => {
			expect(screen.getByText("To Delete")).toBeDefined();
		});

		const deleteBtn = container.querySelector(".history-delete-btn");
		expect(deleteBtn).not.toBeNull();
		fireEvent.click(deleteBtn!);

		await waitFor(() => {
			expect(
				mockInvoke,
			).toHaveBeenCalledWith("memory_delete_session", { sessionId: "s1" });
		});
	});
});
