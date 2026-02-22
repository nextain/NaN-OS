import { directToolCall } from "./chat-service";
import { loadConfig, resolveGatewayUrl, saveConfig } from "./config";
import { Logger } from "./logger";
import type { ChatMessage } from "./types";

/** Gateway session entry from skill_sessions list */
export interface GatewaySession {
	key: string;
	label: string;
	messageCount: number;
	createdAt: number;
	updatedAt: number;
	summary?: string;
}

function getGatewayOpts(): {
	gatewayUrl: string;
	gatewayToken?: string;
} | null {
	const config = loadConfig();
	const gatewayUrl = resolveGatewayUrl(config);
	if (!gatewayUrl || !config?.enableTools) return null;
	return { gatewayUrl, gatewayToken: config.gatewayToken };
}

/** List all Gateway sessions */
export async function listGatewaySessions(
	limit = 50,
): Promise<GatewaySession[]> {
	const opts = getGatewayOpts();
	if (!opts) return [];

	try {
		const res = await directToolCall({
			toolName: "skill_sessions",
			args: { action: "list", limit },
			requestId: `gw-sessions-list-${Date.now()}`,
			...opts,
		});
		if (!res.success || !res.output) return [];
		const parsed = JSON.parse(res.output) as {
			sessions?: Array<{
				key: string;
				label?: string;
				messageCount?: number;
				createdAt?: number;
				updatedAt?: number;
				metadata?: { summary?: string };
			}>;
		};
		return (parsed.sessions ?? []).map((s) => ({
			key: s.key,
			label: s.label ?? s.key,
			messageCount: s.messageCount ?? 0,
			createdAt: s.createdAt ?? 0,
			updatedAt: s.updatedAt ?? 0,
			summary: s.metadata?.summary,
		}));
	} catch (err) {
		Logger.warn("gateway-sessions", "Failed to list sessions", {
			error: String(err),
		});
		return [];
	}
}

/** Get chat history for a Gateway session key */
export async function getGatewayHistory(
	key: string,
): Promise<ChatMessage[]> {
	const opts = getGatewayOpts();
	if (!opts) return [];

	try {
		const res = await directToolCall({
			toolName: "skill_sessions",
			args: { action: "history", key },
			requestId: `gw-history-${Date.now()}`,
			...opts,
		});
		if (!res.success || !res.output) return [];
		const parsed = JSON.parse(res.output) as {
			messages?: Array<{
				role: string;
				content: Array<{ type: string; text?: string }>;
				timestamp?: number;
			}>;
		};
		return (parsed.messages ?? [])
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({
				id: `gw-${m.timestamp ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				role: m.role as "user" | "assistant",
				content:
					m.content
						?.filter((c) => c.type === "text" && c.text)
						.map((c) => c.text!)
						.join("\n") ?? "",
				timestamp: m.timestamp ?? Date.now(),
			}));
	} catch (err) {
		Logger.warn("gateway-sessions", "Failed to get history", {
			error: String(err),
		});
		return [];
	}
}

/** Delete a Gateway session */
export async function deleteGatewaySession(key: string): Promise<boolean> {
	const opts = getGatewayOpts();
	if (!opts) return false;

	try {
		const res = await directToolCall({
			toolName: "skill_sessions",
			args: { action: "delete", key },
			requestId: `gw-delete-${Date.now()}`,
			...opts,
		});
		return res.success;
	} catch (err) {
		Logger.warn("gateway-sessions", "Failed to delete session", {
			error: String(err),
		});
		return false;
	}
}

/** Patch Gateway session metadata (e.g. summary) */
export async function patchGatewaySession(
	key: string,
	patch: { summary?: string; label?: string },
): Promise<boolean> {
	const opts = getGatewayOpts();
	if (!opts) return false;

	try {
		const res = await directToolCall({
			toolName: "skill_sessions",
			args: { action: "patch", key, metadata: patch },
			requestId: `gw-patch-${Date.now()}`,
			...opts,
		});
		return res.success;
	} catch (err) {
		Logger.warn("gateway-sessions", "Failed to patch session", {
			error: String(err),
		});
		return false;
	}
}

/**
 * Discover Discord DM channel ID from Gateway sessions and persist to config.
 * Call on app init — if config already has discordDmChannelId, skips discovery.
 * Returns the discovered channel ID or null.
 */
export async function discoverAndPersistDiscordDmChannel(): Promise<string | null> {
	const config = loadConfig();
	if (config?.discordDmChannelId) return config.discordDmChannelId;

	const sessions = await listGatewaySessions(100);
	for (const s of sessions) {
		// Gateway Discord DM sessions have key format: discord:dm:<channelId>
		const match = s.key.match(/^discord:(?:dm|channel):(\d{10,})$/);
		if (match) {
			const channelId = match[1];
			if (config) {
				saveConfig({ ...config, discordDmChannelId: channelId });
			}
			Logger.info("gateway-sessions", "Discovered Discord DM channel ID from sessions", { channelId });
			return channelId;
		}
	}
	return null;
}

/** Reset the current Gateway session (for new conversation) */
export async function resetGatewaySession(
	key = "agent:main:main",
): Promise<boolean> {
	const opts = getGatewayOpts();
	if (!opts) return false;

	try {
		const res = await directToolCall({
			toolName: "skill_sessions",
			args: { action: "reset", key },
			requestId: `gw-reset-${Date.now()}`,
			...opts,
		});
		return res.success;
	} catch (err) {
		Logger.warn("gateway-sessions", "Failed to reset session", {
			error: String(err),
		});
		return false;
	}
}
