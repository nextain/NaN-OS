// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	highlightCode,
	MarkdownCodeBlock,
	MermaidBlock,
} from "../MarkdownCodeBlock";

const renderMermaid = vi.fn();
vi.mock("mermaid", () => ({
	default: { initialize: vi.fn(), render: (...args: unknown[]) => renderMermaid(...args) },
}));

describe("MarkdownCodeBlock", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn().mockResolvedValue(undefined) },
		});
	});

	it("shows language controls, copies the exact code, and confirms success", async () => {
		const openWorkspace = vi.fn();
		render(
			<MarkdownCodeBlock className="language-ts" onOpenWorkspace={openWorkspace}>
				{"const answer = 42;\n"}
			</MarkdownCodeBlock>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const answer = 42;");
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByRole("button", { name: "워크스페이스에서 열기" }));
		expect(openWorkspace).toHaveBeenCalledWith("const answer = 42;", "ts");
	});

	it("highlights known languages and escapes executable markup", () => {
		expect(highlightCode("const answer = 42;", "typescript")).toContain(
			"hljs-keyword",
		);
		const hostile = highlightCode('<script>alert("x")</script>', "html");
		expect(hostile).not.toContain("<script>");
		expect(hostile).toContain("&lt;");
	});

	it("renders unknown languages as escaped plaintext", () => {
		const { container } = render(
			<MarkdownCodeBlock className="language-not-a-real-language">
				{"<img src=x onerror=alert(1)>"}
			</MarkdownCodeBlock>,
		);
		expect(container.querySelector("code")?.innerHTML).toContain("&lt;img");
		expect(container.querySelector("img")).toBeNull();
	});

	it("falls back to Mermaid source when strict rendering fails", async () => {
		renderMermaid.mockRejectedValue(new Error("unsafe syntax"));
		render(<MermaidBlock code="graph TD; A-->B" />);
		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
		expect(screen.getByText("graph TD; A-->B")).toBeInTheDocument();
	});
});
