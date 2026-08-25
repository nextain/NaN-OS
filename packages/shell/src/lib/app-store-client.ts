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
