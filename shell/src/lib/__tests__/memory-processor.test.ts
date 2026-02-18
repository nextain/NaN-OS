// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFacts, summarizeSession } from "../memory-processor";
import type { MessageRow } from "../db";

describe("memory-processor", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const sampleMessages: MessageRow[] = [
		{
			id: "m1",
			session_id: "s1",
			role: "user",
			content: "내 이름은 Luke야",
			timestamp: 1000,
			cost_json: null,
			tool_calls_json: null,
		},
		{
			id: "m2",
			session_id: "s1",
			role: "assistant",
			content: "안녕하세요 Luke! 반가워요.",
			timestamp: 2000,
			cost_json: null,
			tool_calls_json: null,
		},
	];

	describe("summarizeSession", () => {
		it("returns empty string for empty messages", async () => {
			const result = await summarizeSession([], "key", "gemini");
			expect(result).toBe("");
		});

		it("calls Gemini API and returns summary", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [
							{ content: { parts: [{ text: "User introduced themselves." }] } },
						],
					}),
			});
			vi.stubGlobal("fetch", mockFetch);

			const result = await summarizeSession(
				sampleMessages,
				"test-key",
				"gemini",
			);
			expect(result).toBe("User introduced themselves.");
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it("returns empty string on API error", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({ ok: false, status: 401 }),
			);

			const result = await summarizeSession(
				sampleMessages,
				"bad-key",
				"gemini",
			);
			expect(result).toBe("");
		});

		it("returns empty string on network error", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockRejectedValue(new Error("Network error")),
			);

			const result = await summarizeSession(
				sampleMessages,
				"key",
				"gemini",
			);
			expect(result).toBe("");
		});
	});

	describe("extractFacts", () => {
		it("returns empty array for empty messages", async () => {
			const result = await extractFacts([], "", "key", "gemini");
			expect(result).toEqual([]);
		});

		it("parses JSON array from LLM response", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [
							{
								content: {
									parts: [
										{
											text: 'Here are the facts:\n[{"key":"user_name","value":"Luke"}]',
										},
									],
								},
							},
						],
					}),
			});
			vi.stubGlobal("fetch", mockFetch);

			const result = await extractFacts(
				sampleMessages,
				"User introduced.",
				"test-key",
				"gemini",
			);
			expect(result).toHaveLength(1);
			expect(result[0].key).toBe("user_name");
			expect(result[0].value).toBe("Luke");
		});

		it("returns empty array on malformed response", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							candidates: [
								{ content: { parts: [{ text: "No facts found." }] } },
							],
						}),
				}),
			);

			const result = await extractFacts(
				sampleMessages,
				"",
				"key",
				"gemini",
			);
			expect(result).toEqual([]);
		});
	});
});
