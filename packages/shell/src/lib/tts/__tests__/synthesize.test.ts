import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalVoiceAccessToken } from "../../voice/local-runtime";
import {
	arrayBufferToBase64,
	deriveLanguageCode,
	synthesizeTts,
	warmLocalVoice,
} from "../synthesize";

/** Build a minimal fetch Response-like object for a JSON body. */
function jsonResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
		arrayBuffer: async () => new ArrayBuffer(0),
		headers: new Headers(),
	} as unknown as Response;
}

function busyResponse(retryAfter = "0.5") {
	return new Response(JSON.stringify({ error: "tts_busy", retry_after_seconds: 0.5 }), {
		status: 429,
		headers: { "Content-Type": "application/json", "Retry-After": retryAfter },
	});
}

/** Build a fetch Response-like object that returns raw audio bytes. */
function bytesResponse(bytes: Uint8Array, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => ({}),
		text: async () => "",
		arrayBuffer: async () =>
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	} as unknown as Response;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("arrayBufferToBase64", () => {
	it("round-trips bytes through base64", () => {
		const bytes = new Uint8Array([1, 2, 3, 250, 255]);
		const b64 = arrayBufferToBase64(bytes.buffer);
		expect(atob(b64)).toBe(String.fromCharCode(1, 2, 3, 250, 255));
	});

	it("handles buffers larger than the chunk size without stack overflow", () => {
		const big = new Uint8Array(0x8000 * 2 + 7).fill(65);
		const b64 = arrayBufferToBase64(big.buffer);
		expect(atob(b64).length).toBe(big.length);
	});
});

describe("deriveLanguageCode", () => {
	it("extracts the BCP-47 prefix from a voice name", () => {
		expect(deriveLanguageCode("ko-KR-Neural2-A")).toBe("ko-KR");
		expect(deriveLanguageCode("en-US-Wavenet-B")).toBe("en-US");
	});
	it("defaults to ko-KR for undefined / malformed input", () => {
		expect(deriveLanguageCode(undefined)).toBe("ko-KR");
		expect(deriveLanguageCode("alloy")).toBe("ko-KR");
	});
});

describe("synthesizeTts — nextain (gateway)", () => {
	it("POSTs to the gateway with the Bearer key and returns audio + cost", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ audio_content: "QUJD", cost_usd: 0.002 }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const res = await synthesizeTts({
			text: "안녕",
			voice: "ko-KR-Chirp3-HD-Kore",
			provider: "nextain",
			naiaKey: "gw-secret",
			gatewayUrl: "https://api.nextain.io",
		});

		expect(res).toEqual({ audioBase64: "QUJD", costUsd: 0.002 });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.nextain.io/v1/audio/speech");
		expect((init.headers as Record<string, string>)["X-AnyLLM-Key"]).toBe(
			"Bearer gw-secret",
		);
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			input: "안녕",
			voice: "ko-KR-Chirp3-HD-Kore",
			audio_encoding: "MP3",
		});
	});

	it("strips a trailing slash from the gateway URL", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ audio_content: "QQ==" }));
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "nextain",
			naiaKey: "k",
			gatewayUrl: "https://api.nextain.io/",
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://api.nextain.io/v1/audio/speech",
		);
	});

	it("throws without a naiaKey (the #363 silent-cause)", async () => {
		await expect(
			synthesizeTts({
				text: "x",
				provider: "nextain",
				gatewayUrl: "https://api.nextain.io",
			}),
		).rejects.toThrow(/naiaKey/);
	});

	it("throws without a gateway URL", async () => {
		await expect(
			synthesizeTts({ text: "x", provider: "nextain", naiaKey: "k" }),
		).rejects.toThrow(/게이트웨이/);
	});

	it("surfaces a gateway error with its status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse({ detail: "nope" }, false, 402)),
		);
		await expect(
			synthesizeTts({
				text: "x",
				provider: "nextain",
				naiaKey: "k",
				gatewayUrl: "https://api.nextain.io",
			}),
		).rejects.toThrow(/402/);
	});
});

