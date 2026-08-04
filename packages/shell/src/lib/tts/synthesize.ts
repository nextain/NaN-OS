/**
 * Shell-direct TTS synthesis (A안 — #363).
 *
 * Pipeline / preview TTS previously routed through the agent via a
 * `tts_request` IPC message. new-core's agent has **no TTS synthesis** — the
 * message fell through `agent_dispatcher`'s `_ => {}` arm and was dropped, so
 * every cloud provider (edge/google/nextain/openai/elevenlabs) went silent
 * (30s timeout → no audio). The only real cloud TTS backend in the ecosystem is
 * the gateway's `/v1/audio/speech` (Google Cloud TTS proxied via Nextain
 * credits); the agent's `skill_tts` was only ever an advertised tool, never a
 * synthesizer.
 *
 * This module synthesizes **directly from the shell webview** — the same
 * pattern the realtime voice paths (gemini-live / naia-omni WebSocket) and the
 * SettingsTab voice preview already use — bypassing the agent entirely. Per the
 * brain/body/environment layering, the agent (brain) does not own audio output;
 * the shell (body) does.
 *
 * Browser TTS (`isClientSide`) is handled by the caller via `speechSynthesis`
 * and never reaches here.
 */

import { BGM_SIDECAR_BASE_URL } from "../bgm-sidecar-url";
import { DEFAULT_LOCAL_VOICE_HOST, type TtsProviderId } from "../config";
import { Logger } from "../logger";
import { resolveEdgeVoice } from "./edge-tts";

// Edge neural TTS runs in the bgm/media sidecar (node msedge-tts) — the in-app
// webview can't do the MS WebSocket handshake (it can't set the required
// headers/Origin → 400). The shell fetches the sidecar's /edge-tts (#363).
const EDGE_TTS_SIDECAR_URL = `${BGM_SIDECAR_BASE_URL}/edge-tts`;
const LOCAL_VOICE_BUSY_RETRY_DELAYS_MS = [
	250, 500, 750, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500,
];
const LOCAL_VOICE_BUSY_MAX_RETRY_DELAY_MS = 3_500;

function retryAfterMs(response: Response, fallbackMs: number): number {
	const raw = response.headers?.get?.("Retry-After")?.trim();
	if (!raw) return fallbackMs;
	const seconds = Number(raw);
	if (Number.isFinite(seconds)) {
		return Math.min(
			LOCAL_VOICE_BUSY_MAX_RETRY_DELAY_MS,
			Math.max(100, Math.round(seconds * 1_000)),
		);
	}
	const dateMs = Date.parse(raw);
	if (!Number.isFinite(dateMs)) return fallbackMs;
	return Math.min(
		LOCAL_VOICE_BUSY_MAX_RETRY_DELAY_MS,
		Math.max(100, dateMs - Date.now()),
	);
}

export interface SynthesizeOpts {
	/** Text to speak (emotion tags / emoji already stripped by caller). */
	text: string;
	/** Provider-specific voice id. May be undefined → provider default. */
	voice?: string;
	/** 오디오 인코딩(nextain). 기본 MP3(재생용). 아바타 립싱크는 LINEAR16(PCM 24k)로
	 *  받아 cascade /stream 에 그대로 흘림(Ditto 구동). */
	encoding?: "MP3" | "LINEAR16";
	provider: TtsProviderId;
	/** Direct-provider API key (google / openai / elevenlabs). */
	apiKey?: string;
	/** Naia gateway key (nextain provider). */
	naiaKey?: string;
	/** Gateway base URL, no trailing slash (nextain provider). */
	gatewayUrl?: string;
	/** Local vLLM base URL (vllm provider — LLM-style OpenAI host). */
	vllmHost?: string;
	/**
	 * Local voice engine host (naia-local-voice provider) — distinct from
	 * `vllmHost` (which is the LLM host). When unset, it uses the installed
	 * cascade facade at `http://localhost:8910`; it never falls back to the
	 * LLM host or a cloud voice.
	 */
	vllmTtsHost?: string;
	/** Abort signal for cancellation / interrupt. */
	signal?: AbortSignal;
}

export interface SynthesizeResult {
	/** Base64-encoded audio (MP3, or WAV for some local engines). */
	audioBase64: string;
	/** Server-reported cost in USD (gateway/nextain only; undefined otherwise). */
	costUsd?: number;
}

/**
 * ArrayBuffer → base64 in fixed-size chunks (avoids
 * `Maximum call stack size exceeded` from spreading a large byte array).
 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(
			...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
		);
	}
	return btoa(binary);
}

/** Derive a BCP-47 language code from a voice name (`ko-KR-Neural2-A` → `ko-KR`). */
export function deriveLanguageCode(voice: string | undefined): string {
	if (!voice) return "ko-KR";
	const parts = voice.split("-");
	if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
	return "ko-KR";
}

async function errorDetail(resp: Response): Promise<string> {
	try {
		const body = await resp.text();
		return body.slice(0, 200);
	} catch {
		return "";
	}
}

