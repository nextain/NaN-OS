/**
 * Secure key-value store backed by Tauri Store plugin.
 * Used for sensitive data (API keys, tokens).
 * Non-sensitive config (provider, model, theme) stays in localStorage.
 */

import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "secure-keys.dat";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
	if (!storePromise) {
		storePromise = load(STORE_FILE, { autoSave: true });
	}
	return storePromise;
}

export async function saveSecretKey(
	name: string,
	value: string,
): Promise<void> {
	const store = await getStore();
	await store.set(name, value);
}

export async function getSecretKey(name: string): Promise<string | null> {
	const store = await getStore();
	const val = await store.get<string>(name);
	return val ?? null;
}

export async function deleteSecretKey(name: string): Promise<void> {
	const store = await getStore();
	await store.delete(name);
}

/** Keys that should be stored securely (not in localStorage). */
export const SECRET_KEYS = [
	"apiKey",
	"googleApiKey",
	"labKey",
	"gatewayToken",
] as const;

export type SecretKeyName = (typeof SECRET_KEYS)[number];

export function isSecretKey(key: string): key is SecretKeyName {
	return (SECRET_KEYS as readonly string[]).includes(key);
}
