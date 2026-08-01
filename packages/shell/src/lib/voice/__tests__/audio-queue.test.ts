import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioQueue, wavDurationSeconds } from "../audio-queue";

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

	it("prebuffers queued sentences until playback is resumed", () => {
		const queue = new AudioQueue();
		queue.pauseBeforePlayback();
		queue.enqueue("first");
		queue.enqueue("second");
		expect(FakeAudio.instances).toHaveLength(0);
		queue.resumePlayback();
		expect(FakeAudio.instances).toHaveLength(1);
	});

	it("reads PCM duration from a RIFF/WAVE payload", () => {
		const pcmBytes = 48_000;
		const bytes = new Uint8Array(44 + pcmBytes);
		const view = new DataView(bytes.buffer);
		const chunks = [
			[0, "RIFF"],
			[8, "WAVE"],
			[12, "fmt "],
			[36, "data"],
		] as const;
		for (const [offset, text] of chunks) {
			for (let i = 0; i < text.length; i++)
				bytes[offset + i] = text.charCodeAt(i);
		}
		view.setUint32(4, bytes.length - 8, true);
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, 24_000, true);
		view.setUint32(28, 48_000, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		view.setUint32(40, pcmBytes, true);
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		expect(wavDurationSeconds(btoa(binary))).toBe(1);
	});
});
