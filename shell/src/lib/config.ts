import type { Locale } from "./i18n";
import { SECRET_KEYS, getSecretKey, saveSecretKey } from "./secure-store";
import type { ProviderId } from "./types";

const STORAGE_KEY = "naia-config";
export const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

export type ThemeId =
	| "espresso"
	| "midnight"
	| "ocean"
	| "forest"
	| "rose"
	| "latte"
	| "sakura"
	| "cloud";

export type TtsProviderId = "google" | "edge" | "openai" | "elevenlabs" | "nextain";

export interface AppConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
	locale?: Locale;
	theme?: ThemeId;
	backgroundImage?: string;
	vrmModel?: string;
	customVrms?: string[];
	customBgs?: string[];
	ttsEnabled?: boolean;
	sttEnabled?: boolean;
	ttsVoice?: string;
	googleApiKey?: string;
	ttsProvider?: TtsProviderId;
	ttsEngine?: "auto" | "openclaw" | "google";
	persona?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	chatRouting?: "gateway" | "direct" | "auto";
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
	allowedTools?: string[];
	userName?: string;
	agentName?: string;
	honorific?: string;
	speechStyle?: string;
	onboardingComplete?: boolean;
	labKey?: string;
	labUserId?: string;
	disabledSkills?: string[];
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	openaiTtsApiKey?: string;
	elevenlabsApiKey?: string;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
	nextain: "gemini-3-flash-preview",
	"claude-code-cli": "claude-sonnet-4-5-20250929",
	gemini: "gemini-3-flash-preview",
	openai: "gpt-4o",
	anthropic: "claude-sonnet-4-5-20250929",
	xai: "grok-3-mini",
	zai: "glm-4.7",
	ollama: "llama3.2",
};

export const MODEL_OPTIONS: Record<
	ProviderId,
	{ id: string; label: string }[]
> = {
	nextain: [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
	],
	"claude-code-cli": [
		{ id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
		{ id: "claude-3-7-sonnet-20250219", label: "Claude Sonnet 3.7" },
	],
	gemini: [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro ($2.00 / $12.00)" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash ($0.50 / $3.00)" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro ($1.25 / $10.00)" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash ($0.30 / $2.50)" },
	],
	openai: [{ id: "gpt-4o", label: "GPT-4o ($2.50 / $10.00)" }],
	anthropic: [
		{
			id: "claude-sonnet-4-5-20250929",
			label: "Claude Sonnet 4.5 ($3.00 / $15.00)",
		},
	],
	xai: [{ id: "grok-3-mini", label: "Grok 3 Mini ($0.30 / $0.50)" }],
	zai: [{ id: "glm-4.7", label: "GLM 4.7 ($0.60 / $2.20)" }],
	ollama: [{ id: "llama3.2", label: "Llama 3.2" }],
};

// ── Sync API (localStorage only, backwards compatible) ──

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
	return !!config?.apiKey || !!config?.labKey;
}

export function hasLabKey(): boolean {
	const config = loadConfig();
	return !!config?.labKey;
}

export function getLabKey(): string | undefined {
	return loadConfig()?.labKey;
}

export function resolveGatewayUrl(
	config: AppConfig | null | undefined,
): string | undefined {
	if (!config?.enableTools) return undefined;
	const raw = config.gatewayUrl?.trim();
	return raw && raw.length > 0 ? raw : DEFAULT_GATEWAY_URL;
}

// ── Async API (secure store + localStorage fallback) ──

/**
 * Load full config: localStorage fields + secrets from secure store.
 */
export async function loadConfigWithSecrets(): Promise<AppConfig | null> {
	const config = loadConfig();
	if (!config) return null;

	for (const key of SECRET_KEYS) {
		const secureVal = await getSecretKey(key);
		if (secureVal) {
			(config as any)[key] = secureVal;
		}
	}
	return config;
}

/**
 * Save config: sensitive fields → secure store, rest → localStorage.
 */
export async function saveConfigSecure(config: AppConfig): Promise<void> {
	const publicConfig = { ...config };

	for (const key of SECRET_KEYS) {
		const val = (config as any)[key];
		if (typeof val === "string" && val.length > 0) {
			await saveSecretKey(key, val);
		}
		(publicConfig as any)[key] = undefined;
	}

	localStorage.setItem(STORAGE_KEY, JSON.stringify(publicConfig));
}

/**
 * Migrate secrets from localStorage to secure store.
 * Call once on app startup. Idempotent.
 */
export async function migrateSecretsToSecureStore(): Promise<void> {
	const config = loadConfig();
	if (!config) return;

	let migrated = false;
	for (const key of SECRET_KEYS) {
		const val = (config as any)[key];
		if (typeof val === "string" && val.length > 0) {
			const existing = await getSecretKey(key);
			if (!existing) {
				await saveSecretKey(key, val);
			}
			(config as any)[key] = undefined;
			migrated = true;
		}
	}

	if (migrated) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	}
}

/**
 * Async version: check secure store first, then localStorage.
 */
export async function hasApiKeySecure(): Promise<boolean> {
	const apiKey = await getSecretKey("apiKey");
	const labKey = await getSecretKey("labKey");
	if (apiKey || labKey) return true;
	return hasApiKey();
}

export async function getLabKeySecure(): Promise<string | undefined> {
	const secureVal = await getSecretKey("labKey");
	if (secureVal) return secureVal;
	return getLabKey();
}

export async function hasLabKeySecure(): Promise<boolean> {
	const key = await getLabKeySecure();
	return !!key;
}

// ── Utility functions (sync, unchanged) ──

export function getDefaultModel(provider: ProviderId): string {
	return DEFAULT_MODELS[provider];
}

export function getDisabledSkills(): string[] {
	const config = loadConfig();
	return config?.disabledSkills ?? [];
}

export function isSkillDisabled(skillName: string): boolean {
	return getDisabledSkills().includes(skillName);
}

export function toggleSkill(skillName: string): void {
	const config = loadConfig();
	if (!config) return;
	const disabled = config.disabledSkills ?? [];
	const idx = disabled.indexOf(skillName);
	if (idx >= 0) {
		disabled.splice(idx, 1);
	} else {
		disabled.push(skillName);
	}
	saveConfig({ ...config, disabledSkills: disabled });
}

export function isToolAllowed(toolName: string): boolean {
	const config = loadConfig();
	return config?.allowedTools?.includes(toolName) ?? false;
}

export function addAllowedTool(toolName: string): void {
	const config = loadConfig();
	if (!config) return;
	const tools = config.allowedTools ?? [];
	if (!tools.includes(toolName)) {
		tools.push(toolName);
	}
	saveConfig({ ...config, allowedTools: tools });
}

export function clearAllowedTools(): void {
	const config = loadConfig();
	if (!config) return;
	saveConfig({ ...config, allowedTools: undefined });
}

export function isOnboardingComplete(): boolean {
	const config = loadConfig();
	return config?.onboardingComplete === true;
}

export function getUserName(): string | undefined {
	return loadConfig()?.userName;
}

/** any-llm Gateway URL (shared with agent/src/providers/lab-proxy.ts) */
export const LAB_GATEWAY_URL =
	"https://cafelua-gateway-789741003661.asia-northeast3.run.app";
