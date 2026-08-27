import { ActiveAppBridge } from "./app-registry";

/** Cache of per-app bridge instances. Each app gets its own namespace. */
const bridgeCache = new Map<string, ActiveAppBridge>();

/**
 * Return (or create) an ActiveAppBridge for a specific app.
 * Caches instances so onToolCall handlers survive app re-renders.
 */
export function getBridgeForApp(appId: string): ActiveAppBridge {
	if (!bridgeCache.has(appId)) {
		bridgeCache.set(appId, new ActiveAppBridge(appId));
	}
	return bridgeCache.get(appId)!;
}

/** Fallback for contexts where the active app ID is not known. */
export const activeBridge = new ActiveAppBridge("__builtin__");
