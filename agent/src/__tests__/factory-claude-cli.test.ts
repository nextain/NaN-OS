import { describe, expect, it, vi } from "vitest";

const markerProvider = {
	stream: vi.fn(),
};

vi.mock("../providers/claude-code-cli.js", () => ({
	createClaudeCodeCliProvider: vi.fn(() => markerProvider),
}));

describe("provider factory - claude code cli", () => {
	it("builds claude-code-cli provider without api key", async () => {
		const { buildProvider } = await import("../providers/factory.js");
		const provider = buildProvider({
			provider: "claude-code-cli",
			model: "claude-sonnet-4-5-20250929",
			apiKey: "",
		});
		expect(provider).toBe(markerProvider);
	});
});
