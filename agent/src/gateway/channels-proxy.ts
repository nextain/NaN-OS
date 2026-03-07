import type { GatewayClient } from "./client.js";

/** Account info within a channel */
export interface ChannelAccount {
	accountId: string;
	name?: string;
	enabled?: boolean;
	configured?: boolean;
	linked?: boolean;
	running?: boolean;
	connected?: boolean;
	reconnectAttempts?: number;
	lastConnectedAt?: number;
	lastError?: string;
	lastStartAt?: number;
	lastStopAt?: number;
	lastInboundAt?: number;
	lastOutboundAt?: number;
	mode?: string;
	tokenSource?: string;
	[key: string]: unknown;
}

/** Result from channels.status RPC */
export interface ChannelsStatusResult {
	ts: number;
	channelOrder: string[];
	channelLabels: Record<string, string>;
	channelDetailLabels?: Record<string, string>;
	channelSystemImages?: Record<string, string>;
	channels: Record<string, unknown>;
	channelAccounts: Record<string, ChannelAccount[]>;
	channelDefaultAccountId: Record<string, string>;
}

/** Result from channels.logout RPC */
export interface ChannelLogoutResult {
	channel: string;
	accountId: string;
	cleared: boolean;
	loggedOut?: boolean;
}

/** Fetch status of all channels and their accounts */
export async function getChannelsStatus(
	client: GatewayClient,
	options?: { probe?: boolean; timeoutMs?: number },
): Promise<ChannelsStatusResult> {
	const payload = await client.request("channels.status", options ?? {});
	return payload as ChannelsStatusResult;
}

/** Log out a specific channel (and optionally a specific account) */
export async function logoutChannel(
	client: GatewayClient,
	channel: string,
	accountId?: string,
): Promise<ChannelLogoutResult> {
	const params: Record<string, unknown> = { channel };
	if (accountId) {
		params.accountId = accountId;
	}
	const payload = await client.request("channels.logout", params);
	return payload as ChannelLogoutResult;
}

/** Start web login flow (QR code) for a channel */
export async function startWebLogin(
	client: GatewayClient,
	options?: {
		force?: boolean;
		timeoutMs?: number;
		accountId?: string;
	},
): Promise<{ qrCode?: string; expiresAt?: number; [key: string]: unknown }> {
	const payload = await client.request("web.login.start", options ?? {});
	return payload as { qrCode?: string; expiresAt?: number };
}

/** Wait for web login completion (user scans QR) */
export async function waitWebLogin(
	client: GatewayClient,
	options?: { timeoutMs?: number; accountId?: string },
): Promise<{ connected: boolean; [key: string]: unknown }> {
	const payload = await client.request("web.login.wait", options ?? {});
	return payload as { connected: boolean };
}
