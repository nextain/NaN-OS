import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenAIModels } from "../registry";
import {
	effectiveOpenAIBaseUrl,
	normalizeOpenAIBaseUrl,
} from "../openai-base-url";

describe("OpenAI base URL", () => {
	afterEach(() => vi.restoreAllMocks());

	it.each([
		["http://100.91.187.24:11435", "http://100.91.187.24:11435/v1"],
		["http://host:8000/", "http://host:8000/v1"],
		["http://host:8000/v1/", "http://host:8000/v1"],
	])("normalizes %s", (input, output) =>
		expect(normalizeOpenAIBaseUrl(input)).toBe(output),
	);
	it("uses the official endpoint for an empty override", () =>
		expect(effectiveOpenAIBaseUrl(" ")).toBe("https://api.openai.com/v1"));

	it("uses the normalized custom endpoint for model discovery", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: [{ id: "dflash-qwen" }] }), {
				status: 200,
			}),
		);

		await expect(
			fetchOpenAIModels("http://gpu:11435/", "secret"),
		).resolves.toEqual({
			connected: true,
			models: [
				{
					id: "dflash-qwen",
					label: "dflash-qwen",
					capabilities: ["llm"],
				},
			],
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"http://gpu:11435/v1/models",
			expect.objectContaining({ headers: { Authorization: "Bearer secret" } }),
		);
	});

	it("does not send the masked key placeholder", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);
		await fetchOpenAIModels(undefined, "*****");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.openai.com/v1/models",
			expect.objectContaining({ headers: {} }),
		);
	});
});
