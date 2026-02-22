import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillDefinition, SkillResult } from "../types.js";

/** Strip emotion tags like [HAPPY], [THINK] etc. from message text */
const EMOTION_TAG_RE = /\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/gi;

function normalizeTarget(args: Record<string, unknown>): string | null {
	const to = (args.to as string | undefined)?.trim();
	if (to) return to;

	const channelId = (args.channelId as string | undefined)?.trim();
	if (channelId) return `channel:${channelId}`;

	const userId = (args.userId as string | undefined)?.trim();
	if (userId) return `user:${userId}`;

	return null;
}

function resolveEnvDefaultTarget(): string | null {
	// Prefer explicit channel ID (direct send, most reliable — avoids DM creation failures)
	const channelId = process.env.DISCORD_DEFAULT_CHANNEL_ID?.trim();
	if (channelId) return `channel:${channelId}`;

	const explicit = process.env.DISCORD_DEFAULT_TARGET?.trim();
	if (explicit) return explicit;

	const defaultUserId = process.env.DISCORD_DEFAULT_USER_ID?.trim();
	if (defaultUserId) return `user:${defaultUserId}`;

	return null;
}

/**
 * Discover Discord DM channel ID from Gateway sessions.
 * When Shell and Discord both route through Gateway, the Discord DM session
 * holds the actual channel ID that can be used for proactive sends.
 */
async function discoverDmChannelFromSessions(
	gateway: { request: (method: string, params?: unknown) => Promise<unknown> },
): Promise<string | null> {
	try {
		const result = (await gateway.request("sessions.list", {})) as {
			sessions?: Array<{
				key: string;
				channel?: string;
				origin?: { provider?: string; surface?: string };
			}>;
		};
		const sessions = result.sessions ?? [];
		// Look for Discord DM sessions — key format: discord:dm:<channelId>
		for (const s of sessions) {
			if (s.channel === "discord" || s.origin?.provider === "discord") {
				const match = s.key.match(/^discord:(?:dm|channel):(\d+)$/);
				if (match) return `channel:${match[1]}`;
			}
			// Also check keys that contain discord with a numeric channel segment
			if (s.key.startsWith("discord:") && /:\d{10,}$/.test(s.key)) {
				const channelId = s.key.split(":").pop();
				if (channelId) return `channel:${channelId}`;
			}
		}
	} catch {
		// Gateway unavailable or sessions.list failed — non-fatal
	}
	return null;
}

function extractUserTargetFromChannelsStatus(payload: {
	channelAccounts?: Record<string, Array<Record<string, unknown>>>;
	channelDefaultAccountId?: Record<string, string>;
}): string | null {
	const discordAccounts = payload.channelAccounts?.discord ?? [];
	const preferredId = payload.channelDefaultAccountId?.discord;

	const extractNumericUserId = (account: Record<string, unknown>): string | null => {
		const nestedProfile =
			typeof account.profile === "object" && account.profile
				? (account.profile as Record<string, unknown>)
				: null;
		const nestedUser =
			typeof account.user === "object" && account.user
				? (account.user as Record<string, unknown>)
				: null;
		const candidates: Array<unknown> = [
			account.userId,
			account.discordUserId,
			account.id,
			account.accountId,
			nestedProfile?.id,
			nestedUser?.id,
		];
		for (const value of candidates) {
			if (typeof value !== "string") continue;
			const trimmed = value.trim();
			if (/^[0-9]{10,}$/.test(trimmed)) return trimmed;
		}
		return null;
	};

	const isActiveAccount = (account: Record<string, unknown>): boolean => {
		if (account.connected === true) return true;
		if (account.enabled === true && account.running === true) return true;
		return false;
	};

	const ordered = [
		...discordAccounts.filter(
			(a) =>
				typeof a.accountId === "string" &&
				a.accountId === preferredId &&
				isActiveAccount(a),
		),
		...discordAccounts.filter(
			(a) =>
				isActiveAccount(a) &&
				typeof a.accountId === "string" &&
				a.accountId !== preferredId,
		),
		...discordAccounts.filter((a) => !isActiveAccount(a)),
	];

	for (const account of ordered) {
		const userId = extractNumericUserId(account);
		if (userId) return `user:${userId}`;
	}
	return null;
}