describe("synthesizeTts — google", () => {
	it("POSTs to the Google REST endpoint with the api key in the query", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ audioContent: "R09PRA==" }));
		vi.stubGlobal("fetch", fetchMock);
		const res = await synthesizeTts({
			text: "hi",
			voice: "ko-KR-Neural2-A",
			provider: "google",
			apiKey: "g-key",
		});
		expect(res.audioBase64).toBe("R09PRA==");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("texttospeech.googleapis.com");
		expect(url).toContain("key=g-key");
		const body = JSON.parse(init.body as string);
		expect(body.voice).toEqual({
			languageCode: "ko-KR",
			name: "ko-KR-Neural2-A",
		});
	});

	it("throws without an api key", async () => {
		await expect(
			synthesizeTts({ text: "x", provider: "google" }),
		).rejects.toThrow(/Google API/);
	});
});

describe("synthesizeTts — openai", () => {
	it("returns base64 of the raw audio bytes and picks tts-1 for standard voices", async () => {
		const bytes = new Uint8Array([10, 20, 30]);
		const fetchMock = vi.fn().mockResolvedValue(bytesResponse(bytes));
		vi.stubGlobal("fetch", fetchMock);
		const res = await synthesizeTts({
			text: "hi",
			voice: "alloy",
			provider: "openai",
			apiKey: "sk-x",
		});
		expect(atob(res.audioBase64)).toBe(String.fromCharCode(10, 20, 30));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.openai.com/v1/audio/speech");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer sk-x",
		);
		expect(JSON.parse(init.body as string).model).toBe("tts-1");
	});

	it("uses gpt-4o-mini-tts for the 4o-only voices", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(bytesResponse(new Uint8Array([1])));
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "hi",
			voice: "marin",
			provider: "openai",
			apiKey: "sk-x",
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe(
			"gpt-4o-mini-tts",
		);
	});
});

describe("synthesizeTts — elevenlabs", () => {
	it("POSTs to the voice endpoint with the xi-api-key header", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(bytesResponse(new Uint8Array([7, 8])));
		vi.stubGlobal("fetch", fetchMock);
		const res = await synthesizeTts({
			text: "hi",
			voice: "voiceXYZ",
			provider: "elevenlabs",
			apiKey: "el-key",
		});
		expect(atob(res.audioBase64)).toBe(String.fromCharCode(7, 8));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("api.elevenlabs.io/v1/text-to-speech/voiceXYZ");
		expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
			"el-key",
		);
	});
});

describe("synthesizeTts — vllm", () => {
	it("POSTs to the local OpenAI-compatible endpoint", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(bytesResponse(new Uint8Array([9])));
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "hi",
			provider: "vllm",
			vllmHost: "http://localhost:8001/",
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://localhost:8001/v1/audio/speech",
		);
	});

	it("throws without a host", async () => {
		await expect(
			synthesizeTts({ text: "x", provider: "vllm" }),
		).rejects.toThrow(/vLLM/);
	});
});

