import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline";
import { GatewayClient } from "./gateway/client.js";
import { loadDeviceIdentity } from "./gateway/device-identity.js";
import { createGatewayEventHandler } from "./gateway/event-handler.js";
import { executeTool, getAllTools } from "./gateway/tool-bridge.js";
import {
	getToolDescription,
	getToolTier,
	needsApproval,
} from "./gateway/tool-tiers.js";
import {
	type ApprovalResponse,
	type ChatRequest,
	type ToolRequest,
	parseRequest,
} from "./protocol.js";
import { calculateCost } from "./providers/cost.js";
import { buildProvider } from "./providers/factory.js";
import type { ChatMessage, StreamChunk } from "./providers/types.js";
import { ALPHA_SYSTEM_PROMPT } from "./system-prompt.js";
import { synthesizeEdgeSpeech } from "./tts/edge-tts.js";
import { synthesizeElevenLabsSpeech } from "./tts/elevenlabs-tts.js";
import { synthesizeSpeech } from "./tts/google-tts.js";
import { synthesizeNextainSpeech } from "./tts/nextain-tts.js";
import { synthesizeOpenAISpeech } from "./tts/openai-tts.js";
import type { ToolDefinition } from "./providers/types.js";

const activeStreams = new Map<string, AbortController>();

const EMOTION_TAG_RE = /^\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/i;
const MAX_TOOL_ITERATIONS = 10;
const APPROVAL_TIMEOUT_MS = 120_000;

/** Build system prompt with current tool/gateway status */
function buildToolStatusPrompt(
	base: string,
	enableTools: boolean,
	wantGateway: boolean,
	gatewayConnected: boolean,
	tools?: ToolDefinition[],
): string {
	if (!enableTools) {
		return `${base}\n\n[System Status]\n도구 사용이 비활성화되어 있습니다. 사용자에게 "설정 > 도구 사용"을 켜도록 안내하세요.`;
	}

	const toolNames = tools?.map((t) => t.name) ?? [];
	let status = `\n\n[System Status]\n사용 가능한 도구(${toolNames.length}개): ${toolNames.join(", ")}`;

	if (wantGateway && !gatewayConnected) {
		status += `\n⚠️ Gateway 연결 실패: 일부 도구(채널 관리, 디바이스 페어링 등 Gateway 필요 도구)를 사용할 수 없습니다. Gateway가 필요한 도구를 요청받으면, 앱을 재시작하면 Gateway도 자동으로 재시작된다고 안내하세요.`;
	} else if (gatewayConnected) {
		status += "\nGateway 연결됨 ✓";
	}

	if (toolNames.includes("skill_naia_discord")) {
		status +=
			"\n\n[Tool Guide: skill_naia_discord]" +
			"\n- 메시지 전송: action='send', message='내용' (to 생략 가능 — 자동 타깃)" +
			"\n- 상태 확인: action='status'" +
			"\n- 사용자가 '메시지 보내줘/전송해줘' 등을 요청하면 반드시 action='send'를 사용하세요.";
	}

	return base + status;
}

/** Pending approval promises keyed by toolCallId */
const pendingApprovals = new Map<
	string,
	{
		requestId: string;
		resolve: (decision: ApprovalResponse["decision"]) => void;
	}
>();

function resolveGatewayToken(token?: string): string {
	const direct = token?.trim();
	if (direct) return direct;
	return resolveFallbackGatewayToken();
}

function resolveFallbackGatewayToken(): string {
	const candidates = [
		join(homedir(), ".openclaw", "openclaw.json"),
		join(homedir(), ".naia", "openclaw", "openclaw.json"),
	];
	for (const path of candidates) {
		try {
			const raw = JSON.parse(readFileSync(path, "utf-8")) as {
				gateway?: { auth?: { token?: string } };
			};
			const fallback = raw.gateway?.auth?.token?.trim();
			if (fallback) return fallback;
		} catch {
			// ignore and try next candidate
		}
	}
	return "";
}

