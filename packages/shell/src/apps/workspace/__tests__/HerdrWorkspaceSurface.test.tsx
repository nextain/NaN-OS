// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, forwardRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HerdrWorkspaceSurface } from "../HerdrWorkspaceSurface";

vi.mock("../Terminal", () => ({
	Terminal: () => <div data-testid="terminal" />,
}));

describe("HerdrWorkspaceSurface editor chunk", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("keeps the terminal mounted and retries a failed editor import", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const Editor = forwardRef(function TestEditor() {
			return <div data-testid="editor">loaded</div>;
		});
		const editorLoader = vi
			.fn()
			.mockRejectedValueOnce(new Error("chunk unavailable"))
			.mockResolvedValue({ default: Editor });

		render(
			<HerdrWorkspaceSurface
				pty={{ pty_id: "pty-1", pid: 1 }}
				launching={false}
				launchError=""
				snapshot={null}
				snapshotError=""
				terminalReady={true}
				terminalError=""
				surface="viewer"
				workspaceRoot="/work/naia"
				terminalRef={createRef()}
				editorRef={createRef()}
				openDocs={["/work/naia/README.md"]}
				openFilePath="/work/naia/README.md"
				launchHerdr={vi.fn()}
				retryHerdr={vi.fn()}
				onTerminalReady={vi.fn()}
				showHerdr={vi.fn()}
				onPtyExit={vi.fn()}
				openLocation={vi.fn()}
				setOpenFilePath={vi.fn()}
				closeDoc={vi.fn()}
				sendToNaia={vi.fn()}
				editorLoader={editorLoader}
			/>,
		);

		expect(
			screen.getByText(/Loading editor|편집기를 불러오는 중/),
		).toBeVisible();
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(screen.getByTestId("terminal")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Retry|다시 시도/ }));

		expect(await screen.findByTestId("editor")).toBeVisible();
		expect(editorLoader).toHaveBeenCalledTimes(2);
		expect(screen.getByTestId("terminal")).toBeInTheDocument();
	});
});
