// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NaiaContextBridge, ToolHandler } from "../../../lib/app-registry";
import type { FileLocation, TerminalHandle } from "../Terminal";

const mockInvoke = vi.fn();
const terminalFocus = vi.fn();
const editorRevealLocation = vi.fn();
const editorReloadFile = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../../../lib/adk-store", () => ({
	getAdkPath: () => "/work/naia",
}));

vi.mock("../../../stores/app", () => ({
	useAppStore: {
		getState: () => ({ activeApp: "workspace", setActiveApp: vi.fn() }),
	},
}));

vi.mock("../Terminal", () => ({
	Terminal: forwardRef<
		TerminalHandle,
		{
			pty_id: string;
			onExit: (ptyId: string) => void;
			onFileLocation?: (value: FileLocation) => void;
			onReady?: () => void;
		}
	>(function MockTerminal({ pty_id, onExit, onFileLocation, onReady }, ref) {
		useImperativeHandle(ref, () => ({ focus: terminalFocus }));
		useEffect(() => onReady?.(), [pty_id]);
		return (
			<div data-testid="embedded-herdr-terminal" data-pty-id={pty_id}>
				<button
					type="button"
					onClick={() =>
						onFileLocation?.({ path: "src/App.tsx", line: 12, column: 4 })
					}
				>
					Open terminal path
				</button>
				<button type="button" onClick={() => onExit(pty_id)}>
					Exit Herdr PTY
				</button>
			</div>
		);
	}),
}));

vi.mock("../FileTree", () => ({
	FileTree: ({
		openFilePath,
		onFileSelect,
		onSendToChat,
	}: {
		openFilePath: string;
		onFileSelect: (path: string) => void;
		onSendToChat: (path: string) => void;
	}) => (
		<div>
			<div data-testid="file-tree-selection">{openFilePath}</div>
			<button
				type="button"
				onClick={() => onFileSelect("/work/naia/README.md")}
			>
				Open tree file
			</button>
			<button type="button" onClick={() => onSendToChat("README.md")}>
				Send tree file
			</button>
		</div>
	),
}));

vi.mock("../QuickOpen", () => ({
	QuickOpen: ({ onClose }: { onClose: () => void }) => (
		<button type="button" onClick={onClose}>
			Quick Open visible
		</button>
	),
}));

vi.mock("../Editor", () => ({
	Editor: forwardRef(function MockEditor(
		{ filePath }: { filePath: string },
		ref,
	) {
		useImperativeHandle(ref, () => ({
			reloadFile: editorReloadFile,
			revealLocation: editorRevealLocation,
		}));
		return <div data-testid="file-viewer">{filePath}</div>;
	}),
}));

vi.mock("../DocTabBar", () => ({
	DocTabBar: () => <div data-testid="doc-tabs" />,
}));

const snapshot = {
	protocol: 19,
	version: "0.8.0",
	focused_workspace_id: "w1",
	focused_pane_id: "w1:p1",
	workspaces: [
		{
			workspace_id: "w1",
			label: "Naia",
			focused: true,
			pane_count: 1,
			tab_count: 1,
			worktree: { checkout_path: "/work/naia" },
		},
	],
	agents: [
		{
			workspace_id: "w1",
			tab_id: "w1:t1",
			pane_id: "w1:p1",
			agent: "codex",
			agent_status: "working",
			cwd: "/work/naia",
			focused: true,
		},
	],
};

const toolHandlers = new Map<string, ToolHandler>();

const bridge: NaiaContextBridge = {
	pushContext: vi.fn(),
	onToolCall: vi.fn((name, handler) => {
		toolHandlers.set(name, handler);
		return () => toolHandlers.delete(name);
	}),
	logBehavior: vi.fn(async () => {}),
	queryBehavior: vi.fn(async () => []),
	getSecret: vi.fn(async () => null),
	setSecret: vi.fn(async () => {}),
	readFile: vi.fn(async () => ""),
	runShell: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
};

