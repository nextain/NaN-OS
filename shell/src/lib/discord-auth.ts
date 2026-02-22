import { directToolCall } from "./chat-service";
import { getDefaultModel, loadConfig, resolveGatewayUrl, saveConfig, type AppConfig } from "./config";
import { openDmChannel } from "./discord-api";
import { Logger } from "./logger";

export interface DiscordAuthPayload {
	discordUserId?: string | null;
	discordChannelId?: string | null;
	discordTarget?: string | null;
}

function normalizeSnowflake(value?: string | null): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!/^[0-9]{6,32}$/.test(trimmed)) return "";
	return trimmed;
}

function normalizeTarget(value?: string | null): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (/^(user|channel):[0-9]{6,32}$/.test(trimmed)) return trimmed;
	return "";
}

function ensureBaseConfig(existing: AppConfig | null): AppConfig {
	if (existing) return existing;
	return {
		provider: "gemini",
		model: getDefaultModel("gemini"),
		apiKey: "",
	};
}

export function persistDiscordDefaults(payload: DiscordAuthPayload): AppConfig | null {
	const discordUserId = normalizeSnowflake(payload.discordUserId);
	const discordChannelId = normalizeSnowflake(payload.discordChannelId);
	const explicitTarget = normalizeTarget(payload.discordTarget);
	const fallbackTarget = discordUserId ? `user:${discordUserId}` : "";
	const discordTarget = explicitTarget || fallbackTarget;

	if (!discordUserId && !discordTarget) {
		return null;
	}

	const current = ensureBaseConfig(loadConfig());
	const next: AppConfig = {
		...current,
		discordDefaultUserId: discordUserId || current.discordDefaultUserId,
		discordDefaultTarget: discordTarget || current.discordDefaultTarget,
		...(discordChannelId && { discordDmChannelId: discordChannelId }),
	};
	saveConfig(next);

	// Auto-discover DM channel ID if we have a user ID but no channel ID
	if ((discordUserId || next.discordDefaultUserId) && !next.discordDmChannelId) {
		const targetUserId = discordUserId || next.discordDefaultUserId!;
		void discoverDmChannelId(targetUserId);
	} else if (next.discordDefaultUserId && next.discordDmChannelId) {
		// Both IDs available — sync to Gateway runtime
		void syncDiscordToGateway(next.discordDefaultUserId);
	}

	return next;
}

/**
 * Discover DM channel ID via Discord Bot API and persist it.
 * Also syncs Discord config to Gateway runtime via config.patch.
 * Fire-and-forget — errors are logged but never block the caller.
 */
async function discoverDmChannelId(userId: string): Promise<void> {
	try {
		const channelId = await openDmChannel(userId);
		if (!channelId) return;

		const current = loadConfig();
		if (!current || current.discordDmChannelId) return;

		saveConfig({ ...current, discordDmChannelId: channelId });
		Logger.info("discord-auth", "Auto-discovered DM channel ID", { channelId });

		// Sync to Gateway runtime
		void syncDiscordToGateway(userId);
	} catch (err) {
		Logger.warn("discord-auth", "Failed to auto-discover DM channel", {
			error: String(err),
		});
	}
}

/**
 * Sync Discord DM defaults to Gateway runtime via config.patch.
 * This ensures channels.status includes Discord and send RPC works.
 * Fire-and-forget — never blocks the caller.
 */
async function syncDiscordToGateway(userId: string): Promise<void> {
	try {
		const config = loadConfig();
		const gatewayUrl = resolveGatewayUrl(config);
		if (!gatewayUrl) return;

		await directToolCall({
			toolName: "skill_config",
			args: {
				action: "patch",
				patch: {
					channels: {
						discord: {
							dm: {
								enabled: true,
								policy: "allowlist",
								allowFrom: [userId],
							},
						},
					},
				},
			},
			requestId: `discord-sync-${Date.now()}`,
			gatewayUrl,
			gatewayToken: config?.gatewayToken,
		});
		Logger.info("discord-auth", "Synced Discord DM config to Gateway", { userId });
	} catch (err) {
		Logger.warn("discord-auth", "Failed to sync Discord config to Gateway", {
			error: String(err),
		});
	}
}

