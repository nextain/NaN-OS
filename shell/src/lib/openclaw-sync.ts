import { invoke } from "@tauri-apps/api/core";
import { Logger } from "./logger";
import { buildSystemPrompt } from "./persona";

/**
 * Best-effort sync of Shell provider settings to OpenClaw gateway config.
 * Errors are logged but never block the UI.
 *
 * When `systemPrompt` is provided it is written to SOUL.md as-is.
 * Otherwise we build the full prompt from persona + context so that
 * emotion tags, name substitutions and user context are included.
 */
export async function syncToOpenClaw(
	provider: string,
	model: string,
	apiKey?: string,
	persona?: string,
	agentName?: string,
	userName?: string,
	systemPrompt?: string,
	locale?: string,
	discordDmChannelId?: string,
	discordDefaultUserId?: string,
): Promise<void> {
	try {
		// Build the complete system prompt that includes emotion tags,
		// name substitution, and user context — exactly what the Shell uses.
		const fullPrompt =
			systemPrompt ||
			buildSystemPrompt(persona || undefined, {
				agentName: agentName || undefined,
				userName: userName || undefined,
			});

		await invoke("sync_openclaw_config", {
			params: {
				provider,
				model,
				api_key: apiKey || null,
				persona: fullPrompt,
				agent_name: agentName || null,
				user_name: userName || null,
				locale: locale || null,
				discord_dm_channel_id: discordDmChannelId || null,
				discord_default_user_id: discordDefaultUserId || null,
			},
		});
	} catch (err) {
		Logger.warn("openclaw-sync", "Failed to sync OpenClaw config", {
			error: String(err),
		});
	}
}
