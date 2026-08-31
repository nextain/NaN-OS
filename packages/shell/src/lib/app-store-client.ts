import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_GATEWAY_URL, loadConfig } from "./config";

export interface AppInstallRequest {
	appId: string;
	storeOrigin: string;
	state: string;
	name?: string;
}

function httpGatewayUrl(raw: string): string {
	return raw.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
}

export function getStoreGatewayUrl(): string {
	return httpGatewayUrl(loadConfig()?.gatewayUrl?.trim() || DEFAULT_GATEWAY_URL);
}

export function hasStoreEntitlement(appId: string): Promise<boolean> {
	return invoke<boolean>("app_store_has_entitlement", { appId, gatewayUrl: getStoreGatewayUrl() });
}

interface StoreProductsResponse {
	data?: Array<{
		app_id?: string;
		manifest?: { name?: string; nameKo?: string; nameEn?: string };
	}>;
}

export async function getStoreProductName(appId: string): Promise<string | null> {
	const response = await fetch(`${getStoreGatewayUrl()}/v1/apps/products`);
	if (!response.ok) return null;
	const body = (await response.json()) as StoreProductsResponse;
	const product = body.data?.find((item) => item.app_id === appId);
	return product?.manifest?.nameKo || product?.manifest?.name || product?.manifest?.nameEn || null;
}
