import type { GatewayClient } from "./client.js";

/** Skill eligibility info from skills.status RPC */
export interface SkillStatusInfo {
	name: string;
	description?: string;
	eligible: boolean;
	missing: string[];
	[key: string]: unknown;
}

/** Result from skills.status RPC */
export interface SkillsStatusResult {
	skills: SkillStatusInfo[];
}

/** Result from skills.bins RPC */
export interface SkillsBinsResult {
	bins: string[];
}

/** Get all skills with eligibility status from Gateway */
export async function getSkillsStatus(
	client: GatewayClient,
): Promise<SkillsStatusResult> {
	const payload = await client.request("skills.status", {});
	return payload as SkillsStatusResult;
}

/** Get available skill binaries from Gateway */
export async function getSkillsBins(
	client: GatewayClient,
): Promise<SkillsBinsResult> {
	const payload = await client.request("skills.bins", {});
	return payload as SkillsBinsResult;
}

/** Install a skill's missing dependencies via Gateway */
export async function installSkill(
	client: GatewayClient,
	name: string,
	installId: string,
): Promise<{ installed: boolean; name: string }> {
	const payload = await client.request("skills.install", {
		name,
		installId,
	});
	return payload as { installed: boolean; name: string };
}

/** Update skill configuration (enable/disable, API key, env) */
export async function updateSkillConfig(
	client: GatewayClient,
	name: string,
	patch: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
): Promise<{ updated: boolean; name: string }> {
	const payload = await client.request("skills.update", { name, ...patch });
	return payload as { updated: boolean; name: string };
}
