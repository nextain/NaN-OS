/**
 * Continuous PCM audio player for Gemini Live API responses.
 * Queues base64 PCM chunks (24kHz Int16 mono) and plays them seamlessly.
 */
import { Logger } from "./logger";

export interface AudioPlayer {
	enqueue: (base64Pcm: string) => void;
	clear: () => void;
	destroy: () => void;
	readonly isPlaying: boolean;
}

export interface AudioPlayerOptions {
	sampleRate?: number;
	onPlaybackStart?: () => void;
	onPlaybackEnd?: () => void;
}

export function createAudioPlayer(opts: AudioPlayerOptions = {}): AudioPlayer {
	const sampleRate = opts.sampleRate ?? 24000;
	const ctx = new AudioContext({ sampleRate });
	let nextStartTime = 0;
	let activeSourceCount = 0;
	let destroyed = false;
	const activeSources: Set<AudioBufferSourceNode> = new Set();

	function enqueue(base64Pcm: string) {
		if (destroyed) return;

		if (ctx.state === "suspended") {
			ctx.resume();
		}

		const bytes = base64ToUint8Array(base64Pcm);
		const int16 = new Int16Array(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength / 2,
		);
		const float32 = int16ToFloat32(int16);

		const buffer = ctx.createBuffer(1, float32.length, sampleRate);
		buffer.getChannelData(0).set(float32);

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		activeSources.add(source);

		const now = ctx.currentTime;
		const startAt = Math.max(now, nextStartTime);
		nextStartTime = startAt + buffer.duration;

		const wasIdle = activeSourceCount === 0;
		activeSourceCount++;
		if (wasIdle) {
			opts.onPlaybackStart?.();
		}

		source.onended = () => {
			activeSources.delete(source);
			activeSourceCount--;
			if (activeSourceCount <= 0) {
				activeSourceCount = 0;
				opts.onPlaybackEnd?.();
			}
		};

		source.start(startAt);
	}

	function clear() {
		const wasPlaying = activeSourceCount > 0;
		for (const src of activeSources) {
			try {
				src.stop();
			} catch {
				/* already stopped */
			}
		}
		activeSources.clear();
		nextStartTime = 0;
		activeSourceCount = 0;
		Logger.info("AudioPlayer", "cleared");
		if (wasPlaying) {
			opts.onPlaybackEnd?.();
		}
	}

	function destroy() {
		destroyed = true;
		clear();
		ctx.close().catch(() => {});
		Logger.info("AudioPlayer", "destroyed");
	}

	return {
		enqueue,
		clear,
		destroy,
		get isPlaying() {
			return activeSourceCount > 0;
		},
	};
}

function base64ToUint8Array(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function int16ToFloat32(int16: Int16Array): Float32Array {
	const float32 = new Float32Array(int16.length);
	for (let i = 0; i < int16.length; i++) {
		float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
	}
	return float32;
}
