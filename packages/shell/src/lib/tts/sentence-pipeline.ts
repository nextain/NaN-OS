/**
 * FR-VOICE.16 Phase 2b (#420): the per-sentence TTS orchestration, extracted
 * from ChatArea. The pipeline owns the request lifecycle (active-request set,
 * per-request AbortControllers, the one-time local-voice-unavailable notice,
 * the recent-utterance ring used by the STT self-echo filter) and the routing
 * policy:
 *
 *  - Shell TTS is the single owner of audio synthesis and playback. An NVA
 *    authored clip is the one exception: it carries its own recorded voice for
 *    an exact known phrase, so playing it replaces synthesis instead of racing
 *    it. The renderer only ever reacts to real playback via setSpeakingVisual.
 *  - Client-side providers speak through the browser's speechSynthesis.
 *  - Every other provider is synthesized in the Shell (the new-core agent has
 *    no TTS); the 6GB local path is admitted through LocalVoiceScheduler.
 *  - Failure policy: local engines never masquerade as the free browser voice
 *    (one clear notice, then silence); cloud failures fall back to browser TTS
 *    so the voice is never silently dropped.
 *
 * ChatArea remains a wiring adapter: it supplies environment (reveal/mask,
 * output stage, stores, renderer, queue, config, i18n, IPC) through
 * SentenceTtsPipelineDeps and calls the public interface only.
 */
import { Logger } from "../logger";
import { getTtsProviderMeta } from "./index";
import { estimateTtsCost } from "./cost";
import { LocalVoiceScheduler } from "./local-voice-scheduler";
import { synthesizeTts } from "./synthesize";
import { ttsTextFilter } from "./text-filter";
import type { TtsProviderId } from "../config";
import { wavDurationSeconds } from "../voice/audio-queue";

const TAG = "tts-pipeline";

export interface PipelineVoiceConfig {
	voice?: string;
	ttsProvider?: string;
	ttsApiKey?: string;
	/** nextain provider: gateway credit key. */
	naiaKey?: string;
	/** nextain provider: gateway base URL. */
	gatewayUrl?: string;
	/** vllm provider: local OpenAI-compatible host. */
	vllmHost?: string;
	/** naia-local-voice provider: local cascade / VoxCPM2 voice host. */
	vllmTtsHost?: string;
}

/** The renderer surface the pipeline is allowed to touch (FR-VOICE.16). */
export interface CascadeSpeechRenderer {
	hasAuthoredClip(text: string): boolean;
	playAuthoredClip(
		text: string,
		callbacks: { onPlaybackReady: () => void; onPlaybackFailure: () => void },
	): Promise<unknown>;
	setSpeakingVisual(on: boolean): void;
}

export interface OrderedTtsQueue {
	reserveSeq(): number;
	enqueueOrdered(
		seq: number,
		audioBase64: string,
		callbacks: {
			onPlaybackStart: () => void;
			onPlaybackUnavailable: () => void;
		},
	): void;
	skipOrdered(seq: number): void;
}

export interface TtsCostEntry {
	inputTokens: number;
	outputTokens: number;
	cost: number;
	provider: string;
	model: string;
}

export interface SentenceTtsPipelineDeps {
	generateRequestId(): string;
	/** Mask/reveal reservation for this sentence (UI-owned ordering). */
	reserveReveal(sentence: string): () => void;
	getRenderer(): CascadeSpeechRenderer | null | undefined;
	/** Cascade playback bookkeeping for authored clips (generation-guarded). */
	beginCascadeJob(): () => void;
	setOutputStage(stage: "tts" | "render"): void;
	getQueue(): OrderedTtsQueue | null;
	getVoiceConfig(): PipelineVoiceConfig | null;
	getScheduler(): LocalVoiceScheduler | null;
	/** Current mask-generation — guards late browser speech callbacks. */
	getBrowserTurnGeneration(): number;
	/** Composite speaking state (playing ref + React state + avatar store). */
	setSpeaking(on: boolean): void;
	getLocalRefAudioB64(): string | null;
	addCostEntry(entry: TtsCostEntry): void;
	/**
	 * Surface the one-time local-voice-unavailable notice (runtime status +
	 * localized message). The once-per-session guard lives in the pipeline.
	 */
	notifyLocalVoiceUnavailable(): Promise<void>;
}

