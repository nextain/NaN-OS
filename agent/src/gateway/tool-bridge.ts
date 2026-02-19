import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "../providers/types.js";
import { CronScheduler } from "../cron/scheduler.js";
import { CronStore } from "../cron/store.js";
import { createAgentsSkill } from "../skills/built-in/agents.js";
import { createApprovalsSkill } from "../skills/built-in/approvals.js";
import { createChannelsSkill } from "../skills/built-in/channels.js";
import { createConfigSkill } from "../skills/built-in/config.js";
import { createCronSkill } from "../skills/built-in/cron.js";
import { createDeviceSkill } from "../skills/built-in/device.js";
import { createDiagnosticsSkill } from "../skills/built-in/diagnostics.js";
import { createMemoSkill } from "../skills/built-in/memo.js";
import { createNotifyDiscordSkill } from "../skills/built-in/notify-discord.js";
import { createNotifySlackSkill } from "../skills/built-in/notify-slack.js";
import { createSessionsSkill } from "../skills/built-in/sessions.js";
import { createSkillManagerSkill } from "../skills/built-in/skill-manager.js";
import { createSystemStatusSkill } from "../skills/built-in/system-status.js";
import { createTimeSkill } from "../skills/built-in/time.js";
import { createTtsSkill } from "../skills/built-in/tts.js";
import { createVoiceWakeSkill } from "../skills/built-in/voicewake.js";
import { createWeatherSkill } from "../skills/built-in/weather.js";
import { bootstrapDefaultSkills, loadCustomSkills } from "../skills/loader.js";
import { SkillRegistry } from "../skills/registry.js";
import { GatewayRequestError, type GatewayClient } from "./client.js";
import { executeSessionsSpawn } from "./sessions-spawn.js";

export type { ToolDefinition };

/** Global skill registry with built-in skills */
export const skillRegistry = new SkillRegistry();
skillRegistry.register(createAgentsSkill());
skillRegistry.register(createApprovalsSkill());
skillRegistry.register(createChannelsSkill());
skillRegistry.register(createConfigSkill());
skillRegistry.register(createDeviceSkill());
skillRegistry.register(createDiagnosticsSkill());
skillRegistry.register(createMemoSkill());
skillRegistry.register(createNotifyDiscordSkill());
skillRegistry.register(createNotifySlackSkill());
skillRegistry.register(createSessionsSkill());
skillRegistry.register(createSkillManagerSkill(skillRegistry));
skillRegistry.register(createSystemStatusSkill());
skillRegistry.register(createTimeSkill());
skillRegistry.register(createTtsSkill());
skillRegistry.register(createVoiceWakeSkill());
skillRegistry.register(createWeatherSkill());

// Cron skill — persistent store in ~/.cafelua/cron-jobs.json
const cronStorePath = `${process.env.HOME ?? "~"}/.cafelua/cron-jobs.json`;
const cronStore = new CronStore(cronStorePath);
skillRegistry.register(createCronSkill(cronStore));

/** Cron scheduler — fires job payloads to stdout for the Shell to handle */
export const cronScheduler = new CronScheduler((payload) => {
	const msg = JSON.stringify({
		type: "cron_fire",
		jobId: payload.jobId,
		label: payload.label,
		task: payload.task,
		firedAt: payload.firedAt,
	});
	process.stdout.write(`${msg}\n`);
});

// Restore persisted enabled jobs on module load
cronScheduler.restoreFromStore(cronStore);

// Bootstrap default skills from bundled assets (first-run only)
const customSkillsDir = `${process.env.HOME ?? "~"}/.cafelua/skills`;
const bundledSkillsDir = new URL(
	"../../assets/default-skills",
	import.meta.url,
).pathname;
bootstrapDefaultSkills(customSkillsDir, bundledSkillsDir);

// Load custom skills from ~/.cafelua/skills/
loadCustomSkills(skillRegistry, customSkillsDir);