async function resolveTarget(
	args: Record<string, unknown>,
	gateway: {
		request: (method: string, params?: unknown) => Promise<unknown>;
	},
): Promise<string | null> {
	const explicit = normalizeTarget(args);
	if (explicit) return explicit;

	const envTarget = resolveEnvDefaultTarget();
	if (envTarget) return envTarget;

	// Discover DM channel from Gateway sessions (shared across Shell + Discord)
	const sessionChannel = await discoverDmChannelFromSessions(gateway);
	if (sessionChannel) return sessionChannel;

	try {
		const raw = (await gateway.request("channels.status", {})) as {
			channelAccounts?: Record<string, Array<Record<string, unknown>>>;
			channelDefaultAccountId?: Record<string, string>;
		};
		const derived = extractUserTargetFromChannelsStatus(raw);
		if (derived) return derived;
	} catch {
		// ignore discovery errors and fall back to explicit target requirement
	}

	return null;
}

/**
 * Ensure a Discord user ID is in the OpenClaw allowlist so they can DM back.
 * Silently ignores errors to avoid blocking message sends.
 */
export async function ensureDiscordAllowlisted(
	userId: string,
	openclawDir?: string,
): Promise<void> {
	try {
		const base = openclawDir ?? join(homedir(), ".openclaw");
		const filePath = join(base, "credentials", "discord-allowFrom.json");

		let data: { version: number; allowFrom: string[] } = { version: 1, allowFrom: [] };

		if (existsSync(filePath)) {
			const raw = JSON.parse(readFileSync(filePath, "utf-8"));
			if (Array.isArray(raw.allowFrom)) {
				data = { version: raw.version ?? 1, allowFrom: raw.allowFrom };
			}
		}

		if (data.allowFrom.includes(userId)) return;

		data.allowFrom.push(userId);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, JSON.stringify(data, null, "\t") + "\n");
	} catch {
		// Never block send on allowlist errors
	}
}

