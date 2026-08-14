import { type Page, expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * Workspace preservation + Herdr integration E2E.
 *
 * The real Herdr process is replaced only at the Tauri command boundary. The
 * browser still renders the production Workspace rail, xterm surface, file
 * tree, viewer, and focus transitions.
 */

const ROOT_A = "/work/alpha";
const ROOT_B = "/work/beta";

const snapshot = {
	protocol: 19,
	version: "0.8.0",
	focused_workspace_id: "w1",
	focused_tab_id: "w1:t1",
	focused_pane_id: "w1:p1",
	workspaces: [
		{
			workspace_id: "w1",
			label: "Alpha",
			focused: true,
			active_tab_id: "w1:t1",
			pane_count: 1,
			tab_count: 1,
			worktree: { checkout_path: ROOT_A, repo_name: "alpha" },
		},
		{
			workspace_id: "w2",
			label: "Beta",
			focused: false,
			active_tab_id: "w2:t1",
			pane_count: 1,
			tab_count: 1,
			worktree: { checkout_path: ROOT_B, repo_name: "beta" },
		},
	],
	agents: [
		{
			workspace_id: "w1",
			tab_id: "w1:t1",
			pane_id: "w1:p1",
			agent: "codex",
			agent_status: "working",
			cwd: ROOT_A,
			foreground_cwd: ROOT_A,
			focused: true,
			label: "Builder",
		},
		{
			workspace_id: "w2",
			tab_id: "w2:t1",
			pane_id: "w2:p1",
			agent: "claude",
			agent_status: "idle",
			cwd: ROOT_B,
			foreground_cwd: ROOT_B,
			focused: false,
			label: "Reviewer",
		},
	],
};

const TAURI_MOCK_SCRIPT = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};

	var callbacks = new Map();
	var nextCallbackId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCallbackId++;
		callbacks.set(id, function(data) {
			if (once) callbacks.delete(id);
			return fn && fn(data);
		});
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) {
		var callback = callbacks.get(id);
		if (callback) callback(data);
	};

	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
	function emitEvent(event, payload) {
		var listeners = eventListeners.get(event) || [];
		for (var callbackId of listeners) {
			window.__TAURI_INTERNALS__.runCallback(callbackId, { event: event, payload: payload });
		}
	}

	var state = ${JSON.stringify(snapshot)};
	var calls = [];
	function setFocus(workspaceId, paneId) {
		state.focused_workspace_id = workspaceId;
		state.focused_pane_id = paneId;
		state.focused_tab_id = workspaceId + ":t1";
		state.workspaces.forEach(function(space) { space.focused = space.workspace_id === workspaceId; });
		state.agents.forEach(function(agent) { agent.focused = agent.pane_id === paneId; });
	}

	window.__NAIA_E2E__ = {
		calls: calls,
		emitEvent: emitEvent,
		externalFocus: function(workspaceId, paneId) { setFocus(workspaceId, paneId); },
	};

	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		calls.push({ cmd: cmd, args: args || null });
		if (cmd === "plugin:event|listen") {
			if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
			eventListeners.get(args.event).push(args.handler);
			return args.handler;
		}
		if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
		if (cmd === "plugin:event|unlisten") return null;
		if (cmd === "herdr_pty_create") return { pty_id: "herdr-e2e", pid: 42 };
		if (cmd === "herdr_snapshot") return JSON.parse(JSON.stringify(state));
		if (cmd === "herdr_focus_workspace") {
			var workspace = state.workspaces.find(function(item) { return item.workspace_id === args.workspaceId; });
			setFocus(args.workspaceId, workspace.active_tab_id.replace(":t1", ":p1"));
			return null;
		}
		if (cmd === "herdr_focus_agent") {
			var agent = state.agents.find(function(item) { return item.pane_id === args.paneId; });
			setFocus(agent.workspace_id, agent.pane_id);
			return null;
		}
		if (cmd === "workspace_set_root") return args.root;
		if (cmd === "workspace_detect_adk_root") return "${ROOT_A}";
		if (cmd === "workspace_list_dirs") {
			if (args.parent === "${ROOT_B}") {
				return [{ name: "beta.ts", path: "${ROOT_B}/beta.ts", is_dir: false, children: null }];
			}
			return [{ name: "alpha.ts", path: "${ROOT_A}/alpha.ts", is_dir: false, children: null }];
		}
		if (cmd === "workspace_read_file") return "export const alpha = true;\\n";
		if (cmd === "workspace_resolve_file_location") return "${ROOT_A}/src/App.tsx";
		if (cmd === "pty_resize" || cmd === "pty_write" || cmd === "pty_close") return null;
		if (cmd === "send_to_agent_command" || cmd === "cancel_stream") return null;
		if (cmd === "frontend_log") return null;
		if (cmd === "panel_list_installed") return [];
		if (cmd === "list_skills" || cmd === "list_stt_models") return [];
		if (cmd === "read_naia_config") return null;
		return undefined;
	};
})();
`;

async function openWorkspace(page: Page): Promise<void> {
	const tab = page.locator('button[data-panel-id="workspace"]');
	await expect(tab).toBeVisible({ timeout: 10_000 });
	await tab.click();
	await expect(page.getByTestId("herdr-workspace")).toBeVisible();
	await expect(page.locator(".workspace-panel__terminal .xterm")).toBeVisible();
}

function callCount(page: Page, command: string): Promise<number> {
	return page.evaluate(
		(cmd) =>
			(window as any).__NAIA_E2E__.calls.filter(
				(call: { cmd: string }) => call.cmd === cmd,
			).length,
		command,
	);
}

function commandArgs(
	page: Page,
	command: string,
): Promise<Array<Record<string, unknown> | null>> {
	return page.evaluate(
		(cmd) =>
			(window as any).__NAIA_E2E__.calls
				.filter((call: { cmd: string }) => call.cmd === cmd)
				.map((call: { args: Record<string, unknown> | null }) => call.args),
		command,
	);
}

test.describe("Herdr Workspace integration", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(TAURI_MOCK_SCRIPT);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await page.addInitScript(() => {
			localStorage.setItem(
				"naia-config",
				JSON.stringify({
					provider: "gemini",
					model: "gemini-2.5-flash",
					apiKey: "e2e-mock-key",
					locale: "ko",
					onboardingComplete: true,
				}),
			);
			localStorage.setItem("naia-adk-path", "${ROOT_A}");
		});
		await page.goto("/");
		await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 10_000 });
	});

	test("파일 트리가 Spaces와 Agents 위에 있고 Herdr가 기본 화면이다", async ({
		page,
	}) => {
		await openWorkspace(page);
		const files = page.locator(".herdr-workspace__files");
		const spaces = page.getByRole("tab", { name: "Spaces" });
		const agents = page.getByRole("tab", { name: "Agents" });
		await expect(files).toBeVisible();
		await expect(spaces).toHaveAttribute("aria-selected", "true");
		await expect(agents).toHaveAttribute("aria-selected", "false");
		expect(
			await files.evaluate(
				(node, tab) =>
					Boolean(
						node.compareDocumentPosition(tab as Node) &
							Node.DOCUMENT_POSITION_FOLLOWING,
					),
				await spaces.elementHandle(),
			),
		).toBe(true);
		expect(
			await spaces.evaluate(
				(node, tab) =>
					Boolean(
						node.compareDocumentPosition(tab as Node) &
							Node.DOCUMENT_POSITION_FOLLOWING,
					),
				await agents.elementHandle(),
			),
		).toBe(true);
		await expect(page.getByText("Alpha", { exact: true })).toBeVisible();
	});

	test("Spaces와 Agents 선택이 Herdr 포커스와 양방향 동기화된다", async ({
		page,
	}) => {
		await openWorkspace(page);
		await page.getByText("Beta", { exact: true }).click();
		await expect.poll(() => callCount(page, "herdr_focus_workspace")).toBe(1);
		expect(await commandArgs(page, "herdr_focus_workspace")).toEqual([
			{ workspaceId: "w2" },
		]);
		await expect(
			page.locator(".herdr-workspace__items button.is-focused"),
		).toContainText("Beta");

		await page.getByRole("tab", { name: "Agents" }).click();
		await page.getByText("Builder", { exact: true }).click();
		await expect.poll(() => callCount(page, "herdr_focus_agent")).toBe(1);
		expect(await commandArgs(page, "herdr_focus_agent")).toEqual([
			{ paneId: "w1:p1" },
		]);
		await expect(
			page.locator(".herdr-workspace__items button.is-focused"),
		).toContainText("Builder");

		await page.evaluate(() =>
			(window as any).__NAIA_E2E__.externalFocus("w2", "w2:p1"),
		);
		await expect(
			page.locator(".herdr-workspace__items button.is-focused"),
		).toContainText("Reviewer", {
			timeout: 3_000,
		});
	});

	test("활성 Space가 바뀌면 파일 트리 루트도 바뀐다", async ({ page }) => {
		await openWorkspace(page);
		await expect(page.getByText("alpha.ts", { exact: true })).toBeVisible();
		await page.getByText("Beta", { exact: true }).click();
		await expect(page.getByText("beta.ts", { exact: true })).toBeVisible();
		await expect(page.getByText("alpha.ts", { exact: true })).toBeHidden();
	});

	test("파일 트리에서 연 파일을 본 뒤 같은 Herdr 터미널로 돌아간다", async ({
		page,
	}) => {
		await openWorkspace(page);
		const terminal = page.locator(".workspace-panel__terminal");
		const terminalNode = await terminal.elementHandle();
		expect(terminalNode).not.toBeNull();
		expect(await callCount(page, "herdr_pty_create")).toBe(1);
		await page.getByText("alpha.ts", { exact: true }).click();
		await expect(page.getByTestId("workspace-viewer")).toBeVisible();
		await expect(terminal).toBeAttached();
		await expect(terminal).toHaveCSS("pointer-events", "none");
		await page.locator(".herdr-workspace__viewer-bar > button").click();
		await expect(page.getByTestId("workspace-viewer")).toBeHidden();
		await expect(terminal).toHaveCSS("pointer-events", "auto");
		expect(
			await terminal.evaluate((node, before) => node === before, terminalNode),
		).toBe(true);
		expect(await callCount(page, "herdr_pty_create")).toBe(1);
		await expect(
			page.locator(".workspace-panel__terminal .xterm-helper-textarea"),
		).toBeFocused();
	});
});
