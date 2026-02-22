import {
	getChannelsStatus,
	logoutChannel,
	startWebLogin,
	waitWebLogin,
} from "../../gateway/channels-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createChannelsSkill(): SkillDefinition {
	return {
		name: "skill_channels",
		description:
			"Manage messaging channels (Discord, Slack, Telegram, etc.). Actions: status, logout, login_start, login_wait.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"Action: status (list channels), logout (disconnect), login_start (begin QR login), login_wait (wait for QR scan)",
					enum: ["status", "logout", "login_start", "login_wait"],
				},
				channel: {
					type: "string",
					description:
						"Channel ID (e.g., discord, slack, telegram). Required for logout.",
				},
				account_id: {
					type: "string",
					description: "Account ID within the channel (optional)",
				},
				probe: {
					type: "boolean",
					description:
						"Run health checks on channels (for status action, optional)",
				},
			},
			required: ["action"],
		},
		tier: 1,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Channel management requires a running Gateway.",
				};
			}

			switch (action) {
				case "status": {
					const result = await getChannelsStatus(gateway, {
						probe: args.probe as boolean | undefined,
					});

					const summary = result.channelOrder.map((id) => ({
						id,
						label: result.channelLabels[id] || id,
						accounts: (result.channelAccounts[id] || []).map(
							(a) => ({
								// Discord bot channel reports may keep `connected` false
								// even when the account is configured/running.
								connected: (() => {
									const channelState = result.channels?.[id] as
										| { configured?: boolean; running?: boolean; lastError?: string | null }
										| undefined;
									if (id === "discord") {
										const healthyDiscordBot =
											channelState?.configured === true &&
											channelState?.running === true &&
											!channelState?.lastError &&
											!a.lastError;
										if (healthyDiscordBot) return true;
									}
									return a.connected ?? false;
								})(),
								accountId: a.accountId,
								name: a.name,
								enabled: a.enabled ?? false,
								lastError: a.lastError,
							}),
						),
					}));

					return {
						success: true,
						output: JSON.stringify(summary),
					};
				}

				case "logout": {
					const channel = args.channel as string;
					if (!channel) {
						return {
							success: false,
							output: "",
							error: "channel is required for logout",
						};
					}
					const result = await logoutChannel(
						gateway,
						channel,
						args.account_id as string | undefined,
					);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "login_start": {
					const result = await startWebLogin(gateway, {
						force: args.force as boolean | undefined,
						accountId: args.account_id as string | undefined,
					});
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "login_wait": {
					const result = await waitWebLogin(gateway, {
						accountId: args.account_id as string | undefined,
						timeoutMs: 120_000,
					});
					return {
						success: result.connected,
						output: JSON.stringify(result),
						error: result.connected
							? undefined
							: "Login timed out or was cancelled",
					};
				}

				default:
					return {
						success: false,
						output: "",
						error: `Unknown action: ${action}`,
					};
			}
		},
	};
}