describe("HerdrWorkspaceCenterArea", () => {
	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
		terminalFocus.mockReset();
		editorRevealLocation.mockReset();
		editorReloadFile.mockReset();
		toolHandlers.clear();
	});

	it("places File Tree above Spaces and keeps Herdr mounted behind the viewer", async () => {
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-7", pid: 7 };
			if (command === "herdr_snapshot") return snapshot;
			if (command === "workspace_set_root") return "/work/naia";
			if (command === "workspace_resolve_file_location") {
				return "/work/naia/src/App.tsx";
			}
			return null;
		});
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		render(<HerdrWorkspaceCenterArea naia={bridge} />);

		const fileTree = await screen.findByLabelText("File Tree");
		const workspaceRoot = await screen.findByTestId("herdr-workspace-root");
		expect(workspaceRoot).toHaveTextContent("naia");
		expect(workspaceRoot).toHaveAttribute("title", "/work/naia");
		const spaces = screen.getByRole("tab", { name: "Spaces" });
		const agents = screen.getByRole("tab", { name: "Agents" });
		expect(
			fileTree.compareDocumentPosition(spaces) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			spaces.compareDocumentPosition(agents) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		const terminal = await screen.findByTestId("embedded-herdr-terminal");

		fireEvent.click(screen.getByRole("button", { name: "Open terminal path" }));
		await screen.findByTestId("workspace-viewer");
		expect(mockInvoke).toHaveBeenCalledWith("workspace_resolve_file_location", {
			path: "src/App.tsx",
			expectedWorkspaceId: "w1",
			expectedPaneId: "w1:p1",
		});
		await waitFor(() =>
			expect(editorRevealLocation).toHaveBeenCalledWith(
				12,
				4,
				"/work/naia/src/App.tsx",
			),
		);
		expect(screen.getByTestId("file-tree-selection")).toHaveTextContent(
			"/work/naia/src/App.tsx",
		);
		expect(terminal).toBeInTheDocument();
		expect(
			mockInvoke.mock.calls.filter(
				([command]) => command === "herdr_pty_create",
			),
		).toHaveLength(1);

		fireEvent.click(screen.getByRole("button", { name: "Back to Herdr" }));
		await waitFor(() => expect(terminalFocus).toHaveBeenCalled());
		expect(screen.getByTestId("embedded-herdr-terminal")).toBe(terminal);
		expect(
			mockInvoke.mock.calls.filter(
				([command]) => command === "herdr_pty_create",
			),
		).toHaveLength(1);
	});

	it("preserves Quick Open and the FileTree Naia action", async () => {
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-7", pid: 7 };
			if (command === "herdr_snapshot") return snapshot;
			if (command === "workspace_set_root") return "/work/naia";
			return null;
		});
		const ask = vi.fn();
		window.addEventListener("naia:ask-ai", ask);
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		render(<HerdrWorkspaceCenterArea naia={bridge} />);

		fireEvent.keyDown(window, { key: "p", ctrlKey: true });
		expect(await screen.findByText("Quick Open visible")).toBeVisible();
		fireEvent.click(await screen.findByText("Send tree file"));
		expect(ask).toHaveBeenCalledTimes(1);
		window.removeEventListener("naia:ask-ai", ask);
	});

	it("focuses the owning Herdr pane from Agents", async () => {
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-7", pid: 7 };
			if (command === "herdr_snapshot") return snapshot;
			return null;
		});
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		render(<HerdrWorkspaceCenterArea naia={bridge} />);
		fireEvent.click(await screen.findByRole("tab", { name: "Agents" }));
		fireEvent.click(await screen.findByRole("button", { name: /codex/i }));
		await waitFor(() =>
			expect(mockInvoke).toHaveBeenCalledWith("herdr_focus_agent", {
				paneId: "w1:p1",
			}),
		);
	});

	it("routes Naia workspace tools through the active Herdr space and agent", async () => {
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-7", pid: 7 };
			if (command === "herdr_snapshot") return snapshot;
			if (command === "workspace_set_root") return "/work/naia";
			if (command === "workspace_resolve_file_location") {
				return "/work/naia/src/App.tsx";
			}
			return null;
		});
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		render(<HerdrWorkspaceCenterArea naia={bridge} />);

		await waitFor(() =>
			expect(toolHandlers.has("skill_workspace_open_file")).toBe(true),
		);
		const openResult = await toolHandlers.get("skill_workspace_open_file")?.({
			path: "src/App.tsx",
		});
		expect(openResult).toBe("Opened: /work/naia/src/App.tsx");
		await waitFor(() =>
			expect(screen.getByLabelText("File Tree")).toHaveFocus(),
		);
		expect(screen.getByTestId("file-tree-selection")).toHaveTextContent(
			"/work/naia/src/App.tsx",
		);

		const focusResult = await toolHandlers.get(
			"skill_workspace_focus_session",
		)?.({
			dir: "/work/naia",
		});
		expect(focusResult).toBe("Focused: Naia");
		expect(mockInvoke).toHaveBeenCalledWith("herdr_focus_workspace", {
			workspaceId: "w1",
		});

		const sendResult = await toolHandlers.get(
			"skill_workspace_send_to_session",
		)?.({
			dir: "/work/naia",
			text: "inspect the failing test",
		});
		expect(sendResult).toBe("Prompted: /work/naia");
		expect(mockInvoke).toHaveBeenCalledWith("herdr_prompt_agent", {
			paneId: "w1:p1",
			text: "inspect the failing test",
		});
	});

	it("recovers from launch failure and PTY exit without duplicating a live client", async () => {
		let launches = 0;
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") {
				launches++;
				if (launches === 1) throw new Error("launch failed");
				return { pty_id: `pty-${launches}`, pid: launches };
			}
			if (command === "herdr_snapshot") return snapshot;
			return null;
		});
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		render(<HerdrWorkspaceCenterArea naia={bridge} />);

		expect(await screen.findByText(/launch failed/)).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: /Retry|다시 시도/ }));
		expect(
			await screen.findByTestId("embedded-herdr-terminal"),
		).toHaveAttribute("data-pty-id", "pty-2");
		fireEvent.click(screen.getByRole("button", { name: "Exit Herdr PTY" }));
		await waitFor(() =>
			expect(screen.queryByTestId("embedded-herdr-terminal")).toBeNull(),
		);
		fireEvent.click(screen.getByRole("button", { name: /Retry|다시 시도/ }));
		expect(
			await screen.findByTestId("embedded-herdr-terminal"),
		).toHaveAttribute("data-pty-id", "pty-3");
		expect(launches).toBe(3);
	});

	it("covers all Naia bridge controls, errors, and unmount cleanup", async () => {
		mockInvoke.mockImplementation(
			async (command: string, args?: Record<string, unknown>) => {
				if (command === "herdr_pty_create") return { pty_id: "pty-7", pid: 7 };
				if (command === "herdr_snapshot") return snapshot;
				if (command === "workspace_set_root") return "/work/naia";
				if (command === "workspace_resolve_file_location")
					return "/work/naia/src/App.tsx";
				if (command === "workspace_read_file") return "before before";
				if (command === "pty_execute_sync")
					return { stdout: "ok", stderr: "", code: 0 };
				if (
					command === "workspace_write_file" ||
					command === "herdr_create_workspace"
				)
					return null;
				return args ?? null;
			},
		);
		const { HerdrWorkspaceCenterArea } = await import(
			"../HerdrWorkspaceCenterArea"
		);
		const view = render(<HerdrWorkspaceCenterArea naia={bridge} />);
		await waitFor(() => expect(toolHandlers.size).toBeGreaterThanOrEqual(8));

		const sessions = JSON.parse(
			String(await toolHandlers.get("skill_workspace_get_sessions")?.({})),
		);
		expect(sessions.sessions).toHaveLength(1);
		expect(await toolHandlers.get("skill_workspace_get_open_file")?.({})).toBe(
			JSON.stringify({ open: false }),
		);
		await toolHandlers.get("skill_workspace_open_file")?.({
			path: "src/App.tsx",
		});
		await waitFor(async () =>
			expect(
				JSON.parse(
					String(await toolHandlers.get("skill_workspace_get_open_file")?.({})),
				),
			).toMatchObject({ open: true, path: "/work/naia/src/App.tsx" }),
		);
		expect(
			await toolHandlers.get("skill_workspace_edit_open_file")?.({
				search: "before",
				replace: "after",
			}),
		).toBe("Edited: /work/naia/src/App.tsx");
		expect(mockInvoke).toHaveBeenCalledWith("workspace_write_file", {
			path: "/work/naia/src/App.tsx",
			content: "after after",
		});
		expect(editorReloadFile).toHaveBeenCalled();
		expect(
			await toolHandlers.get("skill_workspace_new_session")?.({
				dir: "/work/new",
			}),
		).toBe("Started Herdr space: /work/new");
		expect(mockInvoke).toHaveBeenCalledWith("herdr_create_workspace", {
			cwd: "/work/new",
			label: null,
		});
		const execute = JSON.parse(
			String(
				await toolHandlers.get("skill_workspace_execute")?.({
					dir: "Naia",
					command: "pnpm test",
				}),
			),
		);
		expect(execute).toEqual({ stdout: "ok", stderr: "", code: 0 });
		expect(mockInvoke).toHaveBeenCalledWith("pty_execute_sync", {
			dir: "/work/naia",
			command: "pnpm test",
			timeout_secs: undefined,
		});
		expect(await toolHandlers.get("skill_workspace_open_file")?.({})).toBe(
			"Error: path is required",
		);
		expect(
			await toolHandlers.get("skill_workspace_focus_session")?.({
				dir: "/missing",
			}),
		).toBe("Error: Herdr space not found: /missing");
		expect(
			await toolHandlers.get("skill_workspace_execute")?.({ command: " " }),
		).toBe("Error: command is required");

		view.unmount();
		expect(toolHandlers.size).toBe(0);
	});
});
