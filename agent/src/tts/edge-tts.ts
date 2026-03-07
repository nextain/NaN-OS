import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const DEFAULT_VOICE = "ko-KR-SunHiNeural";

/**
 * Synthesize speech using Microsoft Edge TTS (free, no API key needed).
 * Returns base64-encoded MP3 audio or null on failure.
 */
export async function synthesizeEdgeSpeech(
	text: string,
	voice?: string,
): Promise<string | null> {
	if (!text.trim()) return null;

	try {
		const tts = new MsEdgeTTS();
		await tts.setMetadata(
			voice || DEFAULT_VOICE,
			OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
		);
		const { audioStream } = tts.toStream(text);

		const chunks: Buffer[] = [];
		for await (const chunk of audioStream) {
			chunks.push(Buffer.from(chunk));
		}
		tts.close();

		const buf = Buffer.concat(chunks);
		if (buf.length === 0) return null;
		return buf.toString("base64");
	} catch (err) {
		console.error(
			"[edge-tts] synthesize failed:",
			err instanceof Error ? err.message : String(err),
		);
		return null;
	}
}
