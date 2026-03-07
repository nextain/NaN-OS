import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { EMBEDDING_DIMS, embedText, embedTexts } from "../embeddings.js";

/**
 * Unit tests for Gemini text-embedding-004 API wrapper.
 *
 * Uses fetch mocking — no real API calls.
 */

const FAKE_VECTOR = Array.from({ length: EMBEDDING_DIMS }, (_, i) =>
	Math.sin(i * 0.1),
);

describe("embeddings", () => {
	const originalFetch = globalThis.fetch;

	beforeAll(() => {
		globalThis.fetch = vi.fn();
	});

	beforeEach(() => {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockReset();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetchOk(values: number[][]) {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				embeddings: values.map((v) => ({ values: v })),
			}),
		});
	}

	function mockFetchError(status: number, message: string) {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status,
			text: async () => message,
		});
	}

	describe("embedText", () => {
		it("returns a 768-dim vector for a single text", async () => {
			mockFetchOk([FAKE_VECTOR]);

			const result = await embedText("hello world", "test-api-key");

			expect(result).toHaveLength(EMBEDDING_DIMS);
			expect(result[0]).toBeCloseTo(Math.sin(0));
			expect(result[1]).toBeCloseTo(Math.sin(0.1));
		});

		it("calls the correct Gemini embedding endpoint", async () => {
			mockFetchOk([FAKE_VECTOR]);

			await embedText("test input", "my-key");

			expect(globalThis.fetch).toHaveBeenCalledWith(
				expect.stringContaining("models/text-embedding-004:batchEmbedContents"),
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
				}),
			);

			// Verify API key is in URL
			const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as string;
			expect(callUrl).toContain("key=my-key");
		});

		it("throws on API error", async () => {
			mockFetchError(401, "Unauthorized");

			await expect(embedText("test", "bad-key")).rejects.toThrow(
				/Gemini Embedding API error: 401/,
			);
		});

		it("throws on empty response", async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ embeddings: [] }),
			});

			await expect(embedText("test", "key")).rejects.toThrow(
				/No embedding returned/,
			);
		});
	});

	describe("embedTexts", () => {
		it("returns vectors for multiple texts in a single batch call", async () => {
			const vectors = [FAKE_VECTOR, FAKE_VECTOR.map((v) => -v)];
			mockFetchOk(vectors);

			const result = await embedTexts(["hello", "world"], "test-api-key");

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveLength(EMBEDDING_DIMS);
			expect(result[1]).toHaveLength(EMBEDDING_DIMS);
			expect(result[1][0]).toBeCloseTo(-Math.sin(0));
		});

		it("sends all texts in the request body", async () => {
			mockFetchOk([FAKE_VECTOR, FAKE_VECTOR]);

			await embedTexts(["a", "b"], "key");

			const callBody = JSON.parse(
				(globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
			);
			expect(callBody.requests).toHaveLength(2);
			expect(callBody.requests[0].content.parts[0].text).toBe("a");
			expect(callBody.requests[1].content.parts[0].text).toBe("b");
		});

		it("returns empty array for empty input", async () => {
			const result = await embedTexts([], "key");
			expect(result).toEqual([]);
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});
	});
});
