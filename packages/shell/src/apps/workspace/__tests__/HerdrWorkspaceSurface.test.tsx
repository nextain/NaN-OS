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

/** 터미널 백엔드가 끊긴 자리. 그 자리만 최소로 그린다. */
function renderTerminalState(overrides: {
	launching: boolean;
	launchError: string;
	launchHerdr?: () => Promise<void>;
}) {
	return render(
		<HerdrWorkspaceSurface
			pty={null}
			launching={overrides.launching}
			launchError={overrides.launchError}
			snapshot={null}
			snapshotError=""
			terminalReady={false}
			terminalError=""
			surface="herdr"
			workspaceRoot="/work/naia"
			terminalRef={createRef()}
			editorRef={createRef()}
			openDocs={[]}
			openFilePath=""
			launchHerdr={overrides.launchHerdr ?? (async () => {})}
			retryHerdr={vi.fn()}
			onTerminalReady={vi.fn()}
			showHerdr={vi.fn()}
			onPtyExit={vi.fn()}
			openLocation={vi.fn()}
			setOpenFilePath={vi.fn()}
			closeDoc={vi.fn()}
			sendToNaia={vi.fn()}
		/>,
	);
}

describe("HerdrWorkspaceSurface terminal backend loss (#573)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("announces the lost terminal backend and offers a way back", () => {
		// herdr 자식이 죽으면 `onPtyExit` 이 pty 를 비우고 사유를 남긴다. 그 사실이
		// 화면 한구석의 글자로만 남으면 보조 기술도, 다른 곳을 보던 사람도 터미널이
		// 사라진 것을 모른다 — 알림이어야 하고, 같은 자리에 다음 행동이 있어야 한다.
		const launchHerdr = vi.fn(async () => {});
		renderTerminalState({
			launching: false,
			launchError: "Herdr가 종료되었습니다",
			launchHerdr,
		});

		const alert = screen.getByRole("alert");
		expect(alert).toBeVisible();
		expect(alert).toHaveTextContent("Herdr가 종료되었습니다");

		const reconnect = screen.getByTestId("workspace-terminal-reconnect");
		expect(alert).toContainElement(reconnect);
		fireEvent.click(reconnect);
		expect(launchHerdr).toHaveBeenCalledTimes(1);
	});

	it("starting is progress, not an alarm", () => {
		// 시작 중인 것은 실패가 아니다. 그 자리를 알림으로 두면 매번 뜨는 알림이
		// 되어, 정작 끊겼을 때의 알림이 묻힌다.
		renderTerminalState({ launching: true, launchError: "" });
		expect(screen.queryByRole("alert")).toBeNull();
		const status = screen.getByTestId("workspace-terminal-state");
		expect(status).toHaveAttribute("role", "status");
		expect(status).toHaveAttribute("aria-live", "polite");
		expect(screen.queryByTestId("workspace-terminal-reconnect")).toBeNull();
	});
});