export function createNaiaDiscordSkill(): SkillDefinition {
	return {
		name: "skill_naia_discord",
		description:
			"Discord 메시지 전송/수신 도구. 사용자가 '메시지 보내줘/전송해/DM 보내' 등을 요청하면 " +
			"반드시 action='send'와 message 파라미터를 사용하세요. " +
			"수신자(to)는 자동 설정되므로 생략 가능합니다. " +
			"action='status'는 연결 상태 확인 전용입니다. " +
			"action='history'는 최근 메시지 조회입니다.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"'send' = 메시지 전송 (message 필수), " +
						"'status' = 연결 상태 확인만, " +
						"'history' = 최근 메시지 조회 (limit 옵션)",
					enum: ["send", "status", "history"],
				},
				message: {
					type: "string",
					description: "Message text to send (required when action='send')",
				},
				to: {
					type: "string",
					description:
						"Optional override target (e.g. channel:123456789 or user:123456789). " +
						"If omitted, auto-resolved from user config.",
				},
				channelId: {
					type: "string",
					description: "Shortcut: target channel ID (converted to to=channel:<id>)",
				},
				userId: {
					type: "string",
					description: "Shortcut: target user ID (converted to to=user:<id>)",
				},
				accountId: {
					type: "string",
					description: "Optional Discord account ID (default: gateway default account)",
				},
				limit: {
					type: "number",
					description: "Number of messages to retrieve for history action (default: 20, max: 100)",
				},
			},
			required: ["action"],
		},
		tier: 1,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = (args.action as string | undefined)?.trim() || "";
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. skill_naia_discord requires a running Gateway.",
				};
			}

			const methods = (gateway as { availableMethods?: string[] }).availableMethods;

			if (action === "status") {
				if (!Array.isArray(methods) || !methods.includes("channels.status")) {
					return {
						success: false,
						output: "",
						error: "Gateway method not available: channels.status",
					};
				}

				const payload = (await gateway.request("channels.status", {
					probe: args.probe as boolean | undefined,
				})) as {
					channelOrder?: string[];
					channelLabels?: Record<string, string>;
					channelAccounts?: Record<string, Array<Record<string, unknown>>>;
					channelDefaultAccountId?: Record<string, string>;
				};

				const order = payload.channelOrder ?? [];
				const labels = payload.channelLabels ?? {};
				const accounts = payload.channelAccounts ?? {};
				const resolvedUserTarget =
					extractUserTargetFromChannelsStatus({
					channelAccounts: accounts,
					channelDefaultAccountId: payload.channelDefaultAccountId,
					}) ?? resolveEnvDefaultTarget();
				const discordOnly = order
					.filter((id) => id === "discord")
					.map((id) => ({
						id,
						label: labels[id] || id,
						resolvedUserTarget,
						accounts: (accounts[id] || []).map((a) => ({
							accountId: a.accountId,
							connected: a.connected,
							enabled: a.enabled,
							running: a.running,
							userId:
								typeof a.userId === "string"
									? a.userId
									: typeof a.discordUserId === "string"
										? a.discordUserId
										: undefined,
							lastError: a.lastError,
						})),
					}));

				return {
					success: true,
					output: JSON.stringify(discordOnly),
				};
			}

			if (action === "history") {
				const limit = Math.min(
					Math.max(Number(args.limit) || 20, 1),
					100,
				);

				// Use sessions.list + chat.history to find Discord messages
				try {
					const sessionsList = (await gateway.request("sessions.list", {})) as {
						sessions?: Array<{
							key: string;
							channel?: string;
							origin?: { provider?: string; surface?: string; label?: string };
							updatedAt?: number;
						}>;
					};

					const sessions = sessionsList.sessions ?? [];

					// Find Discord-origin sessions
					const discordSessions = sessions.filter(
						(s) =>
							s.channel === "discord" ||
							s.origin?.provider === "discord" ||
							s.origin?.surface === "discord" ||
							s.key.includes("discord"),
					);

					// Also include main session if it has Discord origin
					const mainSession = sessions.find((s) => s.key === "agent:main:main");
					if (
						mainSession &&
						(mainSession.origin?.provider === "discord" ||
							mainSession.origin?.surface === "webchat") &&
						!discordSessions.some((s) => s.key === mainSession.key)
					) {
						discordSessions.push(mainSession);
					}

					if (discordSessions.length === 0) {
						return {
							success: true,
							output: JSON.stringify({ messages: [] }),
						};
					}

					// Fetch history from each Discord session
					const allMessages: Array<{
						id: string;
						from: string;
						content: string;
						timestamp: string;
						role: string;
						sessionKey: string;
					}> = [];

					for (const session of discordSessions) {
						try {
							const history = (await gateway.request("chat.history", {
								sessionKey: session.key,
							})) as {
								messages?: Array<{
									role: string;
									content: Array<{ type: string; text?: string }>;
									timestamp?: number;
								}>;
							};

							const msgs = history.messages ?? [];
							for (const msg of msgs.slice(-limit)) {
								const text = msg.content
									?.filter((c) => c.type === "text" && c.text)
									.map((c) => c.text)
									.join("\n") ?? "";
								if (!text) continue;

								allMessages.push({
									id: `${session.key}:${msg.timestamp ?? Date.now()}`,
									from: msg.role === "user"
										? (session.origin?.label ?? "Discord User")
										: "Naia",
									content: text,
									timestamp: msg.timestamp
										? new Date(msg.timestamp).toISOString()
										: new Date().toISOString(),
									role: msg.role,
									sessionKey: session.key,
								});
							}
						} catch {
							// Skip sessions that fail
						}
					}

					// Sort by timestamp and limit
					allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
					const limited = allMessages.slice(-limit);

					return {
						success: true,
						output: JSON.stringify({ messages: limited }),
					};
				} catch (err) {
					return {
						success: false,
						output: "",
						error: `Discord history failed: ${err instanceof Error ? err.message : String(err)}`,
					};
				}
			}

			if (action === "send") {
				if (!Array.isArray(methods) || !methods.includes("send")) {
					return {
						success: false,
						output: "",
						error: "Gateway method not available: send",
					};
				}

				const rawMessage = (args.message as string | undefined)?.trim();
				if (!rawMessage) {
					return { success: false, output: "", error: "message is required for send" };
				}
				// Strip internal emotion tags — they're for avatar expression, not Discord display
				const message = rawMessage.replace(EMOTION_TAG_RE, "").trim();

				const target = await resolveTarget(args, gateway);
				if (!target) {
					return {
						success: false,
						output: "",
						error:
							"target is required. Provide to (channel:<id>|user:<id>) or channelId/userId. " +
							"Or configure DISCORD_DEFAULT_USER_ID / DISCORD_DEFAULT_TARGET.",
					};
				}

				const userMatch = target.match(/^user:(\d+)$/);
				if (userMatch) {
					await ensureDiscordAllowlisted(userMatch[1]);
				}
				const request: Record<string, unknown> = {
					channel: "discord",
					to: target,
					message,
					idempotencyKey: randomUUID(),
				};
				const accountId = (args.accountId as string | undefined)?.trim();
				if (accountId) request.accountId = accountId;

				try {
					const result = await gateway.request("send", request);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				} catch (err) {
					return {
						success: false,
						output: "",
						error:
							`Discord send failed: ${err instanceof Error ? err.message : String(err)}. ` +
							"Check bot channel permissions and use numeric target IDs (channel:<id> or user:<id>).",
					};
				}
			}

			return {
				success: false,
				output: "",
				error: `Unknown action: ${action}`,
			};
		},
	};
}
