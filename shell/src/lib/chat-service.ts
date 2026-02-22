import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentResponseChunk, ProviderConfig } from "./types";

interface SendChatOptions {
	message: string;
	provider: ProviderConfig;
	history: { role: "user" | "assistant"; content: string }[];
	onChunk: (chunk: AgentResponseChunk) => void;
	requestId: string;
	ttsVoice?: string;
	ttsApiKey?: string;
	ttsEngine?: "auto" | "openclaw" | "google";
	ttsProvider?: "google" | "edge" | "openai" | "elevenlabs" | "nextain";
	systemPrompt?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	disabledSkills?: string[];
	routeViaGateway?: boolean;
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
}

const RESPONSE_TIMEOUT_MS = 120_000; // Safety: clean up listener if no finish/error

export async function sendChatMessage(opts: SendChatOptions): Promise<void> {
	const {
		message,
		provider,
		history,
		onChunk,
		requestId,
		ttsVoice,
		ttsApiKey,
		ttsEngine,
		ttsProvider,
		systemPrompt,
		enableTools,
		gatewayUrl,
		gatewayToken,
		disabledSkills,
		routeViaGateway,
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	} = opts;

	const request = {
		type: "chat_request",
		requestId,
		provider,
		messages: [...history, { role: "user", content: message }],
		...(ttsVoice && { ttsVoice }),
		...(ttsApiKey && { ttsApiKey }),
		...(ttsEngine && { ttsEngine }),
		...(ttsProvider && { ttsProvider }),
		...(systemPrompt && { systemPrompt }),
		...(enableTools != null && { enableTools }),
		...(gatewayUrl && { gatewayUrl }),
		...(gatewayToken && { gatewayToken }),
		...(disabledSkills && disabledSkills.length > 0 && { disabledSkills }),
		...(routeViaGateway != null && { routeViaGateway }),
		...(slackWebhookUrl !== undefined && { slackWebhookUrl }),
		...(discordWebhookUrl !== undefined && { discordWebhookUrl }),
		...(googleChatWebhookUrl !== undefined && { googleChatWebhookUrl }),
		...(discordDefaultUserId !== undefined && { discordDefaultUserId }),
		...(discordDefaultTarget !== undefined && { discordDefaultTarget }),
		...(discordDmChannelId !== undefined && { discordDmChannelId }),
	};

	// Listen for agent responses before sending to avoid race conditions
	const unlisten = await listen<string>("agent_response", (event) => {
		try {
			const raw =
				typeof event.payload === "string"
					? event.payload
					: JSON.stringify(event.payload);
			const chunk = JSON.parse(raw) as AgentResponseChunk;
			if (chunk.requestId !== requestId) return;
			onChunk(chunk);

			if (chunk.type === "finish" || chunk.type === "error") {
				clearTimeout(timeoutId);
				unlisten();
			}
		} catch {
			// Ignore malformed events
		}
	});

	// Safety timeout: clean up listener if agent never sends finish/error
	const timeoutId = setTimeout(() => {
		unlisten();
		onChunk({ type: "error", requestId, message: "Agent response timeout" });
	}, RESPONSE_TIMEOUT_MS);

	try {
		await invoke("send_to_agent_command", {
			message: JSON.stringify(request),
		});
	} catch (err) {
		clearTimeout(timeoutId);
		unlisten();
		throw err;
	}
}

export async function cancelChat(requestId: string): Promise<void> {
	await invoke("cancel_stream", { requestId });
}

/** Direct tool call — bypasses LLM, no token cost */
export async function directToolCall(opts: {
	toolName: string;
	args: Record<string, unknown>;
	requestId: string;
	gatewayUrl?: string;
	gatewayToken?: string;
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
}): Promise<{ success: boolean; output: string }> {
	const {
		toolName,
		args,
		requestId,
		gatewayUrl,
		gatewayToken,
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	} = opts;

	const request = {
		type: "tool_request",
		requestId,
		toolName,
		args,
		...(gatewayUrl && { gatewayUrl }),
		...(gatewayToken && { gatewayToken }),
		...(slackWebhookUrl !== undefined && { slackWebhookUrl }),
		...(discordWebhookUrl !== undefined && { discordWebhookUrl }),
		...(googleChatWebhookUrl !== undefined && { googleChatWebhookUrl }),
		...(discordDefaultUserId !== undefined && { discordDefaultUserId }),
		...(discordDefaultTarget !== undefined && { discordDefaultTarget }),
		...(discordDmChannelId !== undefined && { discordDmChannelId }),
	};

	return new Promise(async (resolve, reject) => {
		let result = { success: false, output: "" };

		const unlisten = await listen<string>("agent_response", (event) => {
			try {
				const raw =
					typeof event.payload === "string"
						? event.payload
						: JSON.stringify(event.payload);
				const chunk = JSON.parse(raw) as AgentResponseChunk;
				if (chunk.requestId !== requestId) return;

				if (chunk.type === "tool_result") {
					result = {
						success: chunk.success,
						output: chunk.output,
					};
				} else if (chunk.type === "finish") {
					clearTimeout(timeoutId);
					unlisten();
					resolve(result);
				} else if (chunk.type === "error") {
					clearTimeout(timeoutId);
					unlisten();
					reject(new Error(chunk.message));
				}
			} catch {
				// Ignore malformed events
			}
		});

		const timeoutId = setTimeout(() => {
			unlisten();
			reject(new Error("Tool request timeout"));
		}, RESPONSE_TIMEOUT_MS);

		try {
			await invoke("send_to_agent_command", {
				message: JSON.stringify(request),
			});
		} catch (err) {
			clearTimeout(timeoutId);
			unlisten();
			reject(err);
		}
	});
}