/** nextain → gateway `/v1/audio/speech` (Google TTS proxied via Nextain credit). */
async function synthNextain(opts: SynthesizeOpts): Promise<SynthesizeResult> {
	if (!opts.naiaKey) {
		throw new Error("Naia 로그인이 필요합니다 (naiaKey 없음).");
	}
	const base = opts.gatewayUrl?.replace(/\/$/, "");
	if (!base) {
		throw new Error("게이트웨이 URL이 설정되지 않았습니다.");
	}
	const resp = await fetch(`${base}/v1/audio/speech`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-AnyLLM-Key": `Bearer ${opts.naiaKey}`,
		},
		body: JSON.stringify({
			input: opts.text,
			// Gateway defaults bare names (no "-") to ko-KR-Neural2-A.
			voice: opts.voice || "ko-KR-Neural2-A",
			audio_encoding: opts.encoding || "MP3",
		}),
		signal: opts.signal,
	});
	if (!resp.ok) {
		throw new Error(
			`Naia TTS 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	const data = (await resp.json()) as {
		audio_content?: string;
		cost_usd?: number;
	};
	if (!data.audio_content) {
		throw new Error("Naia TTS 오디오를 수신하지 못했습니다.");
	}
	return { audioBase64: data.audio_content, costUsd: data.cost_usd };
}

/** google → Google Cloud TTS REST (`text:synthesize`) with a user API key. */
async function synthGoogle(opts: SynthesizeOpts): Promise<SynthesizeResult> {
	if (!opts.apiKey) {
		throw new Error("Google API 키가 필요합니다.");
	}
	const voice = opts.voice || "ko-KR-Neural2-A";
	const resp = await fetch(
		`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(opts.apiKey)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: { text: opts.text },
				voice: { languageCode: deriveLanguageCode(voice), name: voice },
				audioConfig: { audioEncoding: "MP3" },
			}),
			signal: opts.signal,
		},
	);
	if (!resp.ok) {
		throw new Error(
			`Google TTS 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	const data = (await resp.json()) as { audioContent?: string };
	if (!data.audioContent) {
		throw new Error("Google TTS 오디오를 수신하지 못했습니다.");
	}
	return { audioBase64: data.audioContent };
}

// Voices that are only available on the gpt-4o-mini-tts model.
const OPENAI_4O_VOICES = new Set(["ballad", "verse", "marin", "cedar"]);

/** openai → `/v1/audio/speech` (returns raw audio bytes). */
async function synthOpenai(opts: SynthesizeOpts): Promise<SynthesizeResult> {
	if (!opts.apiKey) {
		throw new Error("OpenAI API 키가 필요합니다.");
	}
	const voice = opts.voice || "alloy";
	const model = OPENAI_4O_VOICES.has(voice) ? "gpt-4o-mini-tts" : "tts-1";
	const resp = await fetch("https://api.openai.com/v1/audio/speech", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${opts.apiKey}`,
		},
		body: JSON.stringify({
			model,
			input: opts.text,
			voice,
			response_format: "mp3",
		}),
		signal: opts.signal,
	});
	if (!resp.ok) {
		throw new Error(
			`OpenAI TTS 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	return { audioBase64: arrayBufferToBase64(await resp.arrayBuffer()) };
}

/** elevenlabs → `/v1/text-to-speech/{voiceId}` (returns raw MP3 bytes). */
async function synthElevenlabs(
	opts: SynthesizeOpts,
): Promise<SynthesizeResult> {
	if (!opts.apiKey) {
		throw new Error("ElevenLabs API 키가 필요합니다.");
	}
	// Rachel — ElevenLabs' default multilingual voice.
	const voiceId = opts.voice || "21m00Tcm4TlvDq8ikWAM";
	const resp = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"xi-api-key": opts.apiKey,
				Accept: "audio/mpeg",
			},
			body: JSON.stringify({
				text: opts.text,
				model_id: "eleven_multilingual_v2",
			}),
			signal: opts.signal,
		},
	);
	if (!resp.ok) {
		throw new Error(
			`ElevenLabs TTS 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	return { audioBase64: arrayBufferToBase64(await resp.arrayBuffer()) };
}

/** vllm → local OpenAI-compatible `/v1/audio/speech`. */
async function synthVllm(opts: SynthesizeOpts): Promise<SynthesizeResult> {
	const base = opts.vllmHost?.replace(/\/$/, "");
	if (!base) {
		throw new Error("vLLM 호스트가 설정되지 않았습니다.");
	}
	const resp = await fetch(`${base}/v1/audio/speech`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: "tts",
			input: opts.text,
			voice: opts.voice || "default",
			response_format: "mp3",
		}),
		signal: opts.signal,
	});
	if (!resp.ok) {
		throw new Error(
			`vLLM TTS 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	return { audioBase64: arrayBufferToBase64(await resp.arrayBuffer()) };
}

/** edge → bgm/media sidecar (node msedge-tts → real MS neural voices, keyless). */
async function synthEdge(opts: SynthesizeOpts): Promise<SynthesizeResult> {
	const voice = resolveEdgeVoice(opts.voice, deriveLanguageCode(opts.voice));
	const resp = await fetch(
		`${EDGE_TTS_SIDECAR_URL}?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(opts.text)}`,
		{ signal: opts.signal },
	);
	if (!resp.ok) {
		throw new Error(
			`Edge TTS 사이드카 실패 (${resp.status}): ${await errorDetail(resp)}`,
		);
	}
	return { audioBase64: arrayBufferToBase64(await resp.arrayBuffer()) };
}

// The private Runtime returns a RIFF WAV directly for voice-only playback.

/**
 * naia-local-voice → the private Runtime's OpenAI-compatible voice-only surface.
 * Raw engine adapters stay hidden behind :8910. The Runtime resolves the
 * selected reference voice and returns RIFF WAV without a bearer token.
 */
async function synthNaiaLocalVoice(
	opts: SynthesizeOpts,
): Promise<SynthesizeResult> {
	const base = (opts.vllmTtsHost || DEFAULT_LOCAL_VOICE_HOST).replace(
		/\/$/,
		"",
	);
	const defaultVoice = "naia-default";
	const selectedVoice =
		!opts.voice || opts.voice === "default" ? defaultVoice : opts.voice;
	const request = (voice: string) =>
		fetch(`${base}/v1/audio/speech`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
			model: "voxcpm2",
			input: opts.text,
			// RefAudioSection stores a preset URL in voiceRefUrl. ChatArea resolves
			// it to this facade palette id; keep it intact all the way to :8910.
			voice,
			response_format: "wav",
			}),
			signal: opts.signal,
		});
	const waitForRetry = (delayMs: number) =>
		new Promise<void>((resolve, reject) => {
			if (opts.signal?.aborted) {
				reject(opts.signal.reason ?? new DOMException("Aborted", "AbortError"));
				return;
			}
			const onAbort = () => {
				clearTimeout(timer);
				reject(opts.signal?.reason ?? new DOMException("Aborted", "AbortError"));
			};
			const timer = setTimeout(() => {
				opts.signal?.removeEventListener("abort", onAbort);
				resolve();
			}, delayMs);
			opts.signal?.addEventListener("abort", onAbort, { once: true });
		});
	const requestAfterBusy = async (voice: string) => {
		for (let retry = 0; ; retry++) {
			const response = await request(voice);
			if (response.ok) return { response, detail: "" };
			const detail = await errorDetail(response);
			// 429 means the POST was not admitted and is therefore safe to retry.
			// Keep one narrowly-scoped compatibility path for older facades that
			// wrapped urllib's exact upstream 429 as synthesis_failed/502.
			const busy =
				response.status === 429 ||
				(response.status === 502 &&
					detail.includes("HTTP Error 429: Too Many Requests"));
			if (!busy || retry >= LOCAL_VOICE_BUSY_RETRY_DELAYS_MS.length) {
				return { response, detail };
			}
			const delayMs = retryAfterMs(
				response,
				LOCAL_VOICE_BUSY_RETRY_DELAYS_MS[retry],
			);
			Logger.info("tts-synthesize", "Local voice busy; retrying", {
				retry: retry + 1,
				delayMs,
				status: response.status,
			});
			await waitForRetry(delayMs);
		}
	};
	let { response: resp, detail } = await requestAfterBusy(selectedVoice);
	if (!resp.ok) {
		// A profile update can remove a formerly bundled voice while ui-config
		// still points at it. Recover once with the facade's stable default instead
		// of turning an otherwise healthy local engine into silence.
		if (
			resp.status === 400 &&
			selectedVoice !== defaultVoice &&
			detail.includes("unknown_voice")
		) {
			({ response: resp, detail } = await requestAfterBusy(defaultVoice));
			if (resp.ok) {
				return {
					audioBase64: arrayBufferToBase64(await resp.arrayBuffer()),
				};
			}
			throw new Error(`로컬 음성 합성 실패 (${resp.status}): ${detail}`);
		}
		throw new Error(
			`로컬 음성 합성 실패 (${resp.status}): ${detail}`,
		);
	}
	// audio/wav(RIFF) bytes — AudioQueue/ttsAudioToWav 가 RIFF 를 네이티브 감지.
	return { audioBase64: arrayBufferToBase64(await resp.arrayBuffer()) };
}

/**
 * Synthesize one utterance shell-side and return its audio as base64.
 * Throws on any failure (network, auth, unsupported provider) — the caller
 * decides whether to surface, drop, or fall back (e.g. edge → browser TTS).
 */
export async function synthesizeTts(
	opts: SynthesizeOpts,
): Promise<SynthesizeResult> {
	switch (opts.provider) {
		case "nextain":
			return synthNextain(opts);
		case "google":
			return synthGoogle(opts);
		case "openai":
			return synthOpenai(opts);
		case "elevenlabs":
			return synthElevenlabs(opts);
		case "vllm":
			return synthVllm(opts);
		case "naia-local-voice":
			return synthNaiaLocalVoice(opts);
		case "edge":
			return synthEdge(opts);
		default:
			throw new Error(`지원하지 않는 TTS provider: ${opts.provider}`);
	}
}
