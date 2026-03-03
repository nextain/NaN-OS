import { loadConfig, resolveGatewayUrl, saveConfig } from "./config";
import { getLocale } from "./i18n";
import { openDmChannel } from "./discord-api";
import { Logger } from "./logger";
import { directToolCall } from "./chat-service";
import { syncToOpenClaw, restartGateway } from "./openclaw-sync";
import { buildSystemPrompt } from "./persona";

const LINKED_CHANNELS_API = "https://naia.nextain.io/api/gateway/linked-channels";

interface LinkedChannel {
	type: string;
	userId: string;
}

interface LinkedChannelsResponse {
	channels: LinkedChannel[];
}

/**
 * Fetch linked messaging channels from naia.nextain.io BFF.
 * Uses desktop key + user id for authentication.
 */
async function fetchLinkedChannels(
	labKey: string,
	labUserId: string,
): Promise<LinkedChannel[]> {
	try {
		const res = await fetch(LINKED_CHANNELS_API, {
			headers: {
				"X-Desktop-Key": labKey,
				"X-User-Id": labUserId,
			},
		});
		if (!res.ok) {
			Logger.warn("channel-sync", "linked-channels API error", {
				status: res.status,
			});
			return [];
		}
		const data = (await res.json()) as LinkedChannelsResponse;
		return data?.channels ?? [];
	} catch (err) {
		Logger.warn("channel-sync", "fetchLinkedChannels failed", {
			error: String(err),
		});
		return [];
	}
}

/**
 * Sync linked channels after login.
 * Called from lab_auth_complete handler in App.tsx / SettingsTab.
 *
 * Flow:
 * 1. Fetch linked channels from BFF
 * 2. If discord channel found → discover DM channel ID (always refresh)
 * 3. Persist to config + sync to OpenClaw Gateway + restart
 */
export async function syncLinkedChannels(): Promise<void> {
	const config = loadConfig();
	if (!config?.labKey || !config?.labUserId) {
		Logger.info("channel-sync", "No lab credentials, skipping channel sync");
		return;
	}

	const channels = await fetchLinkedChannels(config.labKey, config.labUserId);
	if (channels.length === 0) {
		Logger.info("channel-sync", "No linked channels found");
		return;
	}

	const discordChannel = channels.find((ch) => ch.type === "discord");
	if (!discordChannel) {
		Logger.info("channel-sync", "No discord channel linked");
		return;
	}

	const discordUserId = discordChannel.userId;
	Logger.info("channel-sync", "Found linked Discord account", { discordUserId });

	// Persist discord user ID to config
	const current = loadConfig();
	if (!current) return;

	saveConfig({
		...current,
		discordDefaultUserId: discordUserId,
		discordDefaultTarget: current.discordDefaultTarget || `user:${discordUserId}`,
	});

	// Always discover/refresh DM channel ID via Bot API
	let dmChannelId = current.discordDmChannelId;
	try {
		const freshChannelId = await openDmChannel(discordUserId);
		if (freshChannelId) {
			dmChannelId = freshChannelId;
			const updated = loadConfig();
			if (updated) {
				saveConfig({ ...updated, discordDmChannelId: freshChannelId });
			}
			Logger.info("channel-sync", "DM channel ID resolved", {
				channelId: freshChannelId,
				wasNew: !current.discordDmChannelId,
			});
		}
	} catch (err) {
		Logger.warn("channel-sync", "Failed to discover DM channel", {
			error: String(err),
		});
	}

	// Sync to Gateway runtime (allowlist patch)
	void syncDiscordToGateway(discordUserId);

	// Sync to openclaw.json + restart so Gateway picks up the channel ID
	if (dmChannelId) {
		void syncOpenClawWithChannels(discordUserId, dmChannelId);
	}
}

/**
 * Sync Discord DM defaults to Gateway runtime via config.patch.
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
			requestId: `channel-sync-${Date.now()}`,
			gatewayUrl,
			gatewayToken: config?.gatewayToken,
		});
		Logger.info("channel-sync", "Synced Discord DM config to Gateway runtime", { userId });
	} catch (err) {
		Logger.warn("channel-sync", "Failed to sync Discord config to Gateway", {
			error: String(err),
		});
	}
}

/**
 * Sync discord channel IDs to openclaw.json and restart Gateway.
 * This ensures the persistent config includes the DM channel ID
 * so it survives Gateway restarts.
 * Fire-and-forget — never blocks the caller.
 */
async function syncOpenClawWithChannels(
	discordUserId: string,
	dmChannelId: string,
): Promise<void> {
	try {
		const config = loadConfig();
		if (!config) return;

		const fullPrompt = buildSystemPrompt(config.persona, {
			agentName: config.agentName,
			userName: config.userName,
			honorific: config.honorific,
			speechStyle: config.speechStyle,
			discordDefaultUserId: discordUserId,
			discordDmChannelId: dmChannelId,
		});

		await syncToOpenClaw(
			config.provider ?? "gemini",
			config.model ?? "",
			config.apiKey,
			config.persona,
			config.agentName,
			config.userName,
			fullPrompt,
			config.locale || getLocale(),
			dmChannelId,
			discordUserId,
			config.ttsProvider,
			config.ttsVoice,
			config.ttsEnabled ? "on" : undefined,
			undefined,
			config.labKey,
		);
		await restartGateway();
		Logger.info("channel-sync", "OpenClaw config updated with channel IDs", {
			discordUserId,
			dmChannelId,
		});
	} catch (err) {
		Logger.warn("channel-sync", "Failed to sync channels to OpenClaw", {
			error: String(err),
		});
	}
}