function resolveGatewayTokenCandidates(token?: string): string[] {
	const direct = token?.trim() ?? "";
	const fallback = resolveFallbackGatewayToken();
	const seen = new Set<string>();
	const tokens: string[] = [];

	if (direct) {
		seen.add(direct);
		tokens.push(direct);
	}
	if (fallback && !seen.has(fallback)) {
		seen.add(fallback);
		tokens.push(fallback);
	}
	if (tokens.length === 0) tokens.push("");
	return tokens;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectGatewayWithRetry(
	gatewayUrl: string,
	gatewayToken: string | undefined,
): Promise<GatewayClient> {
	const device = loadDeviceIdentity();
	const tokenCandidates = resolveGatewayTokenCandidates(gatewayToken);
	let lastError: unknown;

	for (const token of tokenCandidates) {
		// Gateway startup can race with first request.
		// Retry each token a few times with small backoff before giving up.
		for (let attempt = 1; attempt <= 3; attempt++) {
			const client = new GatewayClient();
			try {
				await client.connect(gatewayUrl, {
					token,
					device,
					role: "operator",
					scopes: ["operator.read", "operator.write", "operator.admin"],
				});
				return client;
			} catch (err) {
				lastError = err;
				client.close();
				if (attempt < 3) {
					await delay(200 * attempt);
				}
			}
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Failed to connect gateway");
}

function applyNotifyWebhookEnv(opts: {
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
}): void {
	const mappings: Array<[string, string | undefined]> = [
		["SLACK_WEBHOOK_URL", opts.slackWebhookUrl],
		["DISCORD_WEBHOOK_URL", opts.discordWebhookUrl],
		["GOOGLE_CHAT_WEBHOOK_URL", opts.googleChatWebhookUrl],
		["DISCORD_DEFAULT_USER_ID", opts.discordDefaultUserId],
		["DISCORD_DEFAULT_TARGET", opts.discordDefaultTarget],
		["DISCORD_DEFAULT_CHANNEL_ID", opts.discordDmChannelId],
	];
	for (const [envKey, value] of mappings) {
		if (value === undefined) continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			process.env[envKey] = trimmed;
		} else {
			delete process.env[envKey];
		}
	}
}

export function handleApprovalResponse(resp: ApprovalResponse): void {
	const pending = pendingApprovals.get(resp.toolCallId);
	if (pending) {
		pending.resolve(resp.decision);
		pendingApprovals.delete(resp.toolCallId);
	}
}

function waitForApproval(
	requestId: string,
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ApprovalResponse["decision"]> {
	const tier = getToolTier(toolName);
	const description = getToolDescription(toolName, args);

	writeLine({
		type: "approval_request",
		requestId,
		toolCallId,
		toolName,
		args,
		tier,
		description,
	});

	return new Promise<ApprovalResponse["decision"]>((resolve) => {
		const timeoutId = setTimeout(() => {
			pendingApprovals.delete(toolCallId);
			resolve("reject");
		}, APPROVAL_TIMEOUT_MS);

		pendingApprovals.set(toolCallId, {
			requestId,
			resolve: (decision) => {
				clearTimeout(timeoutId);
				resolve(decision);
			},
		});
	});
}

function writeLine(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data)}\n`);
}

export async function handleChatRequest(req: ChatRequest): Promise<void> {
	const {
		requestId,
		provider: providerConfig,
		messages: rawMessages,
		systemPrompt,
		ttsVoice,
		ttsApiKey,
		ttsEngine = "auto",
		ttsProvider,
		enableTools,
		gatewayUrl,
		gatewayToken,
		disabledSkills,
		// routeViaGateway — intentionally unused; see NOTE below
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	} = req;
	applyNotifyWebhookEnv({
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	});
	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	let gateway: GatewayClient | null = null;

	try {
		const provider = buildProvider(providerConfig);
		const wantGatewayForTools = !!(enableTools && gatewayUrl);
		const wantGatewayForTts =
			!!gatewayUrl && !!ttsVoice && (ttsEngine === "openclaw" || ttsEngine === "auto");
		const wantGateway = wantGatewayForTools || wantGatewayForTts;
		let gatewayConnected = false;

		// Connect to Gateway if tools enabled and URL provided
		if (wantGateway) {
			try {
				gateway = await connectGatewayWithRetry(gatewayUrl, gatewayToken);
				gatewayConnected = true;

				// Register event handler for Gateway-pushed events
				const eventHandler = createGatewayEventHandler(
					writeLine,
					pendingApprovals as Map<string, { requestId: string; resolve: (decision: "approve" | "reject") => void }>,
				);
				gateway.onEvent(eventHandler);
			} catch {
				// Gateway unavailable — continue without it
				gateway = null;
			}
		}

		// NOTE: routeViaGateway is intentionally disabled.
		// Gateway chat (chat.send) delegates to gateway's own agent which only
		// sees gateway-native tools (8 GATEWAY_TOOLS), completely bypassing
		// agent built-in skills (20+ skills including skill_naia_discord).
		// All chat goes through the direct LLM path below which has full
		// access to both GATEWAY_TOOLS and agent built-in skills via getAllTools().

		const tools = enableTools
			? getAllTools(gatewayConnected, disabledSkills)
			: undefined;

		// Build system prompt with tool/gateway status context
		const basePrompt = systemPrompt ?? ALPHA_SYSTEM_PROMPT;
		const effectiveSystemPrompt = buildToolStatusPrompt(
			basePrompt,
			enableTools ?? false,
			wantGateway,
			gatewayConnected,
			tools,
		);

		// Build conversation messages
		const chatMessages: ChatMessage[] = rawMessages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		let fullText = "";
		let totalInputTokens = 0;
		let totalOutputTokens = 0;

		const executeToolWithRecovery = async (
			toolName: string,
			args: Record<string, unknown>,
		) => {
			let result = await executeTool(gateway ?? null, toolName, args, {
				writeLine,
				requestId,
				disabledSkills,
			});

			if (result.success) return result;
			if (!gatewayUrl) return result;

			const errText = (result.error ?? "").toLowerCase();
			const maybeGatewayIssue =
				errText.includes("gateway not connected") ||
				errText.includes("requires a running gateway") ||
				errText.includes("gateway method not available") ||
				errText.includes("unauthorized");
			if (!maybeGatewayIssue) return result;

			try {
				if (gateway) {
					gateway.close();
					gateway = null;
				}
				gateway = await connectGatewayWithRetry(gatewayUrl, gatewayToken);
				gatewayConnected = true;
				const eventHandler = createGatewayEventHandler(
					writeLine,
					pendingApprovals as Map<
						string,
						{
							requestId: string;
							resolve: (decision: "approve" | "reject") => void;
						}
					>,
				);
				gateway.onEvent(eventHandler);

				result = await executeTool(gateway, toolName, args, {
					writeLine,
					requestId,
					disabledSkills,
				});
			} catch {
				// Keep original failure result if reconnect/retry also fails.
			}

			return result;
		};

		// Tool call loop
		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
			if (controller.signal.aborted) break;

			const stream = provider.stream(
				chatMessages,
				effectiveSystemPrompt,
				tools,
				controller.signal,
			);

			const toolCalls: {
				id: string;
				name: string;
				args: Record<string, unknown>;
				thoughtSignature?: string;
			}[] = [];

			for await (const chunk of stream) {
				if (controller.signal.aborted) break;

				if (chunk.type === "text") {
					fullText += chunk.text;
					writeLine({ type: "text", requestId, text: chunk.text });
				} else if (chunk.type === "tool_use") {
					toolCalls.push({
						id: chunk.id,
						name: chunk.name,
						args: chunk.args,
						thoughtSignature: chunk.thoughtSignature,
					});
					writeLine({
						type: "tool_use",
						requestId,
						toolCallId: chunk.id,
						toolName: chunk.name,
						args: chunk.args,
					});
				} else if (chunk.type === "usage") {
					totalInputTokens += chunk.inputTokens;
					totalOutputTokens += chunk.outputTokens;
				}
			}

			// No tool calls — done
			if (toolCalls.length === 0) break;

			// Add assistant's tool call message to conversation
			chatMessages.push({
				role: "assistant",
				content: "",
				toolCalls: toolCalls.map((tc) => ({
					id: tc.id,
					name: tc.name,
					args: tc.args,
					thoughtSignature: tc.thoughtSignature,
				})),
			});

			// Execute each tool (with approval check for tier 1-2)
			// Partition: sessions_spawn runs in parallel, others sequential
			const spawnCalls = toolCalls.filter(
				(c) => c.name === "sessions_spawn",
			);
			const otherCalls = toolCalls.filter(
				(c) => c.name !== "sessions_spawn",
			);

			// Process sequential tools first
			for (const call of otherCalls) {
				if (needsApproval(call.name)) {
					const decision = await waitForApproval(
						requestId,
						call.id,
						call.name,
						call.args,
					);

					if (decision === "reject") {
						const rejectOutput = "User rejected tool execution";
						writeLine({
							type: "tool_result",
							requestId,
							toolCallId: call.id,
							toolName: call.name,
							output: rejectOutput,
							success: false,
						});
						chatMessages.push({
							role: "tool",
							content: `Error: ${rejectOutput}`,
							toolCallId: call.id,
							name: call.name,
						});
						continue;
					}
				}

				const result = await executeToolWithRecovery(call.name, call.args);
				writeLine({
					type: "tool_result",
					requestId,
					toolCallId: call.id,
					toolName: call.name,
					output: result.output || result.error || "",
					success: result.success,
				});
				chatMessages.push({
					role: "tool",
					content: result.success ? result.output : `Error: ${result.error}`,
					toolCallId: call.id,
					name: call.name,
				});
			}

			// Process sessions_spawn calls in parallel (approval sequential, execution parallel)
			if (spawnCalls.length > 0) {
				// Approval phase (sequential — one modal at a time)
				const approvedSpawns: typeof spawnCalls = [];
				for (const call of spawnCalls) {
					if (needsApproval(call.name)) {
						const decision = await waitForApproval(
							requestId,
							call.id,
							call.name,
							call.args,
						);

						if (decision === "reject") {
							const rejectOutput = "User rejected tool execution";
							writeLine({
								type: "tool_result",
								requestId,
								toolCallId: call.id,
								toolName: call.name,
								output: rejectOutput,
								success: false,
							});
							chatMessages.push({
								role: "tool",
								content: `Error: ${rejectOutput}`,
								toolCallId: call.id,
								name: call.name,
							});
							continue;
						}
					}
					approvedSpawns.push(call);
				}

				// Execution phase (parallel)
				const results = await Promise.all(
					approvedSpawns.map((call) =>
						executeToolWithRecovery(call.name, call.args).then((result) => ({
							call,
							result,
						})),
					),
				);

				for (const { call, result } of results) {
					writeLine({
						type: "tool_result",
						requestId,
						toolCallId: call.id,
						toolName: call.name,
						output: result.output || result.error || "",
						success: result.success,
					});
					chatMessages.push({
						role: "tool",
						content: result.success
							? result.output
							: `Error: ${result.error}`,
						toolCallId: call.id,
						name: call.name,
					});
				}
			}
		}

		// TTS synthesis — provider-specific direct calls
		if (ttsVoice && fullText.trim()) {
			const cleanText = fullText
				.replace(EMOTION_TAG_RE, "")
				.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
				.trim();
			let audioSent = !cleanText;

			// Direct TTS based on selected provider
			if (ttsProvider === "nextain" && providerConfig.labKey) {
				try {
					const audio = await synthesizeNextainSpeech(cleanText, providerConfig.labKey, ttsVoice);
					if (audio) {
						writeLine({ type: "audio", requestId, data: audio });
						audioSent = true;
					}
				} catch { /* non-critical */ }
			} else if (ttsProvider === "openai" && ttsApiKey) {
				try {
					const audio = await synthesizeOpenAISpeech(cleanText, ttsApiKey, ttsVoice);
					if (audio) {
						writeLine({ type: "audio", requestId, data: audio });
						audioSent = true;
					}
				} catch { /* non-critical */ }
			} else if (ttsProvider === "elevenlabs" && ttsApiKey) {
				try {
					const audio = await synthesizeElevenLabsSpeech(cleanText, ttsApiKey, ttsVoice);
					if (audio) {
						writeLine({ type: "audio", requestId, data: audio });
						audioSent = true;
					}
				} catch { /* non-critical */ }
			} else if (ttsProvider === "edge" || (!ttsProvider && ttsEngine === "openclaw")) {
				// Edge TTS: try direct msedge-tts first
				try {
					const audio = await synthesizeEdgeSpeech(cleanText, ttsVoice);
					if (audio) {
						writeLine({ type: "audio", requestId, data: audio });
						audioSent = true;
					}
				} catch { /* non-critical */ }
			}

			// Fallback: Google Cloud TTS
			if (!audioSent && (ttsProvider === "google" || ttsEngine === "google" || ttsEngine === "auto")) {
				const googleKey =
					ttsApiKey ||
					(providerConfig.provider === "gemini" ? providerConfig.apiKey : null);
				if (googleKey) {
					try {
						const audio = await synthesizeSpeech(cleanText, googleKey, ttsVoice);
						if (audio) {
							writeLine({ type: "audio", requestId, data: audio });
						}
					} catch {
						// TTS failure is non-critical
					}
				}
			}
		}

		// Send usage + finish (skip cost for local providers like claude-code-cli)
		const skipCost = providerConfig.provider === "claude-code-cli";
		if (!skipCost && (totalInputTokens > 0 || totalOutputTokens > 0)) {
			const cost = calculateCost(
				providerConfig.model,
				totalInputTokens,
				totalOutputTokens,
			);
			writeLine({
				type: "usage",
				requestId,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				cost,
				model: providerConfig.model,
			});
		}
		writeLine({ type: "finish", requestId });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		writeLine({ type: "error", requestId, message });
	} finally {
		if (gateway) {
			gateway.close();
		}
		// Cleanup pending approvals for this request only
		for (const [toolCallId, pending] of pendingApprovals) {
			if (pending.requestId === requestId) {
				pending.resolve("reject");
				pendingApprovals.delete(toolCallId);
			}
		}
		activeStreams.delete(requestId);
	}
}

/** Handle direct tool request (no LLM, no token cost) */
export async function handleToolRequest(req: ToolRequest): Promise<void> {
	const {
		requestId,
		toolName,
		args,
		gatewayUrl,
		gatewayToken,
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	} = req;
	applyNotifyWebhookEnv({
		slackWebhookUrl,
		discordWebhookUrl,
		googleChatWebhookUrl,
		discordDefaultUserId,
		discordDefaultTarget,
		discordDmChannelId,
	});

	let gateway: GatewayClient | null = null;

	try {
		if (gatewayUrl) {
			gateway = await connectGatewayWithRetry(gatewayUrl, gatewayToken);
		}

		const result = await executeTool(gateway, toolName, args, {
			writeLine,
			requestId,
		});

		writeLine({
			type: "tool_result",
			requestId,
			toolCallId: `direct-${requestId}`,
			toolName,
			output: result.output || result.error || "",
			success: result.success,
		});
		writeLine({ type: "finish", requestId });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		writeLine({ type: "error", requestId, message });
	} finally {
		if (gateway) {
			gateway.close();
		}
	}
}

function main(): void {
	const rl = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});

	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		const request = parseRequest(trimmed);
		if (!request) {
			writeLine({
				type: "error",
				requestId: "unknown",
				message: "Invalid request",
			});
			return;
		}

		if (request.type === "cancel_stream") {
			const controller = activeStreams.get(request.requestId);
			if (controller) {
				controller.abort();
				activeStreams.delete(request.requestId);
			}
			return;
		}

		if (request.type === "approval_response") {
			handleApprovalResponse(request);
			return;
		}

		if (request.type === "tool_request") {
			handleToolRequest(request).catch((err) => {
				writeLine({
					type: "error",
					requestId: request.requestId,
					message: err instanceof Error ? err.message : String(err),
				});
			});
			return;
		}

		if (request.type === "chat_request") {
			handleChatRequest(request).catch((err) => {
				writeLine({
					type: "error",
					requestId: request.requestId,
					message: err instanceof Error ? err.message : String(err),
				});
			});
		}
	});

	rl.on("close", () => {
		process.exit(0);
	});

	// Signal readiness
	writeLine({ type: "ready" });
}

main();
