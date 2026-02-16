const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

const DEFAULT_VOICE = "ko-KR-Neural2-A";

export async function synthesizeSpeech(
	text: string,
	apiKey: string,
	voice?: string,
): Promise<string | null> {
	if (!text.trim()) return null;

	const voiceName = voice || DEFAULT_VOICE;
	const languageCode = voiceName.slice(0, 5); // e.g. "ko-KR" from "ko-KR-Wavenet-A"

	try {
		const response = await fetch(`${TTS_URL}?key=${apiKey}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: { text },
				voice: {
					languageCode,
					name: voiceName,
				},
				audioConfig: {
					audioEncoding: "MP3",
					speakingRate: 1.0,
					pitch: 0.0,
				},
			}),
		});

		if (!response.ok) return null;

		const data = (await response.json()) as { audioContent?: string };
		return data.audioContent ?? null;
	} catch {
		return null;
	}
}
