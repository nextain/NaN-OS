import { directToolCall } from "./chat-service";
import { loadConfig, resolveGatewayUrl, DEFAULT_GATEWAY_URL } from "./config";
import { Logger } from "./logger";

const POLL_INTERVAL_MS = 30_000;
const HISTORY_LIMIT = 20;

export interface DiscordIncomingMessage {
	id: string;
	from: string;
	content: string;
	timestamp: string;
}

type OnNewMessages = (messages: DiscordIncomingMessage[]) => void;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let seenIds = new Set<string>();
let onNewMessages: OnNewMessages | null = null;

/** Parse gateway readMessages response into normalized messages. */
function parseMessages(raw: string): DiscordIncomingMessage[] {
	try {
		const parsed = JSON.parse(raw);

		// Response might be { messages: [...] } or direct array
		const arr = Array.isArray(parsed) ? parsed : parsed?.messages;
		if (!Array.isArray(arr)) return [];

		return arr
			.filter(
				(m: Record<string, unknown>) =>
					typeof m.id === "string" &&
					typeof m.content === "string" &&
					// Exclude outbound (assistant/bot) messages — those are sent BY us,
					// so they should not appear as incoming Discord notifications in the main chat.
					m.role !== "assistant" &&
					m.role !== "toolResult",
			)
			.map((m: Record<string, unknown>) => ({
				id: String(m.id),
				from:
					typeof m.author === "object" && m.author
						? String(
								(m.author as Record<string, unknown>).username ||
									(m.author as Record<string, unknown>).name ||
									"Discord",
							)
						: typeof m.from === "string"
							? m.from
							: "Discord",
				content: String(m.content),
				timestamp:
					typeof m.timestamp === "string"
						? m.timestamp
						: new Date().toISOString(),
			}));
	} catch {
		return [];
	}
}

/** Tracks whether history is available to avoid repeated failures. */
let historyAvailable: boolean | null = null;

async function fetchNewMessages(): Promise<DiscordIncomingMessage[]> {
	// Don't poll if we already know history is unavailable
	if (historyAvailable === false) return [];

	const config = loadConfig();
	if (!config?.enableTools) return [];

	const gatewayUrl = resolveGatewayUrl(config) || DEFAULT_GATEWAY_URL;

	try {
		const result = await directToolCall({
			toolName: "skill_naia_discord",
			args: { action: "history", limit: HISTORY_LIMIT },
			requestId: `discord-poll-${Date.now()}`,
			gatewayUrl,
			gatewayToken: config.gatewayToken,
			discordDefaultUserId: config.discordDefaultUserId,
			discordDefaultTarget: config.discordDefaultTarget,
		});

		if (!result.success || !result.output) {
			// Mark as unavailable if Gateway doesn't support readMessages
			if (result.output?.includes("not available") || !result.success) {
				if (historyAvailable === null) {
					Logger.info("discord-poll", "Discord history not available, disabling polling");
					historyAvailable = false;
				}
			}
			return [];
		}

		historyAvailable = true;
		const all = parseMessages(result.output);
		const fresh = all.filter((m) => !seenIds.has(m.id));

		// Update seen set (keep bounded)
		for (const m of all) seenIds.add(m.id);
		if (seenIds.size > 500) {
			const keep = all.map((m) => m.id);
			seenIds = new Set(keep);
		}

		return fresh;
	} catch (err) {
		if (historyAvailable === null) {
			Logger.warn("discord-poll", "Poll failed, disabling", { error: String(err) });
			historyAvailable = false;
		}
		return [];
	}
}

async function poll(): Promise<void> {
	const fresh = await fetchNewMessages();
	if (fresh.length > 0 && onNewMessages) {
		onNewMessages(fresh);
	}
}

/** Start polling for Discord messages. Callback receives only new messages. */
export function startDiscordPoll(callback: OnNewMessages): void {
	if (pollTimer) return; // already running
	onNewMessages = callback;

	// Initial fetch (marks existing messages as seen, no callback on first run)
	fetchNewMessages().then(() => {
		Logger.info("discord-poll", "Initial fetch done, starting poll loop");
	});

	pollTimer = setInterval(() => {
		poll();
	}, POLL_INTERVAL_MS);
}

/** Stop polling. */
export function stopDiscordPoll(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	onNewMessages = null;
}

/** Reset seen message tracking (e.g., on new conversation). */
export function resetDiscordPollState(): void {
	seenIds.clear();
	historyAvailable = null;
}
