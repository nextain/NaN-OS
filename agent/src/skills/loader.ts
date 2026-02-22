import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GatewayClient } from "../gateway/client.js";
import type { GatewayEvent } from "../gateway/types.js";
import type { SkillRegistry } from "./registry.js";
import type { SkillDefinition, SkillExecutionContext, SkillResult } from "./types.js";

interface SkillManifest {
	name: string;
	description: string;
	type: "gateway" | "command";
	gatewaySkill?: string;
	command?: string;
	tier?: number;
	parameters?: Record<string, unknown>;
}

/**
 * Resolve the first paired node ID from the Gateway.
 */
async function resolveNodeId(client: GatewayClient): Promise<string | undefined> {
	if (!client.availableMethods.includes("node.list")) return undefined;
	try {
		const payload = await client.request("node.list", {});
		const nodes = (payload as Record<string, unknown>)?.nodes;
		if (!Array.isArray(nodes) || nodes.length === 0) return undefined;
		const node = nodes[0] as Record<string, unknown>;
		return (node.id ?? node.nodeId) as string | undefined;
	} catch {
		return undefined;
	}
}

/**
 * Execute a shell command via exec.bash (if available) or node.invoke fallback.
 */
async function runCommand(
	client: GatewayClient,
	command: string,
): Promise<SkillResult> {
	const methods = client.availableMethods;

	// Try exec.bash first
	if (methods.includes("exec.bash")) {
		try {
			const payload = await client.request("exec.bash", { command });
			return parseCommandPayload(payload);
		} catch (err) {
			// Fall through to node.invoke
		}
	}

	// Fallback: node.invoke
	if (methods.includes("node.invoke")) {
		const nodeId = await resolveNodeId(client);
		if (!nodeId) {
			return { success: false, output: "", error: "No paired node available" };
		}
		try {
			const payload = await client.request("node.invoke", {
				nodeId,
				idempotencyKey: randomUUID(),
				command: "system.run",
				params: { command: ["bash", "-lc", command] },
			});
			return parseCommandPayload(payload);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	return { success: false, output: "", error: "No command execution RPC available (exec.bash/node.invoke)" };
}

function parseCommandPayload(payload: unknown): SkillResult {
	const rec = payload as Record<string, unknown> | null;
	// Unwrap nested result/payload from node.invoke
	const inner = (rec?.result ?? rec?.payload ?? rec) as Record<string, unknown> | null;
	const actual = (inner && typeof inner === "object") ? inner : rec;
	const stdout =
		(actual && typeof actual.stdout === "string" ? actual.stdout : "") ||
		(actual && typeof actual.output === "string" ? actual.output : "") ||
		(typeof payload === "string" ? payload : JSON.stringify(payload));
	const exitCode = actual && typeof actual.exitCode === "number" ? actual.exitCode : 0;
	return {
		success: exitCode === 0,
		output: stdout,
		error: exitCode !== 0 ? String(actual?.stderr ?? "") : undefined,
	};
}

function makeCommandHandler(
	command: string,
): (args: Record<string, unknown>, ctx: SkillExecutionContext) => Promise<SkillResult> {
	return async (_args, ctx) => {
		if (!ctx.gateway) {
			return { success: false, output: "", error: "Gateway connection required for command execution" };
		}
		return runCommand(ctx.gateway, command);
	};
}

const AGENT_TIMEOUT_MS = 120_000;

/**
 * Execute a Gateway skill by delegating to the Gateway's built-in LLM agent
 * via chat.send (streaming) or agent (batch) RPC.
 *
 * The Gateway agent reads the skill's SKILL.md and executes the appropriate
 * CLI commands. This replaces the non-existent "skills.invoke" RPC.
 */
function makeGatewayHandler(
	gatewaySkill: string,
): (args: Record<string, unknown>, ctx: SkillExecutionContext) => Promise<SkillResult> {
	return async (args, ctx) => {
		if (!ctx.gateway) {
			return { success: false, output: "", error: "Gateway connection required" };
		}

		// Build a natural-language prompt for the Gateway agent
		const argsDesc = Object.entries(args)
			.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
			.join(", ");
		const message = argsDesc
			? `Use the ${gatewaySkill} skill: ${argsDesc}`
			: `Use the ${gatewaySkill} skill`;

		const sessionKey = `skill:${gatewaySkill}:${Date.now()}`;
		const idempotencyKey = randomUUID();
		const client = ctx.gateway;

		try {
			return await delegateToGatewayAgent(client, message, sessionKey, idempotencyKey);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	};
}

/**
 * Send a message to the Gateway agent and collect its response.
 * Tries chat.send (streaming) first, falls back to agent (batch).
 */
async function delegateToGatewayAgent(
	client: GatewayClient,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const methods = client.availableMethods;

	if (methods.includes("chat.send")) {
		return delegateStreaming(client, message, sessionKey, idempotencyKey);
	}

	if (methods.includes("agent") && methods.includes("agent.wait")) {
		return delegateBatch(client, message, sessionKey, idempotencyKey);
	}

	return { success: false, output: "", error: "Gateway does not support chat.send or agent methods" };
}

async function delegateStreaming(
	client: GatewayClient,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const result = (await client.request("chat.send", {
		message,
		sessionKey,
		idempotencyKey,
	})) as { runId: string };

	const runId = result.runId;
	const chunks: string[] = [];

	return new Promise<SkillResult>((resolve) => {
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve({
					success: chunks.length > 0,
					output: chunks.join("") || "Gateway agent timeout",
					error: chunks.length === 0 ? "Gateway agent timeout" : undefined,
				});
			}
		}, AGENT_TIMEOUT_MS);

		const settle = (success: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ success, output: chunks.join("") || "(no response)" });
		};

		client.onEvent((event: GatewayEvent) => {
			if (settled) return;
			const payload = (event.payload ?? {}) as Record<string, unknown>;
			if (payload.runId && payload.runId !== runId) return;

			if (event.event === "agent") {
				const stream = payload.stream as string | undefined;
				const data = (payload.data ?? {}) as Record<string, unknown>;

				if (stream === "assistant") {
					const text = (data.delta ?? data.text ?? "") as string;
					if (text) chunks.push(text);
				} else if (stream === "lifecycle" && data.phase === "end") {
					settle(true);
				}
			} else if (event.event === "chat") {
				const state = payload.state as string | undefined;
				if (state === "final") {
					const msg = payload.message as Record<string, unknown> | undefined;
					const contentArr = msg?.content as Array<Record<string, unknown>> | undefined;
					if (contentArr?.[0]?.text && chunks.length === 0) {
						chunks.push(contentArr[0].text as string);
					}
					settle(true);
				}
			}
		});
	});
}