/** Get all tools: Gateway tools + skill tools (minus disabled) */
export function getAllTools(
	hasGateway: boolean,
	disabledSkills?: string[],
): ToolDefinition[] {
	const skillTools = skillRegistry.toToolDefinitions(hasGateway);
	const filtered =
		disabledSkills && disabledSkills.length > 0
			? skillTools.filter((t) => !disabledSkills.includes(t.name))
			: skillTools;
	return [...GATEWAY_TOOLS, ...filtered];
}

/** Result from tool execution */
export interface ToolResult {
	success: boolean;
	output: string;
	error?: string;
}

/** Escape a string for safe use inside a shell single-quoted context */
function shellEscape(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Validate path has no null bytes or directory traversal */
function validatePath(path: string): string | null {
	if (path.includes("\0")) {
		return "Invalid path: contains null byte";
	}
	const normalized = path.replace(/\\/g, "/");
	if (normalized.split("/").includes("..")) {
		return "Invalid path: directory traversal";
	}
	return null;
}

/** Default tools available when Gateway is connected */
export const GATEWAY_TOOLS: ToolDefinition[] = [
	{
		name: "execute_command",
		description:
			"Execute a shell command on the system. Use for installing packages, running scripts, git operations, etc.",
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "The shell command to execute",
				},
				workdir: {
					type: "string",
					description: "Working directory (optional, defaults to home)",
				},
			},
			required: ["command"],
		},
	},
	{
		name: "read_file",
		description: "Read the contents of a file at the given path.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative file path" },
			},
			required: ["path"],
		},
	},
	{
		name: "write_file",
		description: "Write content to a file, creating it if it does not exist.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to write to" },
				content: { type: "string", description: "Content to write" },
			},
			required: ["path", "content"],
		},
	},
	{
		name: "search_files",
		description:
			"Search for files by name pattern or search file contents with a regex pattern.",
		parameters: {
			type: "object",
			properties: {
				pattern: {
					type: "string",
					description: "Glob pattern for filenames or regex for content search",
				},
				path: {
					type: "string",
					description: "Directory to search in (defaults to home)",
				},
				content: {
					type: "boolean",
					description: "If true, search file contents instead of names",
				},
			},
			required: ["pattern"],
		},
	},
	{
		name: "web_search",
		description: "Search the web for information.",
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query" },
			},
			required: ["query"],
		},
	},
	{
		name: "apply_diff",
		description:
			"Apply a search-and-replace edit to a file. Provide the exact text to find and its replacement. Use for precise, targeted file modifications.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to edit" },
				search: {
					type: "string",
					description: "Exact text to find in the file",
				},
				replace: {
					type: "string",
					description: "Text to replace the found text with",
				},
			},
			required: ["path", "search", "replace"],
		},
	},
	{
		name: "browser",
		description:
			"Fetch and read the content of a web page. Returns the page text content (HTML stripped to readable text).",
		parameters: {
			type: "object",
			properties: {
				url: { type: "string", description: "URL of the web page to read" },
			},
			required: ["url"],
		},
	},
	{
		name: "sessions_spawn",
		description:
			"Spawn a sub-agent to handle a complex task asynchronously. The sub-agent runs in a separate session and returns its result when done. Use for tasks requiring deep analysis, multi-file exploration, or independent research.",
		parameters: {
			type: "object",
			properties: {
				task: {
					type: "string",
					description: "Description of the task for the sub-agent to perform",
				},
				label: {
					type: "string",
					description: "Short label for display (optional)",
				},
			},
			required: ["task"],
		},
	},
];

/** Blocked command patterns (Tier 3) */
const BLOCKED_PATTERNS = [
	/^rm\s+-rf\s+\//,
	/^sudo\s/,
	/^chmod\s+777/,
	/\|\s*bash$/,
	/^curl\s.*\|\s*sh/,
	/^mkfs\./,
	/^dd\s+if=/,
];

