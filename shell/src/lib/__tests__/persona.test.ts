import { describe, expect, it } from "vitest";
import { buildSystemPrompt, DEFAULT_PERSONA } from "../persona";

describe("buildSystemPrompt", () => {
	it("uses DEFAULT_PERSONA when no persona provided", () => {
		const result = buildSystemPrompt();
		expect(result).toContain("Alpha");
		expect(result).toContain("Emotion tags:");
	});

	it("uses custom persona when provided", () => {
		const result = buildSystemPrompt("You are Beta.");
		expect(result).toContain("You are Beta.");
		expect(result).toContain("Emotion tags:");
		expect(result).not.toContain(DEFAULT_PERSONA);
	});

	it("replaces Alpha with agentName in default persona", () => {
		const result = buildSystemPrompt(undefined, { agentName: "Mochi" });
		expect(result).toContain("You are Mochi");
		expect(result).not.toContain("You are Alpha");
	});

	it("replaces Alpha with agentName in custom persona", () => {
		const result = buildSystemPrompt(
			"You are Alpha (알파), my custom companion.",
			{ agentName: "Mochi" },
		);
		expect(result).toContain("You are Mochi");
		expect(result).not.toContain("You are Alpha");
	});

	it("does not modify persona when agentName is not set", () => {
		const result = buildSystemPrompt();
		expect(result).toContain("You are Alpha (알파)");
	});

	it("injects userName from context", () => {
		const result = buildSystemPrompt(undefined, { userName: "Luke" });
		expect(result).toContain("Luke");
		expect(result).toContain("Address them by name");
	});

	it("injects recent summaries from context", () => {
		const result = buildSystemPrompt(undefined, {
			recentSummaries: ["Discussed Rust programming", "Talked about AI"],
		});
		expect(result).toContain("Recent conversation summaries:");
		expect(result).toContain("Discussed Rust programming");
		expect(result).toContain("Talked about AI");
	});

	it("injects facts from context", () => {
		const result = buildSystemPrompt(undefined, {
			facts: [
				{
					id: "f1",
					key: "favorite_lang",
					value: "Rust",
					source_session: null,
					created_at: 1000,
					updated_at: 1000,
				},
			],
		});
		expect(result).toContain("Known facts about the user:");
		expect(result).toContain("favorite_lang: Rust");
	});

	it("handles empty context gracefully", () => {
		const result = buildSystemPrompt(undefined, {});
		// No context section when all fields empty
		expect(result).not.toContain("Context:");
	});

	it("combines all context fields", () => {
		const result = buildSystemPrompt(undefined, {
			userName: "Luke",
			recentSummaries: ["Talked about Rust"],
			facts: [
				{
					id: "f1",
					key: "role",
					value: "developer",
					source_session: null,
					created_at: 1000,
					updated_at: 1000,
				},
			],
		});
		expect(result).toContain("Luke");
		expect(result).toContain("Talked about Rust");
		expect(result).toContain("role: developer");
	});
});
