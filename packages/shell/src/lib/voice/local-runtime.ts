export interface LocalVoiceHealth {
	ttsReady: boolean;
	avatarReady: boolean;
	mode?: string;
}

/**
 * FR-VOICE.14 (#418): the single readiness verdict for the local voice façade.
 * A listening port or a stored URL is NOT readiness — only the façade /health
 * body reporting the TTS service enabled counts. Returns null when the façade
 * is unreachable (engine not running) or the body is not the health contract,
 * so callers can distinguish "engine off" from "engine up, TTS unavailable".
 */
export async function fetchLocalVoiceHealth(
	baseUrl: string,
	init?: { signal?: AbortSignal },
): Promise<LocalVoiceHealth | null> {
	try {
		const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
			signal: init?.signal,
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			tts_enabled?: unknown;
			avatar_enabled?: unknown;
			mode?: unknown;
		};
		if (typeof body?.tts_enabled !== "boolean") return null;
		return {
			ttsReady: body.tts_enabled === true,
			avatarReady: body.avatar_enabled === true,
			mode: typeof body.mode === "string" ? body.mode : undefined,
		};
	} catch {
		return null;
	}
}

export function localVoiceFacadeUrlFromReady(ready: string): string | null {
	try {
		const payload = JSON.parse(ready) as {
			facade_port?: number;
			services?: Array<{ kind?: string }>;
		};
		const port = payload.facade_port;
		if (typeof port !== "number" || !Number.isFinite(port)) return null;
		const hasVoice =
			Array.isArray(payload.services) &&
			payload.services.some((service) => service?.kind === "tts");
		return hasVoice ? `http://127.0.0.1:${port}` : null;
	} catch {
		return null;
	}
}
