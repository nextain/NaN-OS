import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_GATEWAY_URL, loadConfig } from "./config";

export interface StoreProduct {
	id: string;
	app_id: string;
	version: string;
	price_credits: string;
	manifest: {
		name?: string;
		description?: string;
		names?: Record<string, string>;
		descriptions?: Record<string, string>;
	};
}

function httpGatewayUrl(raw: string): string {
	return raw.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
}

export function getStoreGatewayUrl(): string {
	return httpGatewayUrl(loadConfig()?.gatewayUrl?.trim() || DEFAULT_GATEWAY_URL);
}

async function json<T>(response: Response): Promise<T> {
	if (!response.ok) {
		throw new Error(`App Store request failed (${response.status})`);
	}
	return response.json() as Promise<T>;
}

export async function listStoreProducts(): Promise<StoreProduct[]> {
	const result = await json<{ data: StoreProduct[] }>(await fetch(`${getStoreGatewayUrl()}/v1/apps/products`));
	return result.data;
}

export async function purchaseStoreApp(appId: string): Promise<void> {
	await invoke("app_store_purchase", { appId, gatewayUrl: getStoreGatewayUrl(), idempotencyKey: crypto.randomUUID() });
}

export function hasStoreEntitlement(appId: string): Promise<boolean> {
	return invoke<boolean>("app_store_has_entitlement", { appId, gatewayUrl: getStoreGatewayUrl() });
}
