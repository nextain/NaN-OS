/**
 * Continuous microphone PCM streaming for Gemini Live API.
 * Captures 16kHz mono Int16 PCM and delivers base64 chunks via callback.
 */
import { Logger } from "./logger";

export interface MicStream {
	start: () => void;
	stop: () => void;
}

export interface MicStreamOptions {
	onChunk: (base64Pcm: string) => void;
	sampleRate?: number;
	bufferSize?: number;
}

export async function createMicStream(
	opts: MicStreamOptions,
): Promise<MicStream> {
	const sampleRate = opts.sampleRate ?? 16000;
	const bufferSize = opts.bufferSize ?? 4096;

	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const ctx = new AudioContext({ sampleRate });
	const source = ctx.createMediaStreamSource(stream);
	const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

	let active = false;

	processor.onaudioprocess = (e) => {
		if (!active) return;
		const float32 = e.inputBuffer.getChannelData(0);
		const int16 = float32ToInt16(float32);
		const b64 = uint8ArrayToBase64(new Uint8Array(int16.buffer));
		opts.onChunk(b64);
	};

	return {
		start() {
			active = true;
			source.connect(processor);
			processor.connect(ctx.destination);
			Logger.info("MicStream", "started", { sampleRate, bufferSize });
		},
		stop() {
			active = false;
			processor.disconnect();
			source.disconnect();
			stream.getTracks().forEach((t) => t.stop());
			ctx.close().catch(() => {});
			Logger.info("MicStream", "stopped");
		},
	};
}

function float32ToInt16(float32: Float32Array): Int16Array {
	const int16 = new Int16Array(float32.length);
	for (let i = 0; i < float32.length; i++) {
		const s = Math.max(-1, Math.min(1, float32[i]));
		int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return int16;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
