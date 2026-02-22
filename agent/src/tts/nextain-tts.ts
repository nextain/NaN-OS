import { GATEWAY_URL } from "../providers/lab-proxy.js";

export async function synthesizeNextainSpeech(
	text: string,
	labKey: string,
	voice?: string,
): Promise<string | null> {
	if (!text.trim() || !labKey) return null;

	const selectedVoice = voice || "ko-KR-Neural2-A";

	try {
		const res = await fetch(`${GATEWAY_URL}/v1/audio/speech`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-AnyLLM-Key": `Bearer ${labKey}`,
			},
			body: JSON.stringify({
				input: text.slice(0, 5000),
				voice: selectedVoice,
				audio_encoding: "MP3",
			}),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as { audio_content?: string };
		return data.audio_content ?? null;
	} catch {
		return null;
	}
}
