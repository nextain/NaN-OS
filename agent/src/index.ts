import * as readline from "node:readline";
import { GatewayClient } from "./gateway/client.js";
import { GATEWAY_TOOLS, executeTool } from "./gateway/tool-bridge.js";
import {
	getToolDescription,
	getToolTier,
	needsApproval,
} from "./gateway/tool-tiers.js";
import {
	type ApprovalResponse,
	type ChatRequest,
	parseRequest,
} from "./protocol.js";
import { calculateCost } from "./providers/cost.js";
import { buildProvider } from "./providers/factory.js";
import type { ChatMessage, StreamChunk } from "./providers/types.js";
import { ALPHA_SYSTEM_PROMPT } from "./system-prompt.js";
import { synthesizeSpeech } from "./tts/google-tts.js";

const activeStreams = new Map<string, AbortController>();

const EMOTION_TAG_RE = /^\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/i;
const MAX_TOOL_ITERATIONS = 10;
const APPROVAL_TIMEOUT_MS = 120_000;

/** Pending approval promises keyed by toolCallId */
const pendingApprovals = new Map<
	string,
	{ resolve: (decision: ApprovalResponse["decision"]) => void }
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
	} = req;
	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	let gateway: GatewayClient | null = null;

	try {
		const provider = buildProvider(providerConfig);
		const effectiveSystemPrompt = systemPrompt ?? ALPHA_SYSTEM_PROMPT;
		const tools = enableTools && gatewayUrl ? GATEWAY_TOOLS : undefined;

		// Connect to Gateway if tools enabled
		if (enableTools && gatewayUrl) {
			gateway = new GatewayClient();
			await gateway.connect(gatewayUrl, { token: gatewayToken || "" });
		}

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
			);

			const toolCalls: {
				id: string;
				name: string;
				args: Record<string, unknown>;
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
			if (toolCalls.length === 0 || !gateway) break;

			// Add assistant's tool call message to conversation
			chatMessages.push({
				role: "assistant",
				content: "",
				toolCalls: toolCalls.map((tc) => ({
					id: tc.id,
					name: tc.name,
					args: tc.args,
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

				const result = await executeTool(gateway, call.name, call.args);
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
						executeTool(gateway!, call.name, call.args).then(
							(result) => ({ call, result }),
						),
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

		// TTS synthesis — only when ttsVoice is set
		const googleKey = ttsVoice
			? ttsApiKey ||
				(providerConfig.provider === "gemini" ? providerConfig.apiKey : null)
			: null;
		if (googleKey && fullText.trim()) {
			const cleanText = fullText.replace(EMOTION_TAG_RE, "");
			try {
				const audio = await synthesizeSpeech(cleanText, googleKey, ttsVoice);
				if (audio) {
					writeLine({ type: "audio", requestId, data: audio });
				}
			} catch {
				// TTS failure is non-critical
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
		// Cleanup any pending approvals for this request
		for (const [toolCallId, pending] of pendingApprovals) {
			pending.resolve("reject");
			pendingApprovals.delete(toolCallId);
		}
		activeStreams.delete(requestId);
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

		if (request.type === "chat_request") {
			handleChatRequest(request);
		}
	});

	rl.on("close", () => {
		process.exit(0);
	});

	// Signal readiness
	writeLine({ type: "ready" });
}

main();
