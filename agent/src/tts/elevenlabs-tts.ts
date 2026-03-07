const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

/**
 * Synthesize speech using ElevenLabs TTS API.
 * Returns base64-encoded MP3 audio or null on failure.
 */
export async function synthesizeElevenLabsSpeech(
	text: string,
	apiKey: string,
	voiceIdOrName?: string,
): Promise<string | null> {
	if (!text.trim() || !apiKey) return null;

	try {
		// If voiceIdOrName looks like a name (not a hex ID), resolve it
		let voiceId = voiceIdOrName || DEFAULT_VOICE_ID;
		if (voiceIdOrName && !/^[a-zA-Z0-9]{20,}$/.test(voiceIdOrName)) {
			voiceId =
				(await resolveVoiceName(apiKey, voiceIdOrName)) || DEFAULT_VOICE_ID;
		}

		const response = await fetch(
			`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
			{
				method: "POST",
				headers: {
					"xi-api-key": apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text,
					model_id: "eleven_multilingual_v2",
				}),
			},
		);

		if (!response.ok) return null;

		const buf = Buffer.from(await response.arrayBuffer());
		if (buf.length === 0) return null;
		return buf.toString("base64");
	} catch {
		return null;
	}
}

/**
 * List available ElevenLabs voices.
 * Returns array of { voice_id, name } or empty array on failure.
 */
export async function listElevenLabsVoices(
	apiKey: string,
): Promise<{ voice_id: string; name: string }[]> {
	try {
		const response = await fetch("https://api.elevenlabs.io/v1/voices", {
			headers: { "xi-api-key": apiKey },
		});
		if (!response.ok) return [];
		const data = (await response.json()) as {
			voices: { voice_id: string; name: string }[];
		};
		return data.voices ?? [];
	} catch {
		return [];
	}
}

async function resolveVoiceName(
	apiKey: string,
	name: string,
): Promise<string | null> {
	const voices = await listElevenLabsVoices(apiKey);
	const match = voices.find((v) =>
		v.name.toLowerCase().includes(name.toLowerCase()),
	);
	return match?.voice_id ?? null;
}