export interface SentenceTtsPipeline {
	sendSentence(sentence: string): void;
	/** Barge-in/new turn: drop pending requests and cancel in-flight synthesis. */
	interrupt(): void;
	/** Session teardown: interrupt + clear the recent-utterance ring. */
	dispose(): void;
	/** Re-arm the one-time local-voice-unavailable notice (new session/turn). */
	rearmLocalVoiceNotice(): void;
	hasActiveRequests(): boolean;
	/** Recent spoken sentences (ring of 6) for the STT self-echo filter. */
	recentTexts(): readonly string[];
}

export function createSentenceTtsPipeline(
	deps: SentenceTtsPipelineDeps,
): SentenceTtsPipeline {
	const activeRequests = new Set<string>();
	const abortControllers = new Map<string, AbortController>();
	const recentTexts: string[] = [];
	let localVoiceUnavailableNoticed = false;

	function sendSentence(sentence: string): void {
		// Preserve the original Markdown in chat, but send only natural speech
		// text to the selected voice engine.
		const clean = ttsTextFilter.filter(sentence);
		if (!clean) return;
		const revealText = deps.reserveReveal(sentence);

		const cascadeAvatar = deps.getRenderer();

		// 자기발화 텍스트 필터용 — 이 턴에 말한 문장을 기록 (최근 6문장 링버퍼).
		recentTexts.push(clean);
		if (recentTexts.length > 6) recentTexts.shift();

		// Authored NVA clip: the one path that replaces synthesis (module doc).
		if (cascadeAvatar?.hasAuthoredClip(clean)) {
			Logger.info(TAG, "Playing NVA authored clip", {
				sentence: clean.slice(0, 50),
			});
			deps.setOutputStage("render");
			const endCascadeJob = deps.beginCascadeJob();
			void cascadeAvatar
				.playAuthoredClip(clean, {
					onPlaybackReady: revealText,
					onPlaybackFailure: revealText,
				})
				.finally(endCascadeJob);
			return;
		}

		const reqId = deps.generateRequestId();
		// Reserve sequence number BEFORE async request to guarantee order.
		const seq = deps.getQueue()?.reserveSeq() ?? 0;
		activeRequests.add(reqId);
		const voiceCfg = deps.getVoiceConfig();
		const ttsProviderForCost = voiceCfg?.ttsProvider ?? "edge";
		const localVoiceScheduler = deps.getScheduler();
		const localVoiceGeneration = localVoiceScheduler?.generation ?? 0;
		if (ttsProviderForCost === "naia-local-voice") {
			localVoiceScheduler?.noteSentence(seq);
		}
		const ttsVoiceForCost = voiceCfg?.voice;
		Logger.info(TAG, "Sending TTS request", {
			reqId,
			seq,
			sentence: clean.slice(0, 50),
			provider: ttsProviderForCost,
			voice: ttsVoiceForCost,
		});

		// Speak via the browser's built-in speechSynthesis (free, client-side).
		// Manages the avatar speaking state + clears the request on end/error.
		const speakViaBrowser = (): void => {
			if (typeof window !== "undefined" && "speechSynthesis" in window) {
				const browserGeneration = deps.getBrowserTurnGeneration();
				const isCurrentBrowserTurn = () =>
					browserGeneration === deps.getBrowserTurnGeneration();
				const utter = new SpeechSynthesisUtterance(clean);
				utter.lang =
					voiceCfg?.voice || document.documentElement.lang || "ko-KR";
				utter.onstart = () => {
					if (!isCurrentBrowserTurn()) return;
					revealText();
					deps.setSpeaking(true);
					cascadeAvatar?.setSpeakingVisual(true);
				};
				utter.onend = () => {
					if (!isCurrentBrowserTurn()) return;
					// Settle hooks behind setSpeaking(false) consult hasActiveRequests —
					// this request must not count itself as still active (#423).
					activeRequests.delete(reqId);
					deps.setSpeaking(false);
					cascadeAvatar?.setSpeakingVisual(false);
				};
				// onerror too, else a failure after onstart leaves the avatar stuck
				// in the speaking state (#363 review).
				utter.onerror = () => {
					if (!isCurrentBrowserTurn()) return;
					activeRequests.delete(reqId);
					revealText();
					deps.setSpeaking(false);
					cascadeAvatar?.setSpeakingVisual(false);
				};
				window.speechSynthesis.speak(utter);
			} else {
				Logger.warn(TAG, "Browser TTS not available");
				activeRequests.delete(reqId);
				revealText();
			}
		};

		// Browser provider → client-side speechSynthesis (skip shell synthesis).
		const ttsMeta = getTtsProviderMeta(ttsProviderForCost);
		if (ttsMeta?.isClientSide) {
			speakViaBrowser();
			return;
		}

		// Shell-direct synthesis (#363): the new-core agent has no TTS, so every
		// non-browser provider is synthesized here (gateway / direct API / edge
		// WS). The AbortController lets interrupt/cleanup cancel the in-flight
		// fetch/WS (and stop paid TTS).
		const abort = new AbortController();
		abortControllers.set(reqId, abort);
		let synthesisStartedAt = 0;
		const synthesize = () => {
			if (!activeRequests.has(reqId)) {
				return Promise.reject(
					new DOMException("TTS request superseded", "AbortError"),
				);
			}
			deps.setOutputStage("tts");
			synthesisStartedAt = performance.now();
			return synthesizeTts({
				text: clean,
				voice: voiceCfg?.voice,
				provider: ttsProviderForCost as TtsProviderId,
				apiKey: voiceCfg?.ttsApiKey,
				naiaKey: voiceCfg?.naiaKey,
				gatewayUrl: voiceCfg?.gatewayUrl,
				vllmHost: voiceCfg?.vllmHost,
				vllmTtsHost: voiceCfg?.vllmTtsHost,
				localRefAudioBase64:
					ttsProviderForCost === "naia-local-voice"
						? deps.getLocalRefAudioB64() ?? undefined
						: undefined,
				signal: abort.signal,
			});
		};
		// The Windows 8GB path shares one GPU between VoxCPM2 and Ditto. Keep it
		// strictly half-duplex; cloud TTS providers retain parallel synthesis.
		let synthesis: ReturnType<typeof synthesize>;
		if (ttsProviderForCost === "naia-local-voice" && localVoiceScheduler) {
			synthesis = localVoiceScheduler.schedule(() => synthesize());
		} else {
			synthesis = synthesize();
		}
		synthesis
			.then(async ({ audioBase64, costUsd }) => {
				// Drop stale audio AND skip billing for a superseded/aborted turn:
				// interrupt() cleared activeRequests and reset the AudioQueue
				// sequence, so a late response must NOT enqueue (would replay as
				// the new turn's first audio) nor record cost.
				if (!activeRequests.has(reqId)) return;
				if (
					ttsProviderForCost === "naia-local-voice" &&
					localVoiceScheduler &&
					seq === 0
				) {
					const duration = wavDurationSeconds(audioBase64);
					const elapsed =
						Math.max(0, performance.now() - synthesisStartedAt) / 1000;
					const verdict = localVoiceScheduler.onFirstResult(
						localVoiceGeneration,
						{ elapsedSeconds: elapsed, durationSeconds: duration ?? null },
					);
					if (verdict) {
						Logger.info(TAG, "Local voice adaptive prebuffer", {
							rtf: Number(verdict.rtf.toFixed(2)),
							duration: verdict.durationSeconds
								? Number(verdict.durationSeconds.toFixed(2))
								: null,
							buffering: verdict.shouldBuffer,
						});
					}
				}
				activeRequests.delete(reqId);
				deps.getQueue()?.enqueueOrdered(seq, audioBase64, {
					onPlaybackStart: revealText,
					onPlaybackUnavailable: revealText,
				});
				if (ttsProviderForCost === "naia-local-voice") {
					localVoiceScheduler?.maybeReleaseAfterEnqueue(
						localVoiceGeneration,
						seq,
					);
				}
				// Track TTS cost: server cost for Naia Cloud, estimate for others.
				// Naia account (nextain): 10% service markup on top of base cost.
				const NAIA_TTS_MARKUP = 1.1;
				const isNaiaTts = ttsProviderForCost === "nextain";
				const baseTtsCost =
					costUsd != null
						? costUsd
						: estimateTtsCost(
								ttsProviderForCost,
								clean.length,
								ttsVoiceForCost,
							);
				const ttsCost = isNaiaTts ? baseTtsCost * NAIA_TTS_MARKUP : baseTtsCost;
				if (ttsCost > 0) {
					// addCostEntry keeps TTS in a separate CostDashboard row.
					deps.addCostEntry({
						inputTokens: 0,
						outputTokens: 0,
						cost: ttsCost,
						provider: ttsProviderForCost,
						model: isNaiaTts
							? "tts:nextain (+10%)"
							: `tts:${ttsProviderForCost}`,
					});
				}
			})
			.catch(async (err) => {
				// Superseded / aborted turn (interrupt cleared the set) — don't
				// fall back or bill; the queue was already reset.
				if (!activeRequests.has(reqId)) return;
				// Release the reserved ordered slot so later sentences don't stall
				// behind this seq (enqueueOrdered waits for contiguous numbers).
				deps.getQueue()?.skipOrdered(seq);
				if (ttsProviderForCost === "naia-local-voice") {
					localVoiceScheduler?.releaseOnFailure(localVoiceGeneration);
				}
				// LOCAL voice engines (naia-local-voice / vllm): the user chose a
				// local engine explicitly. Do NOT substitute the browser's free
				// TTS — surface one clear notice and stay silent (FR-VOICE.2).
				// Cloud providers keep the free fallback below.
				const isLocalVoiceProvider =
					ttsProviderForCost === "naia-local-voice" ||
					ttsProviderForCost === "vllm";
				if (isLocalVoiceProvider) {
					// Delete before reveal: the reveal wrapper settles the held
					// expression only when no request is still counted active (#423).
					activeRequests.delete(reqId);
					revealText();
					Logger.warn(TAG, "Local voice engine unavailable — no free fallback", {
						reqId,
						provider: ttsProviderForCost,
						error: String(err),
					});
					if (!localVoiceUnavailableNoticed) {
						localVoiceUnavailableNoticed = true;
						await deps.notifyLocalVoiceUnavailable();
					}
					return;
				}
				// Cloud synthesis failed (missing key/login, network, quota). Fall
				// back to the browser's built-in TTS so the voice is never
				// silently dropped — better a basic voice than nothing.
				Logger.warn(TAG, "TTS synthesis failed — browser TTS fallback", {
					reqId,
					provider: ttsProviderForCost,
					error: String(err),
				});
				speakViaBrowser();
			})
			.finally(() => {
				abortControllers.delete(reqId);
			});
	}

	function clearRequests(): void {
		activeRequests.clear();
		for (const ac of abortControllers.values()) ac.abort();
		abortControllers.clear();
	}

	function interrupt(): void {
		clearRequests();
		// The pipeline created any live browser utterance (speakViaBrowser), so
		// cancelling it on barge-in is its lifecycle too — AudioQueue.clear()
		// cannot stop client-side speech (FR-VOICE.16 Phase 3).
		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			try {
				window.speechSynthesis.cancel();
			} catch {
				// best-effort — some webviews throw if no utterance is active
			}
		}
	}

	return {
		sendSentence,
		interrupt,
		dispose(): void {
			// Session teardown drops the pipeline's own requests but deliberately
			// does NOT cancel browser speech: only a barge-in (interrupt) cuts a
			// live utterance. Voice-pipeline cleanup must not silence an ongoing
			// chat-mode browser reply — original ChatArea behavior preserved.
			clearRequests();
			recentTexts.length = 0;
		},
		rearmLocalVoiceNotice(): void {
			localVoiceUnavailableNoticed = false;
		},
		hasActiveRequests(): boolean {
			return activeRequests.size > 0;
		},
		recentTexts(): readonly string[] {
			return recentTexts;
		},
	};
}
