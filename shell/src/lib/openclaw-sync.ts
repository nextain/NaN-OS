import { invoke } from "@tauri-apps/api/core";
import { loadConfig } from "./config";
import { getAllFacts } from "./db";
import { getLocale } from "./i18n";
import { Logger } from "./logger";
import { buildSystemPrompt } from "./persona";

/**
 * Best-effort sync of Shell provider settings to OpenClaw gateway config.
 * Errors are logged but never block the UI.
 *
 * Always loads config + facts internally and builds the full system prompt
 * with facts included, so that SOUL.md contains user facts for all channels
 * (including Discord DM where Shell is not in the loop).
 *
 * Callers may still pass overrides for provider/model/apiKey etc., but
 * the system prompt is always built internally with full context + facts.
 */
export async function syncToOpenClaw(
	provider: string,
	model: string,
	apiKey?: string,
	persona?: string,
	agentName?: string,
	userName?: string,
	_systemPrompt?: string,
	locale?: string,
	discordDmChannelId?: string,
	discordDefaultUserId?: string,
	ttsProvider?: string,
	ttsVoice?: string,
	ttsAuto?: string,
	ttsMode?: string,
	naiaKey?: string,
	ollamaHost?: string,
): Promise<void> {
	try {
		// Always build prompt internally with full context + facts.
		// This ensures SOUL.md contains user facts regardless of caller.
		const cfg = loadConfig();
		const facts = await getAllFacts().catch(() => []);
		const fullPrompt = buildSystemPrompt(persona || cfg?.persona || undefined, {
			agentName: agentName || cfg?.agentName || undefined,
			userName: userName || cfg?.userName || undefined,
			locale: locale || cfg?.locale || getLocale(),
			honorific: cfg?.honorific,
			speechStyle: cfg?.speechStyle,
			discordDefaultUserId: discordDefaultUserId || cfg?.discordDefaultUserId,
			discordDmChannelId: discordDmChannelId || cfg?.discordDmChannelId,
			facts: facts.length > 0 ? facts : undefined,
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
				tts_provider: ttsProvider || null,
				tts_voice: ttsVoice || null,
				tts_auto: ttsAuto || null,
				tts_mode: ttsMode || null,
				naia_key: naiaKey || null,
				ollama_host: ollamaHost || null,
			},
		});
	} catch (err) {
		Logger.warn("openclaw-sync", "Failed to sync OpenClaw config", {
			error: String(err),
		});
	}
}

/**
 * Restart the OpenClaw gateway so it reads fresh config from openclaw.json.
 * Best-effort — errors are logged but never block the UI.
 */
export async function restartGateway(): Promise<void> {
	try {
		await invoke("restart_gateway");
	} catch (err) {
		Logger.warn("openclaw-sync", "Failed to restart gateway", {
			error: String(err),
		});
	}
}
