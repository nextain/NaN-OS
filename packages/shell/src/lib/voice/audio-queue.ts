/**
 * Sequential audio playback queue for pipeline voice.
 *
 * Queues MP3 base64 chunks and plays them in order.
 * Supports interrupt (clear all), avatar speaking state,
 * and ordered enqueue for out-of-order TTS responses.
 */

import { Logger } from "../logger";

export interface AudioQueueCallbacks {
	onPlaybackStart?: () => void;
	onPlaybackEnd?: () => void;
	/** Audio output device ID (from enumerateDevices). Applied via setSinkId. */
	outputDeviceId?: string;
}

export interface AudioQueueItemCallbacks {
	/** Fires when this exact sentence starts playing, not merely when queued. */
	onPlaybackStart?: () => void;
	/** Fires if this sentence cannot start playback. */
	onPlaybackUnavailable?: () => void;
}

interface AudioQueueItem extends AudioQueueItemCallbacks {
	audioBase64: string;
}

export class AudioQueue {
	private queue: AudioQueueItem[] = [];
	private current: HTMLAudioElement | null = null;
	private playing = false;
	private playbackPaused = false;
	private generation = 0;
	private callbacks: AudioQueueCallbacks;

	// Ordered enqueue: buffer out-of-order items until their turn.
	// A `null` value marks a reserved slot whose synthesis failed / fell back —
	// it advances the cursor without playing, so later seqs don't stall.
	private nextExpectedSeq = 0;
	private pendingOrdered: Map<number, AudioQueueItem | null> = new Map();

	constructor(callbacks: AudioQueueCallbacks = {}) {
		this.callbacks = callbacks;
	}

	/** Add MP3 base64 audio to the queue. Starts playback if idle. */
	enqueue(
		mp3Base64: string,
		callbacks: AudioQueueItemCallbacks = {},
	): void {
		this.queue.push({ audioBase64: mp3Base64, ...callbacks });
		if (!this.playing && !this.playbackPaused) {
			this.playNext();
		} else {
			Logger.debug("AudioQueue", "enqueue:held", {
				playing: this.playing,
				paused: this.playbackPaused,
				queued: this.queue.length,
			});
		}
	}

	/** Hold queued audio without stopping an item that is already playing. */
	pauseBeforePlayback(): void {
		this.playbackPaused = true;
	}

	/** Release a prebuffered queue and start its first item. */
	resumePlayback(): void {
		this.playbackPaused = false;
		if (!this.playing && this.queue.length > 0) this.playNext();
	}

	/**
	 * Reserve a sequence number for ordered enqueue.
	 * Call this BEFORE sending the TTS request to guarantee ordering.
	 */
	reserveSeq(): number {
		return this.nextExpectedSeq++;
	}

	/**
	 * Enqueue audio by sequence number. Buffers out-of-order items
	 * and flushes them in order when their turn arrives.
	 */
	enqueueOrdered(
		seq: number,
		mp3Base64: string,
		callbacks: AudioQueueItemCallbacks = {},
	): void {
		Logger.debug("AudioQueue", "enqueueOrdered", {
			seq,
			cursor: this.flushCursor,
			playing: this.playing,
			paused: this.playbackPaused,
		});
		this.pendingOrdered.set(seq, { audioBase64: mp3Base64, ...callbacks });
		this.flushOrdered();
	}

	/**
	 * Release a reserved sequence slot without audio (synthesis failed or fell
	 * back to a non-queued path, e.g. browser TTS). Without this, the contiguous
	 * flush cursor would stall forever waiting for the missing seq.
	 */
	skipOrdered(seq: number): void {
		this.pendingOrdered.set(seq, null);
		this.flushOrdered();
	}

	/** Reset sequence counter (call when starting a new response). */
	resetSeq(): void {
		this.nextExpectedSeq = 0;
		this.flushCursor = 0;
		this.pendingOrdered.clear();
	}

	private flushCursor = 0;

	private flushOrdered(): void {
		while (this.pendingOrdered.has(this.flushCursor)) {
			const item = this.pendingOrdered.get(this.flushCursor);
			this.pendingOrdered.delete(this.flushCursor);
			this.flushCursor++;
			// null = skipped slot (failed/fell-back synthesis); advance only.
			if (item) this.enqueue(item.audioBase64, item);
		}
	}

