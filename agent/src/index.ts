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
import { convertTts } from "./gateway/tts-proxy.js";
import { ALPHA_SYSTEM_PROMPT } from "./system-prompt.js";
import { synthesizeSpeech } from "./tts/google-tts.js";
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
		enableTools,
		gatewayUrl,
		gatewayToken,
		disabledSkills,
	} = req;
	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	let gateway: GatewayClient | null = null;

	try {
		const provider = buildProvider(providerConfig);
		const wantGateway = !!(enableTools && gatewayUrl);
		let gatewayConnected = false;

		// Connect to Gateway if tools enabled and URL provided
		if (wantGateway) {
			try {
				gateway = new GatewayClient();
				const device = loadDeviceIdentity();
				await gateway.connect(gatewayUrl, {
					token: gatewayToken || "",
					device,
				});
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

				const result = await executeTool(gateway ?? null, call.name, call.args, {
					writeLine,
					requestId,
					disabledSkills,
				});
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
						executeTool(gateway ?? null, call.name, call.args, {
							writeLine,
							requestId,
							disabledSkills,
						}).then((result) => ({ call, result })),
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

		// TTS synthesis — Gateway first, Google TTS fallback
		if (ttsVoice && fullText.trim()) {
			const cleanText = fullText
				.replace(EMOTION_TAG_RE, "")
				.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
			let audioSent = false;

			// Try Gateway TTS first (supports OpenAI, ElevenLabs, Edge)
			if (gateway?.isConnected()) {
				try {
					const result = await convertTts(gateway, cleanText);
					if (result.audio) {
						writeLine({ type: "audio", requestId, data: result.audio });
						audioSent = true;
					}
				} catch {
					// Gateway TTS failed, fall through to Google
				}
			}

			// Fallback: Google Cloud TTS
			if (!audioSent) {
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

		// Send usage + finish
		if (totalInputTokens > 0 || totalOutputTokens > 0) {
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
	const { requestId, toolName, args, gatewayUrl, gatewayToken } = req;
	let gateway: GatewayClient | null = null;

	try {
		if (gatewayUrl) {
			gateway = new GatewayClient();
			const device = loadDeviceIdentity();
			await gateway.connect(gatewayUrl, {
				token: gatewayToken || "",
				device,
			});
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