function isBlockedCommand(command: string): boolean {
	return BLOCKED_PATTERNS.some((pattern) => pattern.test(command.trim()));
}

function hasMethod(client: GatewayClient, method: string): boolean {
	const methods = client.availableMethods;
	// Backward-compatible default for tests/mocks that do not provide
	// method capability metadata from hello-ok.
	if (!Array.isArray(methods) || methods.length === 0) {
		return true;
	}
	return methods.includes(method);
}

function hasAllMethods(client: GatewayClient, methods: string[]): boolean {
	return methods.every((method) => hasMethod(client, method));
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	return value as Record<string, unknown>;
}

function formatError(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

function isMethodUnavailableError(err: unknown): boolean {
	if (err instanceof GatewayRequestError) {
		const code = err.code.toUpperCase();
		if (
			code === "UNKNOWN_METHOD" ||
			code === "METHOD_NOT_FOUND" ||
			code === "NOT_IMPLEMENTED" ||
			code === "UNSUPPORTED_METHOD" ||
			code === "UNKNOWN"
		) {
			return true;
		}
	}
	return /unknown method|method not found|not implemented|unsupported/i.test(
		formatError(err),
	);
}

function getNumberField(
	rec: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = rec[key];
	return typeof value === "number" ? value : undefined;
}

function getStringField(
	rec: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = rec[key];
	return typeof value === "string" ? value : undefined;
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr?: string;
}

function parseCommandResult(payload: unknown, depth = 0): CommandResult {
	const rec = asRecord(payload);
	if (!rec) {
		return {
			exitCode: 0,
			stdout: typeof payload === "string" ? payload : JSON.stringify(payload),
		};
	}

	// Handle wrapped payloads from node.invoke implementations (max 3 levels).
	if (depth < 3) {
		const nested = asRecord(rec.result) ?? asRecord(rec.payload);
		if (nested) {
			return parseCommandResult(nested, depth + 1);
		}
	}

	const stdout =
		getStringField(rec, "stdout") ??
		getStringField(rec, "output") ??
		getStringField(rec, "text") ??
		"";
	const stderr =
		getStringField(rec, "stderr") ??
		getStringField(rec, "error") ??
		getStringField(rec, "message");
	const exitCode =
		getNumberField(rec, "exitCode") ??
		getNumberField(rec, "code") ??
		getNumberField(rec, "statusCode") ??
		0;

	return { exitCode, stdout, stderr };
}

function toToolResult(result: CommandResult): ToolResult {
	return {
		success: result.exitCode === 0,
		output: result.stdout || result.stderr || "",
		error: result.exitCode !== 0 ? result.stderr : undefined,
	};
}

/** Per-client nodeId cache to avoid repeated node.list RPC calls */
const nodeIdCache = new WeakMap<GatewayClient, string | null>();

async function resolveNodeId(client: GatewayClient): Promise<string | null> {
	if (nodeIdCache.has(client)) {
		return nodeIdCache.get(client)!;
	}

	if (!hasMethod(client, "node.list")) {
		nodeIdCache.set(client, null);
		return null;
	}

	const payload = await client.request("node.list", {});
	const rec = asRecord(payload);

	let nodes: unknown[] = [];
	if (Array.isArray(payload)) {
		nodes = payload;
	} else if (rec && Array.isArray(rec.nodes)) {
		nodes = rec.nodes;
	}

	for (const node of nodes) {
		const nodeRec = asRecord(node);
		if (!nodeRec) continue;
		const id =
			getStringField(nodeRec, "nodeId") || getStringField(nodeRec, "id");
		if (id) {
			nodeIdCache.set(client, id);
			return id;
		}
	}

	nodeIdCache.set(client, null);
	return null;
}

async function runExecBash(
	client: GatewayClient,
	command: string,
	workdir?: string,
): Promise<ToolResult> {
	const payload = await client.request("exec.bash", {
		command,
		workdir: workdir || undefined,
	});
	return toToolResult(parseCommandResult(payload));
}

async function runNodeInvoke(
	client: GatewayClient,
	command: string,
	workdir?: string,
): Promise<ToolResult> {
	const nodeId = await resolveNodeId(client);
	if (!nodeId) {
		return {
			success: false,
			output: "",
			error: "No paired node available for node.invoke",
		};
	}

	const payload = await client.request("node.invoke", {
		nodeId,
		idempotencyKey: randomUUID(),
		command: "system.run",
		params: {
			command: ["bash", "-lc", command],
			cwd: workdir || undefined,
		},
	});

	return toToolResult(parseCommandResult(payload));
}

async function runShellCommand(
	client: GatewayClient,
	command: string,
	workdir?: string,
): Promise<ToolResult> {
	const errors: string[] = [];

	if (hasMethod(client, "exec.bash")) {
		try {
			return await runExecBash(client, command, workdir);
		} catch (err) {
			if (!isMethodUnavailableError(err)) {
				return {
					success: false,
					output: "",
					error: `exec.bash: ${formatError(err)}`,
				};
			}
			errors.push(`exec.bash unavailable: ${formatError(err)}`);
		}
	}

	if (hasMethod(client, "node.invoke")) {
		try {
			return await runNodeInvoke(client, command, workdir);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: `node.invoke: ${formatError(err)}`,
			};
		}
	}

	return {
		success: false,
		output: "",
		error:
			errors.length > 0
				? errors.join(" | ")
				: "No supported command execution RPC (exec.bash/node.invoke)",
	};
}

