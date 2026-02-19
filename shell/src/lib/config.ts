import type { Locale } from "./i18n";
import type { ProviderId } from "./types";
import {
	SECRET_KEYS,
	getSecretKey,
	saveSecretKey,
} from "./secure-store";

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
	vrmModel?: string;
	ttsEnabled?: boolean;
	sttEnabled?: boolean;
	ttsVoice?: string;
	googleApiKey?: string;
	persona?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	allowedTools?: string[];
	userName?: string;
	agentName?: string;
	onboardingComplete?: boolean;
	labKey?: string;
	labUserId?: string;
	disabledSkills?: string[];
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
	gemini: "gemini-2.5-flash",
	openai: "gpt-4o",
	anthropic: "claude-sonnet-4-5-20250929",
	xai: "grok-3-mini",
	zai: "glm-4.7",
	ollama: "llama3.2",
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
			(config as Record<string, unknown>)[key] = secureVal;
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
		const val = (config as Record<string, unknown>)[key];
		if (typeof val === "string" && val.length > 0) {
			await saveSecretKey(key, val);
		}
		(publicConfig as Record<string, unknown>)[key] = undefined;
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
		const val = (config as Record<string, unknown>)[key];
		if (typeof val === "string" && val.length > 0) {
			const existing = await getSecretKey(key);
			if (!existing) {
				await saveSecretKey(key, val);
			}
			(config as Record<string, unknown>)[key] = undefined;
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
