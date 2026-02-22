import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONA, buildSystemPrompt } from "../persona";

describe("buildSystemPrompt", () => {
	it("uses DEFAULT_PERSONA when no persona provided", () => {
		const result = buildSystemPrompt();
		expect(result).toContain("Naia");
		expect(result).toContain("Emotion tags (for Shell avatar only):");
	});

	it("uses custom persona when provided", () => {
		const result = buildSystemPrompt("You are Beta.");
		expect(result).toContain("You are Beta.");
		expect(result).toContain("Emotion tags (for Shell avatar only):");
		expect(result).not.toContain(DEFAULT_PERSONA);
	});

	it("replaces Naia with agentName in default persona", () => {
		const result = buildSystemPrompt(undefined, { agentName: "Mochi" });
		expect(result).toContain("You are Mochi");
		expect(result).not.toContain("You are Naia");
	});

	it("replaces Naia with agentName in custom persona", () => {
		const result = buildSystemPrompt(
			"You are Naia (낸), my custom companion.",
			{ agentName: "Mochi" },
		);
		expect(result).toContain("You are Mochi");
		expect(result).not.toContain("You are Naia");
	});

	it("does not modify persona when agentName is not set", () => {
		const result = buildSystemPrompt();
		expect(result).toContain("You are Naia (낸)");
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

	it("injects honorific into system prompt", () => {
		const result = buildSystemPrompt(undefined, {
			userName: "Luke",
			honorific: "오빠",
		});
		expect(result).toContain('Call the user "Luke오빠"');
	});

	it("injects casual speechStyle into system prompt", () => {
		const result = buildSystemPrompt(undefined, { speechStyle: "반말" });
		expect(result).toContain("Speak casually in Korean (반말)");
		expect(result).toContain("Do NOT use 존댓말");
	});

	it("injects formal speechStyle into system prompt", () => {
		const result = buildSystemPrompt(undefined, { speechStyle: "존댓말" });
		expect(result).toContain("Speak politely in Korean (존댓말)");
		expect(result).toContain("Do NOT use 반말");
	});

	it("does not inject honorific/speechStyle when not set", () => {
		const result = buildSystemPrompt(undefined, { userName: "Luke" });
		expect(result).not.toContain("Call the user");
		expect(result).not.toContain("Speak casually");
		expect(result).not.toContain("Speak politely");
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