async function invokeBrowserRequest(
	client: GatewayClient,
	url: string,
): Promise<unknown> {
	const attempts: Array<Record<string, unknown>> = [
		{
			method: "POST",
			path: "navigate",
			body: { url },
		},
		{
			method: "POST",
			path: "open",
			body: { url },
		},
		// Backward-compat path used by earlier internal adapter assumptions.
		{ url },
	];

	const errors: string[] = [];
	for (const params of attempts) {
		try {
			return await client.request("browser.request", params);
		} catch (err) {
			errors.push(String(err));
		}
	}

	throw new Error(errors.join(" | "));
}

/** Extra context passed to skill execution */
export interface ExecuteToolContext {
	writeLine?: (data: unknown) => void;
	requestId?: string;
	disabledSkills?: string[];
}

/** Execute a tool call (gateway tools need client; skills may not) */
export async function executeTool(
	client: GatewayClient | null,
	toolName: string,
	args: Record<string, unknown>,
	ctx?: ExecuteToolContext,
): Promise<ToolResult> {
	// Skills can run without gateway
	if (skillRegistry.has(toolName)) {
		return skillRegistry.execute(toolName, args, {
			gateway: client ?? undefined,
			writeLine: ctx?.writeLine,
			requestId: ctx?.requestId,
			disabledSkills: ctx?.disabledSkills,
		});
	}

	// Gateway tools require connected client
	if (!client?.isConnected()) {
		return { success: false, output: "", error: "Gateway not connected" };
	}

	switch (toolName) {
		case "execute_command": {
			const command = args.command as string;
			if (isBlockedCommand(command)) {
				return {
					success: false,
					output: "",
					error: `Blocked: "${command}" is not allowed for safety reasons`,
				};
			}
			return runShellCommand(
				client,
				command,
				args.workdir as string | undefined,
			);
		}

		case "read_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			return runShellCommand(client, `cat ${shellEscape(path)}`);
		}

		case "write_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			const escapedPath = shellEscape(path);
			const escapedContent = shellEscape(args.content as string);
			const result = await runShellCommand(
				client,
				`mkdir -p "$(dirname ${escapedPath})" && printf '%s' ${escapedContent} > ${escapedPath}`,
			);
			if (!result.success) {
				return result;
			}
			return {
				success: true,
				output: `File written: ${path}`,
			};
		}

		case "search_files": {
			const pattern = args.pattern as string;
			const searchPath = (args.path as string) || "~";
			const patternErr = validatePath(pattern);
			const pathErr = validatePath(searchPath);
			if (patternErr || pathErr) {
				return {
					success: false,
					output: "",
					error: patternErr || pathErr || "Invalid input",
				};
			}
			const command = args.content
				? `grep -rl ${shellEscape(pattern)} ${shellEscape(searchPath)} 2>/dev/null | head -20`
				: `find ${shellEscape(searchPath)} -name ${shellEscape(pattern)} 2>/dev/null | head -20`;
			const result = await runShellCommand(client, command);
			if (!result.success) {
				return result;
			}
			return {
				success: true,
				output: result.output || "No matches found",
			};
		}

		case "web_search": {
			try {
				let result: unknown;
				if (hasMethod(client, "skills.invoke")) {
					result = await client.request("skills.invoke", {
						skill: "web-search",
						args: { query: args.query },
					});
				} else if (hasMethod(client, "browser.request")) {
					const query = String(args.query ?? "").trim();
					if (!query) {
						return {
							success: false,
							output: "",
							error: "Search query is required",
						};
					}
					const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
					result = await invokeBrowserRequest(client, url);
				} else {
					return {
						success: false,
						output: "",
						error: "No supported web search RPC (skills.invoke/browser.request)",
					};
				}

				return {
					success: true,
					output: JSON.stringify(result),
				};
			} catch (err) {
				return {
					success: false,
					output: "",
					error: `Web search failed: ${String(err)}`,
				};
			}
		}

		case "apply_diff": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			const search = args.search as string;
			const replace = args.replace as string;
			if (!search) {
				return {
					success: false,
					output: "",
					error: "search text cannot be empty",
				};
			}
			try {
				// Read file, replace, write back
				const readResult = await runShellCommand(
					client,
					`cat ${shellEscape(path)}`,
				);
				if (!readResult.success) return readResult;

				const content = readResult.output || "";
				if (!content.includes(search)) {
					return {
						success: false,
						output: "",
						error: "Search text not found in file",
					};
				}
				const newContent = content.replace(search, replace);
				const escapedPath = shellEscape(path);
				const escapedContent = shellEscape(newContent);
				const writeResult = await runShellCommand(
					client,
					`printf '%s' ${escapedContent} > ${escapedPath}`,
				);
				if (!writeResult.success) return writeResult;

				return {
					success: true,
					output: `Applied diff to ${path}`,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "browser": {
			const url = args.url as string;
			if (!url) {
				return { success: false, output: "", error: "URL is required" };
			}
			try {
				let result: unknown;
				if (hasMethod(client, "skills.invoke")) {
					result = await client.request("skills.invoke", {
						skill: "browser",
						args: { url },
					});
				} else if (hasMethod(client, "browser.request")) {
					result = await invokeBrowserRequest(client, url);
				} else {
					return {
						success: false,
						output: "",
						error: "No supported browser RPC (skills.invoke/browser.request)",
					};
				}
				return {
					success: true,
					output:
						typeof result === "string"
							? result
							: JSON.stringify(result),
				};
			} catch (err) {
				return {
					success: false,
					output: "",
					error: `Browser failed: ${String(err)}`,
				};
			}
		}

		case "sessions_spawn": {
			if (
				!hasAllMethods(client, [
					"sessions.spawn",
					"agent.wait",
					"sessions.transcript",
				])
			) {
				return {
					success: false,
					output: "",
					error: "sessions_spawn is not available on this Gateway",
				};
			}

			return executeSessionsSpawn(client, {
				task: args.task as string,
				label: args.label as string | undefined,
			});
		}

		default:
			return { success: false, output: "", error: `Unknown tool: ${toolName}` };
	}
}
