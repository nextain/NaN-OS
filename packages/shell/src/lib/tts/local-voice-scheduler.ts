/**
 * FR-VOICE.16 Phase 2a (#420): the 6GB local-voice scheduling concern,
 * extracted from ChatArea so unrelated component work can no longer regress it.
 *
 * Owns three tightly coupled pieces (FR-VOICE.11/12 behavior preserved 1:1):
 *  - Half-duplex admission: VoxCPM2 owns one TensorRT execution context, so
 *    local sentence synthesis is single-flight. The tail releases as soon as a
 *    WAV is ready, letting the next sentence synthesize while the AudioQueue
 *    plays the previous one (low first-sentence latency without 429 storms).
 *  - Adaptive prebuffer: the first WAV's real-time factor (RTF) decides
 *    whether playback waits for a second sentence; a bounded timer guarantees
 *    the first utterance is never postponed indefinitely.
 *  - Generation fencing: a barge-in/new turn supersedes buffer state, but the
 *    GPU admission tail is deliberately NOT reset — aborting the WebView fetch
 *    does not prove VoxCPM2 released its execution context.
 */

export interface LocalVoiceSchedulerDeps {
	/** Hold AudioQueue playback while the prebuffer window is open (seq 0). */
	pausePlayback: () => void;
	/** Release AudioQueue playback when the prebuffer window closes. */
	resumePlayback: () => void;
}

export interface FirstResultVerdict {
	rtf: number;
	durationSeconds: number | null;
	shouldBuffer: boolean;
	bufferMs: number | null;
}

export class LocalVoiceScheduler {
	private tail: Promise<void> = Promise.resolve();
	private state = {
		generation: 0,
		sentenceCount: 0,
		waitingForSecond: false,
		streamFinished: false,
	};
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly deps: LocalVoiceSchedulerDeps) {}

	/** Current turn generation — capture per request, pass back to verdict/release. */
	get generation(): number {
		return this.state.generation;
	}

	/**
	 * Barge-in / new turn: supersede the buffer state and disarm the timer.
	 * The admission tail is kept on purpose (see module doc).
	 */
	interrupt(): void {
		this.state = {
			generation: this.state.generation + 1,
			sentenceCount: 0,
			waitingForSecond: false,
			streamFinished: false,
		};
		this.clearTimer();
	}

	/** seq 0 opens the prebuffer window (pauses playback); later seqs count up. */
	noteSentence(seq: number): void {
		if (seq === 0) {
			this.state.sentenceCount = 1;
			this.state.waitingForSecond = false;
			this.deps.pausePlayback();
		} else {
			this.state.sentenceCount++;
		}
	}

	/** Half-duplex admission: run the job strictly behind the previous one. */
	schedule<T>(job: () => Promise<T>): Promise<T> {
		const run = this.tail.then(job);
		// A failed or interrupted sentence must not poison the queue — this tail
		// only gates the next job; the caller still observes its own rejection.
		this.tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/**
	 * First-WAV verdict: buffer behind a second sentence only when synthesis is
	 * slower than realtime AND more speech is (or may still be) coming. Arms a
	 * bounded release timer so a slow second sentence cannot postpone the first
	 * utterance indefinitely.
	 */
	onFirstResult(
		generation: number,
		measured: { elapsedSeconds: number; durationSeconds: number | null },
	): FirstResultVerdict | null {
		if (generation !== this.state.generation) return null;
		const { elapsedSeconds, durationSeconds } = measured;
		const rtf =
			durationSeconds && durationSeconds > 0
				? elapsedSeconds / durationSeconds
				: 0;
		const shouldBuffer =
			rtf > 1 && (!this.state.streamFinished || this.state.sentenceCount > 1);
		this.state.waitingForSecond = shouldBuffer;
		let bufferMs: number | null = null;
		if (shouldBuffer) {
			// The first real synthesis time is the maximum startup buffer.
			bufferMs = Math.min(5_000, Math.max(250, elapsedSeconds * 1_000));
			this.timer = setTimeout(() => this.release(generation), bufferMs);
		}
		return { rtf, durationSeconds, shouldBuffer, bufferMs };
	}

	/** After enqueue: a later sentence (or a non-buffering first) releases playback. */
	maybeReleaseAfterEnqueue(generation: number, seq: number): void {
		if (generation !== this.state.generation) return;
		if (seq > 0 || !this.state.waitingForSecond) this.release(generation);
	}

	/** A failed sentence must never leave playback paused. */
	releaseOnFailure(generation: number): void {
		if (generation !== this.state.generation) return;
		this.release(generation);
	}

	/** Close the prebuffer window and resume playback (generation-guarded). */
	release(generation: number): void {
		if (generation !== this.state.generation) return;
		this.clearTimer();
		this.state.waitingForSecond = false;
		this.deps.resumePlayback();
	}

	/** Stream ended: a one-sentence answer has nothing to prebuffer behind it. */
	finishStream(): void {
		this.state.streamFinished = true;
		if (this.state.sentenceCount <= 1) this.release(this.state.generation);
	}

	private clearTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
