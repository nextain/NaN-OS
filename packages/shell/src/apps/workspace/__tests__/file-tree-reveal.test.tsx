// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockUnlisten, scrollIntoView } = vi.hoisted(() => ({
	mockInvoke: vi.fn(),
	mockUnlisten: vi.fn(),
	scrollIntoView: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(mockUnlisten),
}));
vi.mock("../../../lib/logger", () => ({
	Logger: { info: vi.fn(), warn: vi.fn() },
}));

import { FileTree } from "../FileTree";

describe("FileTree open-file reveal", () => {
	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
		mockUnlisten.mockReset();
		scrollIntoView.mockReset();
	});

	it("recursively expands ancestors, selects the file, and scrolls it into view", async () => {
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});
		mockInvoke.mockImplementation(
			async (command: string, args?: Record<string, unknown>) => {
				if (command !== "workspace_list_dirs") return null;
				if (args?.parent === "/work/naia") {
					return [{ name: "src", path: "/work/naia/src", is_dir: true }];
				}
				if (args?.parent === "/work/naia/src") {
					return [
						{ name: "nested", path: "/work/naia/src/nested", is_dir: true },
					];
				}
				if (args?.parent === "/work/naia/src/nested") {
					return [
						{
							name: "App.tsx",
							path: "/work/naia/src/nested/App.tsx",
							is_dir: false,
						},
					];
				}
				return [];
			},
		);

		render(
			<FileTree
				workspaceRoot="/work/naia"
				openFilePath="/work/naia/src/nested/App.tsx"
				onFileSelect={vi.fn()}
			/>,
		);

		const file = await screen.findByRole("button", { name: /App\.tsx/ });
		expect(file).toHaveClass("workspace-tree__node--open");
		await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
		expect(mockInvoke).toHaveBeenCalledWith("workspace_list_dirs", {
			parent: "/work/naia/src",
		});
		expect(mockInvoke).toHaveBeenCalledWith("workspace_list_dirs", {
			parent: "/work/naia/src/nested",
		});
	});
});
