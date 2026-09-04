// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AppContext,
	BehaviorEntry,
	NaiaContextBridge,
	ShellResult,
	ToolHandler,
} from "../../lib/app-registry";
import { setLocale } from "../../lib/i18n";
import {
	SLIDE_PRESENTER_SPEAK_EVENT,
	SLIDE_PRESENTER_SPEECH_RESULT_EVENT,
	type SlidePresenterSpeechRequest,
} from "../../lib/slide-presenter-events";

vi.mock("../../lib/logger", () => ({
	Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/config", () => ({ addAllowedTool: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("react-pdf", async () => {
	const React = await vi.importActual<typeof import("react")>("react");
	function Document({
		children,
		onLoadSuccess,
	}: {
		children: React.ReactNode;
		onLoadSuccess?: (document: {
			numPages: number;
			getPage(page: number): Promise<{
				getTextContent(): Promise<{ items: Array<{ str: string }> }>;
			}>;
		}) => void;
	}) {
		const loaded = React.useRef(false);
		React.useEffect(() => {
			if (loaded.current) return;
			loaded.current = true;
			const timer = setTimeout(
				() =>
					onLoadSuccess?.({
						numPages: 3,
						getPage: async (page) => ({
							getTextContent: async () => ({
								items: [{ str: `PDF text ${page}` }],
							}),
						}),
					}),
				0,
			);
			return () => clearTimeout(timer);
		}, []);
		return <div data-testid="pdf-document">{children}</div>;
	}
	function Page({ pageNumber }: { pageNumber: number }) {
		return (
			<div data-testid={`pdf-page-${pageNumber}`}>PDF page {pageNumber}</div>
		);
	}
	return {
		Document,
		Page,
		pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
	};
});
vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

import { SlidesCenterArea } from "../slides/SlidesCenterArea";

class MockBridge implements NaiaContextBridge {
	contexts: AppContext[] = [];
	handlers = new Map<string, ToolHandler>();
	pushContext(ctx: AppContext): void {
		this.contexts.push(ctx);
	}
	onToolCall(name: string, handler: ToolHandler): () => void {
		this.handlers.set(name, handler);
		return () => this.handlers.delete(name);
	}
	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
		return (await this.handlers.get(name)?.(args)) ?? "ok";
	}
	logBehavior(): Promise<void> {
		return Promise.resolve();
	}
	queryBehavior(): Promise<BehaviorEntry[]> {
		return Promise.resolve([]);
	}
	getSecret(): Promise<string | null> {
		return Promise.resolve(null);
	}
	setSecret(): Promise<void> {
		return Promise.resolve();
	}
	readFile(): Promise<string> {
		return Promise.resolve("");
	}
	runShell(): Promise<ShellResult> {
		return Promise.resolve({ stdout: "", stderr: "", code: 0 });
	}
}

describe("SlidesCenterArea", () => {
	beforeEach(async () => {
		await setLocale("ko");
		class ResizeObserverMock {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("loads a PDF and script, requests narration, then advances once", async () => {
		const bridge = new MockBridge();
		const requests: SlidePresenterSpeechRequest[] = [];
		window.addEventListener(SLIDE_PRESENTER_SPEAK_EVENT, (event) => {
			requests.push((event as CustomEvent<SlidePresenterSpeechRequest>).detail);
		});
		render(<SlidesCenterArea naia={bridge} />);

		const pdf = new File(["pdf"], "deck.pdf", { type: "application/pdf" });
		fireEvent.change(screen.getByLabelText("PDF 열기"), {
			target: { files: [pdf] },
		});
		await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());

		const script = new File(["placeholder"], "speaker.md", {
			type: "text/markdown",
		});
		Object.defineProperty(script, "text", {
			value: async () =>
				"## 1. Cover\n\nFirst narration.\n\n## 2. Next\n\nSecond narration.",
		});
		fireEvent.change(screen.getByLabelText("발표 스크립트"), {
			target: { files: [script] },
		});
		await waitFor(() =>
			expect(screen.getByText("First narration.")).toBeInTheDocument(),
		);

		fireEvent.click(screen.getByRole("button", { name: "발표 시작" }));
		await waitFor(() => expect(requests).toHaveLength(1));
		expect(requests[0]).toMatchObject({ page: 1, text: "First narration." });

		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, {
				detail: { ...requests[0], status: "finished" },
			}),
		);
		await waitFor(() => expect(screen.getByText("2 / 3")).toBeInTheDocument());
		await waitFor(() => expect(requests).toHaveLength(2));
		expect(requests[1]).toMatchObject({ page: 2, text: "Second narration." });
	});

	it("pauses through the Naia tool and publishes bounded deck context", async () => {
		const bridge = new MockBridge();
		render(<SlidesCenterArea naia={bridge} />);
		const pdf = new File(["pdf"], "deck.pdf", { type: "application/pdf" });
		fireEvent.change(screen.getByLabelText("PDF 열기"), {
			target: { files: [pdf] },
		});
		await waitFor(() =>
			expect(bridge.handlers.has("skill_slide_presenter")).toBe(true),
		);
		await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());

		await bridge.callTool("skill_slide_presenter", { action: "start" });
		await bridge.callTool("skill_slide_presenter", { action: "question" });
		await waitFor(() =>
			expect(screen.getByText("질문 답변")).toBeInTheDocument(),
		);

		const context = JSON.parse(
			await bridge.callTool("skill_slide_presenter", { action: "get_context" }),
		) as { page: number; totalPages: number; deckContext: string };
		expect(context).toMatchObject({ page: 1, totalPages: 3 });
		expect(context.deckContext).toContain("PDF text 1");
		await waitFor(() =>
			expect(bridge.contexts.at(-1)?.data.state).toBe("answering"),
		);
	});

	it("pauses when the deferred narration consumer cancels an active request", async () => {
		const bridge = new MockBridge();
		const requests: SlidePresenterSpeechRequest[] = [];
		window.addEventListener(SLIDE_PRESENTER_SPEAK_EVENT, (event) => {
			requests.push((event as CustomEvent<SlidePresenterSpeechRequest>).detail);
		});
		render(<SlidesCenterArea naia={bridge} />);
		fireEvent.change(screen.getByLabelText("PDF 열기"), {
			target: {
				files: [new File(["pdf"], "deck.pdf", { type: "application/pdf" })],
			},
		});
		await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "발표 시작" }));
		await waitFor(() => expect(requests).toHaveLength(1));

		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, {
				detail: { ...requests[0], status: "cancelled" },
			}),
		);
		await waitFor(() => expect(screen.getByText("일시정지")).toBeInTheDocument());
	});
});
