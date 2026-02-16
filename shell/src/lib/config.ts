import type { Locale } from "./i18n";
import type { ProviderId } from "./types";

const STORAGE_KEY = "cafelua-config";

export type ThemeId =
	| "espresso"
	| "midnight"
	| "ocean"
	| "forest"
	| "rose"
	| "latte"
	| "sakura"
	| "cloud";

export interface AppConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
	locale?: Locale;
	theme?: ThemeId;
	backgroundImage?: string;
	ttsEnabled?: boolean;
	sttEnabled?: boolean;
	ttsVoice?: string;
	googleApiKey?: string;
	persona?: string;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
	gemini: "gemini-2.5-flash",
	xai: "grok-3-mini",
	anthropic: "claude-sonnet-4-5-20250929",
};

export function loadConfig(): AppConfig | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AppConfig;
	} catch {
		return null;
	}
}

export function saveConfig(config: AppConfig): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function hasApiKey(): boolean {
	const config = loadConfig();
	return !!config?.apiKey;
}

export function getDefaultModel(provider: ProviderId): string {
	return DEFAULT_MODELS[provider];
}