describe("synthesizeTts — naia-local-voice (/v1/audio/speech Runtime contract)", () => {
	// The private Runtime returns audio/wav (RIFF) bytes directly.
	const WAV_BYTES = new Uint8Array([
		0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
	]); // "RIFF....WAVE" 헤더 선두
	const wavResponse = () => ({
		ok: true,
		status: 200,
		arrayBuffer: async () => WAV_BYTES.buffer.slice(0),
		json: async () => ({}),
		text: async () => "",
	});

	it("uses the standard facade endpoint and required OpenAI-compatible fields", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "hello",
			voice: "ref_ko_485.wav",
			provider: "naia-local-voice",
			vllmTtsHost: "http://localhost:8910",
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://localhost:8910/v1/audio/speech",
		);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
			model: "voxcpm2",
			input: "hello",
			voice: "ref_ko_485.wav",
			response_format: "wav",
		});
	});

	it("POSTs to the voice-only Runtime surface and passes the WAV through", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		const res = await synthesizeTts({
			text: "안녕",
			provider: "naia-local-voice",
			vllmTtsHost: "http://localhost:8910/",
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://localhost:8910/v1/audio/speech",
		);
		const init = fetchMock.mock.calls[0][1];
		const body = JSON.parse(init.body as string);
		expect(init.headers).toEqual({ "Content-Type": "application/json" });
		expect(body).toMatchObject({
			model: "voxcpm2",
			input: "안녕",
			voice: "default",
			response_format: "wav",
		});
		// WAV bytes 무변환 패스스루 (AudioQueue/ttsAudioToWav 가 RIFF 네이티브 감지)
		const out = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
		expect(String.fromCharCode(...out.subarray(0, 4))).toBe("RIFF");
		expect(String.fromCharCode(...out.subarray(8, 12))).toBe("WAVE");
		expect(out.length).toBe(WAV_BYTES.length);
	});

	it("voice 미지정 시 naia-default (Runtime이 승인 ref로 해석)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "naia-local-voice",
			vllmTtsHost: "http://localhost:8910",
		});
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			input: "x",
			voice: "default",
		});
	});

	it("UI placeholder voice='default' 도 안정적인 기본 음색으로 정규화", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "naia-local-voice",
			voice: "default", // SettingsTab 이 naia-local-voice 에 넣는 placeholder
			vllmTtsHost: "http://localhost:8910",
		});
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			input: "x",
			voice: "default",
		});
	});

	it("실제 음색 id 는 그대로 전달 (정규화는 placeholder/빈값만)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "naia-local-voice",
			voice: "my-cloned-voice",
			vllmTtsHost: "http://localhost:8910",
		});
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			input: "x",
			voice: "my-cloned-voice",
		});
	});

	it("retries the stable default once when a saved local voice left the palette", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ error: "unknown_voice" }, false, 400),
			)
			.mockResolvedValueOnce(wavResponse());
		vi.stubGlobal("fetch", fetchMock);

		const result = await synthesizeTts({
			text: "안녕",
			provider: "naia-local-voice",
			voice: "removed-preset.wav",
			vllmTtsHost: "http://localhost:8910",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).voice).toBe(
			"removed-preset.wav",
		);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).voice).toBe(
			"default",
		);
		expect(result.audioBase64).toBeTruthy();
	});

	it("does not retry a non-voice validation error", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ error: "invalid_text" }, false, 400));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			synthesizeTts({
				text: "x",
				provider: "naia-local-voice",
				voice: "removed-preset.wav",
				vllmTtsHost: "http://localhost:8910",
			}),
		).rejects.toThrow(/invalid_text/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not retry when the stable default itself is unknown", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ error: "unknown_voice" }, false, 400));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			synthesizeTts({
				text: "x",
				provider: "naia-local-voice",
				voice: "default",
				vllmTtsHost: "http://localhost:8910",
			}),
		).rejects.toThrow(/unknown_voice/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("waits for a cancelled VoxCPM2 job to release the facade busy guard", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(busyResponse("0.25"))
			.mockResolvedValueOnce(busyResponse("0.5"))
			.mockResolvedValueOnce(wavResponse());
		vi.stubGlobal("fetch", fetchMock);

		const synthesis = synthesizeTts({
			text: "new turn after barge-in",
			provider: "naia-local-voice",
		});
		await vi.advanceTimersByTimeAsync(750);

		await expect(synthesis).resolves.toEqual({
			audioBase64: expect.any(String),
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("stops a local busy retry immediately when the user interrupts", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockResolvedValue(busyResponse("1"));
		vi.stubGlobal("fetch", fetchMock);
		const abort = new AbortController();
		const synthesis = synthesizeTts({
			text: "cancel retry",
			provider: "naia-local-voice",
			signal: abort.signal,
		});
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		abort.abort();

		await expect(synthesis).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("restores a persisted uploaded voice before ordinary local synthesis", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ ok: true, source: "upload" }, true, 200))
			.mockResolvedValueOnce(wavResponse());
		vi.stubGlobal("fetch", fetchMock);

		// The app's OWN loopback engine (canonical 127.0.0.1 host) accepts the
		// raw uploaded-clip install.
		await synthesizeTts({
			text: "uploaded voice",
			provider: "naia-local-voice",
			voice: "naia-current",
			localRefAudioBase64: "UklGRiQAAABXQVZF",
			vllmTtsHost: "http://127.0.0.1:8910",
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"http://127.0.0.1:8910/voice",
			"http://127.0.0.1:8910/v1/audio/speech",
		]);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT" });
		const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(body.voice).toBe("current");
	});

	it("custom host: never PUT-injects the uploaded clip; falls back to the server default", async () => {
		// Raw voice injection is a LOCAL-only contract — a remote host (cascade)
		// rejects it (400), and the outbound design is a fingerprint API. The
		// synthesis must go straight to /v1/audio/speech with the DEFAULT voice.
		const fetchMock = vi.fn().mockResolvedValueOnce(wavResponse());
		vi.stubGlobal("fetch", fetchMock);

		await synthesizeTts({
			text: "uploaded voice on remote",
			provider: "naia-local-voice",
			voice: "naia-current",
			localRefAudioBase64: "UklGRiQAAABXQVZF",
			vllmTtsHost: "https://cascade.example",
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://cascade.example/v1/audio/speech",
		]);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.voice).toBe("default");
	});

	it("waits for the local GPU worker when the facade starts first", async () => {
		vi.useFakeTimers();
		const starting = jsonResponse(
			{
				error: "synthesis_failed",
				detail: "<urlopen error [WinError 10061] No connection could be made>",
			},
			false,
			502,
		);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(starting)
			.mockResolvedValueOnce(starting)
			.mockResolvedValueOnce(wavResponse());
		vi.stubGlobal("fetch", fetchMock);

		const synthesis = synthesizeTts({
			text: "first reply while VoxCPM2 loads",
			provider: "naia-local-voice",
		});
		await vi.advanceTimersByTimeAsync(2_500);

		await expect(synthesis).resolves.toEqual({
			audioBase64: expect.any(String),
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("does not retry an ambiguous facade failure", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({ error: "synthesis_failed", detail: "CUDA out of memory" }, false, 502),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(synthesizeTts({
			text: "do not duplicate an accepted POST",
			provider: "naia-local-voice",
		})).rejects.toThrow(/502/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uses vllmTtsHost, never the LLM vllmHost", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "naia-local-voice",
			vllmHost: "http://localhost:8000", // LLM — 무시
			vllmTtsHost: "http://localhost:8910",
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://localhost:8910/v1/audio/speech",
		);
	});

	it("defaults to :8910 facade when no voice host (never the LLM vllmHost)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(wavResponse());
		vi.stubGlobal("fetch", fetchMock);
		await synthesizeTts({
			text: "x",
			provider: "naia-local-voice",
			vllmHost: "http://localhost:9000", // LLM — 폴백 안 함
		});
		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://127.0.0.1:8910/v1/audio/speech",
		);
	});

	it("throws on service error (5xx)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse({ error: "OOM" }, false, 500)),
		);
		await expect(
			synthesizeTts({ text: "x", provider: "naia-local-voice" }),
		).rejects.toThrow(/로컬 음성 합성 실패/);
	});
});