	/** Stop current playback and clear all queued audio. */
	clear(): void {
		this.generation++;
		this.queue = [];
		this.playbackPaused = false;
		this.pendingOrdered.clear();
		this.flushCursor = 0;
		this.nextExpectedSeq = 0;
		if (this.current) {
			this.current.pause();
			this.current.src = "";
			this.current = null;
		}
		if (this.playing) {
			this.playing = false;
			this.callbacks.onPlaybackEnd?.();
		}
	}

	/** Whether audio is currently playing or queued. */
	get isActive(): boolean {
		return this.playing || this.queue.length > 0;
	}

	/** Destroy the queue and release resources. */
	destroy(): void {
		this.clear();
	}

	private playNext(): void {
		if (this.queue.length === 0) {
			Logger.debug("AudioQueue", "playNext:empty → end", {});
			this.playing = false;
			this.callbacks.onPlaybackEnd?.();
			return;
		}
		Logger.debug("AudioQueue", "playNext:start", {
			queued: this.queue.length,
		});

		const item = this.queue.shift();
		if (!item) {
			this.playing = false;
			this.callbacks.onPlaybackEnd?.();
			return;
		}
		const mp3Base64 = item.audioBase64;
		const generation = this.generation;
		const wasPlaying = this.playing;
		this.playing = true;

		// WAV base64 starts with "UklGR" (RIFF header); use audio/wav MIME for omni model output
		const isWav = mp3Base64.startsWith("UklGR");
		const audio = new Audio(
			`data:audio/${isWav ? "wav" : "mp3"};base64,${mp3Base64}`,
		);
		// Apply output device if specified (setSinkId is non-standard, guarded)
		const setSinkId = (
			audio as unknown as { setSinkId?: (id: string) => Promise<void> }
		).setSinkId;
		if (this.callbacks.outputDeviceId && setSinkId) {
			setSinkId.call(audio, this.callbacks.outputDeviceId).catch(() => {});
		}
		this.current = audio;

		let started = false;
		let unavailableSignaled = false;
		let advanced = false;
		const isCurrent = () =>
			generation === this.generation && this.current === audio;
		const signalUnavailable = () => {
			if (!isCurrent() || started || unavailableSignaled) return;
			unavailableSignaled = true;
			item.onPlaybackUnavailable?.();
		};
		const advance = () => {
			if (!isCurrent() || advanced) return;
			advanced = true;
			this.current = null;
			this.playNext();
		};

		audio.onplay = () => {
			if (!isCurrent()) return;
			started = true;
			item.onPlaybackStart?.();
			// Only fire onPlaybackStart for the first chunk in a sequence
			if (!wasPlaying) {
				this.callbacks.onPlaybackStart?.();
			}
		};

		audio.onended = () => {
			advance();
		};

		audio.onerror = (e) => {
			Logger.warn("AudioQueue", "Audio playback error", { error: String(e) });
			signalUnavailable();
			advance();
		};

		audio.play().catch((err) => {
			Logger.warn("AudioQueue", "Audio play rejected", { error: String(err) });
			signalUnavailable();
			advance();
		});
	}
}

/** Return the PCM duration encoded by a RIFF/WAVE base64 payload. */
export function wavDurationSeconds(audioBase64: string): number | null {
	try {
		const binary = atob(audioBase64);
		if (binary.length < 44 || binary.slice(0, 4) !== "RIFF" || binary.slice(8, 12) !== "WAVE") {
			return null;
		}
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const view = new DataView(bytes.buffer);
		let offset = 12;
		let byteRate = 0;
		let dataSize = 0;
		while (offset + 8 <= bytes.length) {
			const id = binary.slice(offset, offset + 4);
			const size = view.getUint32(offset + 4, true);
			const body = offset + 8;
			if (id === "fmt " && size >= 12 && body + 12 <= bytes.length) {
				byteRate = view.getUint32(body + 8, true);
			} else if (id === "data") {
				dataSize = Math.min(size, Math.max(0, bytes.length - body));
				break;
			}
			offset = body + size + (size % 2);
		}
		return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : null;
	} catch {
		return null;
	}
}
