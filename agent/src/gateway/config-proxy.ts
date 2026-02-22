import type { GatewayClient } from "./client.js";

/** Model info from models.list */
export interface ModelInfo {
	id: string;
	name: string;
	provider: string;
	[key: string]: unknown;
}

/** Get Gateway configuration */
export async function getConfig(
	client: GatewayClient,
): Promise<Record<string, unknown>> {
	const payload = await client.request("config.get", {});
	return payload as Record<string, unknown>;
}

/** Set Gateway configuration */
export async function setConfig(
	client: GatewayClient,
	patch: Record<string, unknown>,
): Promise<{ updated: boolean }> {
	const payload = await client.request("config.set", patch);
	return payload as { updated: boolean };
}

/** Get Gateway config schema */
export async function getConfigSchema(
	client: GatewayClient,
): Promise<Record<string, unknown>> {
	const payload = await client.request("config.schema", {});
	return payload as Record<string, unknown>;
}

/** List available models from Gateway */
export async function listModels(
	client: GatewayClient,
): Promise<{ models: ModelInfo[] }> {
	const payload = await client.request("models.list", {});
	return payload as { models: ModelInfo[] };
}

/** Patch Gateway configuration (merge partial updates) */
export async function patchConfig(
	client: GatewayClient,
	patch: Record<string, unknown>,
): Promise<{ patched: boolean }> {
	const snapshot = (await client.request("config.get", {})) as {
		hash?: string;
		exists?: boolean;
	};
	const params: Record<string, unknown> = {
		raw: JSON.stringify(patch),
	};
	if (
		snapshot?.exists &&
		typeof snapshot.hash === "string" &&
		snapshot.hash
	) {
		params.baseHash = snapshot.hash;
	}
	const payload = await client.request("config.patch", params);
	return payload as { patched: boolean };
}