describe("synthesizeTts — edge (bgm sidecar)", () => {
	it("fetches the sidecar /edge-tts with a resolved edge voice", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(bytesResponse(new Uint8Array([1, 2, 3])));
		vi.stubGlobal("fetch", fetchMock);
		const res = await synthesizeTts({
			text: "안녕",
			voice: "ko-KR-Neural2-A", // a Google voice → resolved to an edge voice
			provider: "edge",
		});
		expect(atob(res.audioBase64)).toBe(String.fromCharCode(1, 2, 3));
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain("http://localhost:18791/edge-tts");
		expect(url).toContain("voice=ko-KR-SunHiNeural"); // Neural2-A → edge default
	});

	it("surfaces a sidecar error (e.g. not running)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				text: async () => "",
			} as unknown as Response),
		);
		await expect(
			synthesizeTts({ text: "x", provider: "edge" }),
		).rejects.toThrow(/사이드카/);
	});
});

describe("warmLocalVoice — apply-time cold-cost prepayment", () => {
	// Own loopback engine host (DEFAULT_LOCAL_VOICE_HOST).
	const BASE = "http://127.0.0.1:8910";
	const TOKEN_KEY = "naia.voxcpm2AccessToken";

	// This suite runs in the node environment (no jsdom) — stub the Web Storage
	// surface localVoiceAuthHeaders reads the per-launch bearer from.
	const stubStorage = (token: string | null) => {
		const store = new Map<string, string>(
			token ? [[TOKEN_KEY, token]] : [],
		);
		vi.stubGlobal("sessionStorage", {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		});
	};
	const seedToken = () => stubStorage("warm-test-token");

	afterEach(() => {
		clearLocalVoiceAccessToken();
	});

	it("engine not running → skips silently (no speech POST, no spawn)", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError("refused"));
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			warmLocalVoice({ voice: "cc0-ko-female-02.wav" }),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(1); // health probe only
		expect(String(fetchMock.mock.calls[0][0])).toBe(`${BASE}/health`);
	});

	it("engine ready → one authenticated speech POST for the applied voice", async () => {
		seedToken();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ ok: true })) // /health
			.mockResolvedValueOnce(bytesResponse(new Uint8Array([1]))); // /v1/audio/speech
		vi.stubGlobal("fetch", fetchMock);
		await warmLocalVoice({ voice: "cc0-ko-female-02.wav" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[1];
		expect(String(url)).toBe(`${BASE}/v1/audio/speech`);
		expect(init.headers.Authorization).toBe("Bearer warm-test-token");
		const body = JSON.parse(init.body as string);
		expect(body.voice).toBe("cc0-ko-female-02.wav");
		// Medium-length warm text — very short inputs trigger runaway generation.
		expect(body.input.length).toBeGreaterThan(10);
	});

	it("uploaded voice → installs the clip (PUT /voice) BEFORE warming 'current'", async () => {
		seedToken();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ ok: true })) // /health
			.mockResolvedValueOnce(jsonResponse({ ok: true })) // PUT /voice
			.mockResolvedValueOnce(bytesResponse(new Uint8Array([1]))); // speech
		vi.stubGlobal("fetch", fetchMock);
		await warmLocalVoice({ voice: "current", localRefAudioBase64: "QUJD" });
		expect(String(fetchMock.mock.calls[1][0])).toBe(`${BASE}/voice`);
		expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
			audio_base64: "QUJD",
		});
		const speechBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
		expect(speechBody.voice).toBe("current");
	});

	it("speech failure (non-busy, e.g. 500) → resolves without throwing", async () => {
		// (429 busy is RETRIED — the startup prime holds the single slot exactly
		// when a warm matters most; that path is covered by the real-engine e2e.)
		seedToken();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ ok: true })) // /health
			.mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			warmLocalVoice({ voice: "cc0-ko-male-01.wav" }),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2); // non-429 → no retry loop
	});
});

describe("synthesizeTts — unsupported", () => {
	it("rejects an unknown provider", async () => {
		await expect(
			// @ts-expect-error — intentional invalid provider
			synthesizeTts({ text: "x", provider: "bogus" }),
		).rejects.toThrow(/지원하지 않는/);
	});
});
