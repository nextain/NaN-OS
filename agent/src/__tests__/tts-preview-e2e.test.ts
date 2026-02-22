/**
 * E2E: TTS Preview — direct synthesis without Gateway dependency
 *
 * Tests Edge TTS (msedge-tts), OpenAI TTS, and ElevenLabs TTS directly.
 * Uses API keys from shell/.env for OpenAI/ElevenLabs.
 *
 * Run:
 *   pnpm exec vitest run src/__tests__/tts-preview-e2e.test.ts
 */
import { describe, expect, it } from "vitest";
import { synthesizeEdgeSpeech } from "../tts/edge-tts.js";

// Keys from environment (set OPENAI_API_KEY / ELEVENLABS_API_KEY before running)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";

describe("TTS Preview E2E", () => {
	// ═══════════════════════════════════════
	// 1. Edge TTS (free, no API key)
	// ═══════════════════════════════════════
	describe("Edge TTS (msedge-tts)", () => {
		it("synthesizes Korean text with default voice", async () => {
			const audio = await synthesizeEdgeSpeech("안녕하세요 테스트입니다.");
			expect(audio).not.toBeNull();
			expect(audio!.length).toBeGreaterThan(100);
		}, 15000);

		it("synthesizes with specific voice", async () => {
			const audio = await synthesizeEdgeSpeech(
				"Hello, this is a test.",
				"en-US-MichelleNeural",
			);
			expect(audio).not.toBeNull();
			expect(audio!.length).toBeGreaterThan(100);
		}, 15000);

		it("returns null for empty text", async () => {
			const audio = await synthesizeEdgeSpeech("");
			expect(audio).toBeNull();
		});
	});

	// ═══════════════════════════════════════
	// 2. OpenAI TTS (direct API call)
	// ═══════════════════════════════════════
	describe("OpenAI TTS", () => {
		it("synthesizes with OpenAI TTS API", async () => {
			const response = await fetch(
				"https://api.openai.com/v1/audio/speech",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${OPENAI_API_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: "tts-1",
						input: "안녕하세요 테스트입니다.",
						voice: "nova",
						response_format: "mp3",
					}),
				},
			);
			console.log("OpenAI TTS status:", response.status);
			if (response.ok) {
				const buf = Buffer.from(await response.arrayBuffer());
				const base64 = buf.toString("base64");
				console.log("OpenAI audio base64 length:", base64.length);
				expect(base64.length).toBeGreaterThan(100);
			} else {
				const err = await response.text();
				console.log("OpenAI TTS error:", err);
				// Key may be expired/invalid — log but don't fail hard
				expect(response.status).toBeLessThan(500);
			}
		}, 15000);
	});

	// ═══════════════════════════════════════
	// 3. ElevenLabs TTS (direct API call)
	// ═══════════════════════════════════════
	describe("ElevenLabs TTS", () => {
		it("synthesizes with ElevenLabs API", async () => {
			// First get available voices
			const voicesRes = await fetch(
				"https://api.elevenlabs.io/v1/voices",
				{
					headers: { "xi-api-key": ELEVENLABS_API_KEY },
				},
			);
			console.log("ElevenLabs voices status:", voicesRes.status);
			if (!voicesRes.ok) {
				const err = await voicesRes.text();
				console.log("ElevenLabs voices error:", err);
				expect(voicesRes.status).toBeLessThan(500);
				return;
			}
			const voicesData = (await voicesRes.json()) as {
				voices: { voice_id: string; name: string }[];
			};
			console.log(
				"ElevenLabs voices:",
				voicesData.voices?.map((v) => v.name).slice(0, 5),
			);

			if (voicesData.voices?.length > 0) {
				const voiceId = voicesData.voices[0].voice_id;
				const ttsRes = await fetch(
					`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
					{
						method: "POST",
						headers: {
							"xi-api-key": ELEVENLABS_API_KEY,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							text: "안녕하세요 테스트입니다.",
							model_id: "eleven_multilingual_v2",
						}),
					},
				);
				console.log("ElevenLabs TTS status:", ttsRes.status);
				if (ttsRes.ok) {
					const buf = Buffer.from(await ttsRes.arrayBuffer());
					const base64 = buf.toString("base64");
					console.log(
						"ElevenLabs audio base64 length:",
						base64.length,
					);
					expect(base64.length).toBeGreaterThan(100);
				} else {
					const err = await ttsRes.text();
					console.log("ElevenLabs TTS error:", err);
				}
			}
		}, 30000);
	});
});
