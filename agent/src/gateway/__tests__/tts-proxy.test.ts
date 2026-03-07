import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type TtsProvider,
	type TtsProviderInfo,
	type TtsStatusResult,
	convertTts,
	disableTts,
	enableTts,
	getTtsProviders,
	getTtsStatus,
	setTtsProvider,
} from "../tts-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_STATUS: TtsStatusResult = {
	enabled: true,
	provider: "openai",
	auto: "off",
	mode: "final",
};

const MOCK_PROVIDERS: TtsProviderInfo[] = [
	{
		id: "openai",
		label: "OpenAI",
		configured: true,
		voices: ["alloy", "echo", "nova", "shimmer"],
	},
	{
		id: "elevenlabs",
		label: "ElevenLabs",
		configured: false,
		voices: [],
	},
	{
		id: "edge",
		label: "Edge TTS",
		configured: true,
		voices: ["ko-KR-SunHiNeural", "ko-KR-InJoonNeural"],
	},
];

describe("tts-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "tts.status":
						respond.ok(MOCK_STATUS);
						break;
					case "tts.providers":
						respond.ok(MOCK_PROVIDERS);
						break;
					case "tts.setProvider":
						if (
							params.provider === "openai" ||
							params.provider === "elevenlabs" ||
							params.provider === "edge"
						) {
							respond.ok({
								provider: params.provider,
								applied: true,
							});
						} else {
							respond.error(
								"INVALID_REQUEST",
								`Unknown provider: ${params.provider}`,
							);
						}
						break;
					case "tts.convert":
						if (!params.text) {
							respond.error("INVALID_REQUEST", "text is required");
						} else {
							respond.ok({
								audio: "base64-audio-data-here",
								format: "mp3",
								durationMs: 1500,
							});
						}
						break;
					case "tts.enable":
						respond.ok({ enabled: true });
						break;
					case "tts.disable":
						respond.ok({ enabled: false });
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"tts.status",
					"tts.providers",
					"tts.setProvider",
					"tts.convert",
					"tts.enable",
					"tts.disable",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	describe("getTtsStatus", () => {
		it("returns current TTS status", async () => {
			const result = await getTtsStatus(client);

			expect(result.enabled).toBe(true);
			expect(result.provider).toBe("openai");
			expect(result.auto).toBe("off");
			expect(result.mode).toBe("final");
		});
	});

	describe("getTtsProviders", () => {
		it("returns available providers with voices", async () => {
			const result = await getTtsProviders(client);

			expect(result).toHaveLength(3);
			expect(result[0].id).toBe("openai");
			expect(result[0].configured).toBe(true);
			expect(result[0].voices).toContain("alloy");
			expect(result[1].id).toBe("elevenlabs");
			expect(result[1].configured).toBe(false);
			expect(result[2].id).toBe("edge");
		});
	});

	describe("setTtsProvider", () => {
		it("sets provider successfully", async () => {
			const result = await setTtsProvider(client, "edge");

			expect(result.provider).toBe("edge");
			expect(result.applied).toBe(true);
		});

		it("throws for unknown provider", async () => {
			await expect(
				setTtsProvider(client, "unknown" as TtsProvider),
			).rejects.toThrow();
		});
	});

	describe("convertTts", () => {
		it("converts text to audio", async () => {
			const result = await convertTts(client, "안녕하세요");

			expect(result.audio).toBe("base64-audio-data-here");
			expect(result.format).toBe("mp3");
			expect(result.durationMs).toBe(1500);
		});

		it("returns empty audio when text is empty", async () => {
			const result = await convertTts(client, "");
			expect(result.audio).toBe("");
			expect(result.format).toBe("mp3");
		});
	});

	describe("enableTts / disableTts", () => {
		it("enables TTS", async () => {
			const result = await enableTts(client);

			expect(result.enabled).toBe(true);
		});

		it("disables TTS", async () => {
			const result = await disableTts(client);

			expect(result.enabled).toBe(false);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getTtsStatus(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
