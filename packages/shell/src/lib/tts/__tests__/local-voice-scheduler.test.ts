import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalVoiceScheduler } from "../local-voice-scheduler";

function make() {
	const pausePlayback = vi.fn();
	const resumePlayback = vi.fn();
	const scheduler = new LocalVoiceScheduler({ pausePlayback, resumePlayback });
	return { scheduler, pausePlayback, resumePlayback };
}

describe("LocalVoiceScheduler (FR-VOICE.16 Phase 2a — FR-VOICE.11/12 semantics)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps local synthesis single-flight and in order", async () => {
		const { scheduler } = make();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const first = scheduler.schedule(
			() =>
				new Promise<void>((res) => {
					order.push("first-start");
					releaseFirst = () => {
						order.push("first-done");
						res();
					};
				}),
		);
		const second = scheduler.schedule(async () => {
			order.push("second-start");
		});
		await Promise.resolve();
		expect(order).toEqual(["first-start"]);
		releaseFirst();
		await first;
		await second;
		expect(order).toEqual(["first-start", "first-done", "second-start"]);
	});

	it("a rejected job does not poison the admission tail", async () => {
		const { scheduler } = make();
		const failing = scheduler.schedule(() => Promise.reject(new Error("boom")));
		await expect(failing).rejects.toThrow("boom");
		await expect(scheduler.schedule(async () => "next")).resolves.toBe("next");
	});

	it("seq 0 opens the prebuffer window by pausing playback", () => {
		const { scheduler, pausePlayback } = make();
		scheduler.noteSentence(0);
		expect(pausePlayback).toHaveBeenCalledTimes(1);
		scheduler.noteSentence(1);
		expect(pausePlayback).toHaveBeenCalledTimes(1);
	});

	it("buffers behind a second sentence only when slower than realtime with more speech coming", () => {
		const { scheduler } = make();
		scheduler.noteSentence(0);
		scheduler.noteSentence(1);
		const verdict = scheduler.onFirstResult(scheduler.generation, {
			elapsedSeconds: 4,
			durationSeconds: 2,
		});
		expect(verdict?.rtf).toBe(2);
		expect(verdict?.shouldBuffer).toBe(true);
		expect(verdict?.bufferMs).toBe(4000);
	});

	it("does not buffer a finished one-sentence answer or realtime-fast synthesis", () => {
		const { scheduler } = make();
		scheduler.noteSentence(0);
		scheduler.finishStream();
		expect(
			scheduler.onFirstResult(scheduler.generation, {
				elapsedSeconds: 4,
				durationSeconds: 2,
			})?.shouldBuffer,
		).toBe(false);

		const fast = make().scheduler;
		fast.noteSentence(0);
		fast.noteSentence(1);
		expect(
			fast.onFirstResult(fast.generation, {
				elapsedSeconds: 1,
				durationSeconds: 2,
			})?.shouldBuffer,
		).toBe(false);
	});

	it("the bounded timer releases playback even when no second sentence arrives", () => {
		const { scheduler, resumePlayback } = make();
		scheduler.noteSentence(0);
		scheduler.noteSentence(1);
		scheduler.onFirstResult(scheduler.generation, {
			elapsedSeconds: 4,
			durationSeconds: 2,
		});
		expect(resumePlayback).not.toHaveBeenCalled();
		vi.advanceTimersByTime(4000);
		expect(resumePlayback).toHaveBeenCalledTimes(1);
	});

	it("a later sentence releases the window; a non-buffering first releases immediately", () => {
		const { scheduler, resumePlayback } = make();
		scheduler.noteSentence(0);
		scheduler.noteSentence(1);
		scheduler.onFirstResult(scheduler.generation, {
			elapsedSeconds: 4,
			durationSeconds: 2,
		});
		scheduler.maybeReleaseAfterEnqueue(scheduler.generation, 0);
		expect(resumePlayback).not.toHaveBeenCalled(); // seq 0 stays buffered
		scheduler.maybeReleaseAfterEnqueue(scheduler.generation, 1);
		expect(resumePlayback).toHaveBeenCalledTimes(1);
	});

	it("interrupt fences the old generation: stale verdicts and releases are no-ops", () => {
		const { scheduler, resumePlayback } = make();
		scheduler.noteSentence(0);
		const staleGeneration = scheduler.generation;
		scheduler.interrupt();
		expect(
			scheduler.onFirstResult(staleGeneration, {
				elapsedSeconds: 4,
				durationSeconds: 2,
			}),
		).toBeNull();
		scheduler.release(staleGeneration);
		scheduler.releaseOnFailure(staleGeneration);
		expect(resumePlayback).not.toHaveBeenCalled();
	});

	it("interrupt disarms a pending release timer from the superseded turn", () => {
		const { scheduler, resumePlayback } = make();
		scheduler.noteSentence(0);
		scheduler.noteSentence(1);
		scheduler.onFirstResult(scheduler.generation, {
			elapsedSeconds: 4,
			durationSeconds: 2,
		});
		scheduler.interrupt();
		vi.advanceTimersByTime(10_000);
		expect(resumePlayback).not.toHaveBeenCalled();
	});

	it("a failed sentence never leaves playback paused", () => {
		const { scheduler, resumePlayback } = make();
		scheduler.noteSentence(0);
		scheduler.releaseOnFailure(scheduler.generation);
		expect(resumePlayback).toHaveBeenCalledTimes(1);
	});
});
