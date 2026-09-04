// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatMarkdown } from "../ChatMarkdown";

describe("ChatMarkdown", () => {
	afterEach(cleanup);

	it("renders GFM content while excluding raw HTML", () => {
		const { container } = render(
			<ChatMarkdown>{"**ready**\n\n<script>unsafe()</script>"}</ChatMarkdown>,
		);

		expect(screen.getByText("ready").tagName).toBe("STRONG");
		expect(container.querySelector("script")).toBeNull();
	});

	it("preserves workspace file deep links", () => {
		render(<ChatMarkdown>{"Open /tmp/result.json"}</ChatMarkdown>);

		expect(
			screen.getByRole("button", { name: "/tmp/result.json" }),
		).toBeDefined();
	});
});
