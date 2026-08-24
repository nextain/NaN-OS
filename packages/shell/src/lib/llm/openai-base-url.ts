const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Normalize an OpenAI-compatible API root without ever duplicating `/v1`. */
export function normalizeOpenAIBaseUrl(value?: string): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return `${trimmed.replace(/\/+$/, "").replace(/\/v1$/i, "")}/v1`;
}

export function effectiveOpenAIBaseUrl(value?: string): string {
	return normalizeOpenAIBaseUrl(value) ?? DEFAULT_OPENAI_BASE_URL;
}
