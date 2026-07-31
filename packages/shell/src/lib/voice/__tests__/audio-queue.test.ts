import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioQueue } from "../audio-queue";

class FakeAudio {
	static instances: FakeAudio[] = [];
	static playImpl: () => Promise<void> = () => Promise.resolve();
	onplay: (() => void) | null = null;
	onended: (() => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	src: string;
	pause = vi.fn();
	play = vi.fn<() => Promise<void>>(() => FakeAudio.playImpl());

	constructor(src: string) {
		this.src = src;
		FakeAudio.instances.push(this);
	}
}

describe("AudioQueue sentence callbacks", () => {
	beforeEach(() => {
		FakeAudio.instances = [];
		FakeAudio.playImpl = () => Promise.resolve();
		vi.stubGlobal("Audio", FakeAudio);
	});

	it("advances only once when play rejection and error both fire", async () => {
		const unavailable = vi.fn();
		const queue = new AudioQueue();
		FakeAudio.playImpl = () => Promise.reject(new Error("blocked"));
		queue.enqueue("first", { onPlaybackUnavailable: unavailable });
		queue.enqueue("second");
		const first = FakeAudio.instances[0];
		await Promise.resolve();
		await Promise.resolve();
		first.onerror?.(new Event("error"));
		await Promise.resolve();
		expect(unavailable).toHaveBeenCalledTimes(1);
		expect(FakeAudio.instances).toHaveLength(2);
	});

	it("ignores stale playback callbacks after clear", () => {
		const started = vi.fn();
		const unavailable = vi.fn();
		const queue = new AudioQueue();
		queue.enqueue("first", {
			onPlaybackStart: started,
			onPlaybackUnavailable: unavailable,
		});
		const first = FakeAudio.instances[0];
		queue.clear();
		first.onplay?.();
		first.onerror?.(new Event("error"));
		expect(started).not.toHaveBeenCalled();
		expect(unavailable).not.toHaveBeenCalled();
	});
});