async function delegateBatch(
	client: GatewayClient,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const agentResult = (await client.request("agent", {
		message,
		sessionKey,
		idempotencyKey,
	})) as { runId: string };

	await client.request("agent.wait", {
		runId: agentResult.runId,
		timeoutMs: AGENT_TIMEOUT_MS,
	});

	try {
		const transcript = (await client.request("sessions.transcript", {
			key: sessionKey,
		})) as { messages: Array<{ role: string; content: string }> };

		const assistantMsgs = transcript.messages.filter((m) => m.role === "assistant");
		const lastMsg = assistantMsgs[assistantMsgs.length - 1]?.content ?? "";
		return { success: true, output: lastMsg || "(no response)" };
	} catch {
		return { success: true, output: "(transcript unavailable)" };
	}
}

/** Copy bundled default skills to user's skills directory (first-run bootstrap) */
export function bootstrapDefaultSkills(
	skillsDir: string,
	bundledDir: string,
): void {
	if (!fs.existsSync(bundledDir)) return;

	fs.mkdirSync(skillsDir, { recursive: true });

	let bundled: fs.Dirent[];
	try {
		bundled = fs.readdirSync(bundledDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of bundled) {
		if (!entry.isDirectory()) continue;
		const destDir = path.join(skillsDir, entry.name);
		const destManifest = path.join(destDir, "skill.json");
		// Only copy if not already present (don't overwrite user customizations)
		if (fs.existsSync(destManifest)) continue;

		const srcManifest = path.join(bundledDir, entry.name, "skill.json");
		if (!fs.existsSync(srcManifest)) continue;

		fs.mkdirSync(destDir, { recursive: true });
		fs.copyFileSync(srcManifest, destManifest);
	}
}

export function loadCustomSkills(
	registry: SkillRegistry,
	skillsDir: string,
): void {
	if (!fs.existsSync(skillsDir)) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(skillsDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const manifestPath = path.join(skillsDir, entry.name, "skill.json");
		if (!fs.existsSync(manifestPath)) continue;

		let manifest: SkillManifest;
		try {
			manifest = JSON.parse(
				fs.readFileSync(manifestPath, "utf-8"),
			) as SkillManifest;
		} catch {
			continue;
		}

		if (!manifest.name || !manifest.description || !manifest.type) continue;
		if (manifest.type !== "gateway" && manifest.type !== "command") continue;

		const name = manifest.name.startsWith("skill_")
			? manifest.name
			: `skill_${manifest.name}`;

		const isGateway = manifest.type === "gateway";
		const handler = isGateway
			? makeGatewayHandler(manifest.gatewaySkill ?? manifest.name)
			: makeCommandHandler(manifest.command ?? "echo no command");

		const skill: SkillDefinition = {
			name,
			description: manifest.description,
			parameters: manifest.parameters ?? {
				type: "object",
				properties: {},
			},
			execute: handler,
			tier: manifest.tier ?? 2,
			requiresGateway: isGateway,
			source: path.join(skillsDir, entry.name),
		};

		try {
			registry.register(skill);
		} catch {
			// Skip duplicates or invalid names
		}
	}
}
