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
