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

	it("공식 엔드포인트에서 비-LLM 모델(embedding/tts/whisper/이미지 등)을 걸러낸다", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{ id: "gpt-5.6-sol" },
						{ id: "text-embedding-3-small" },
						{ id: "tts-1-hd" },
						{ id: "whisper-1" },
						{ id: "gpt-4o-transcribe" },
						{ id: "gpt-image-2" },
						{ id: "dall-e-3" },
						{ id: "omni-moderation-latest" },
						{ id: "sora-2" },
						{ id: "gpt-realtime-2.1" },
					],
				}),
				{ status: 200 },
			),
		);
		const { models } = await fetchOpenAIModels(undefined, "secret");
		const ids = models.map((m) => m.id);
		expect(ids).toContain("gpt-5.6-sol");
		// 공식 엔드포인트에서는 정적 registry 의 음성(omni) 모델이 유지된다.
		expect(ids).toContain("gpt-4o-mini-realtime-preview");
		for (const nonChat of [
			"text-embedding-3-small",
			"tts-1-hd",
			"whisper-1",
			"gpt-4o-transcribe",
			"gpt-image-2",
			"dall-e-3",
			"omni-moderation-latest",
			"sora-2",
			"gpt-realtime-2.1",
		]) {
			expect(ids, nonChat).not.toContain(nonChat);
		}
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
