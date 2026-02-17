import type { ToolDefinition } from "../providers/types.js";
import type { GatewayClient } from "./client.js";

export type { ToolDefinition };

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

/** Validate path has no null bytes or other dangerous characters */
function validatePath(path: string): string | null {
	if (path.includes("\0")) {
		return "Invalid path: contains null byte";
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

/** Execute a tool call via the Gateway */
export async function executeTool(
	client: GatewayClient,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	if (!client.isConnected()) {
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
			try {
				const result = (await client.request("exec.bash", {
					command,
					workdir: args.workdir || undefined,
				})) as { stdout?: string; stderr?: string; exitCode?: number };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: result.stdout || result.stderr || "",
					error: result.exitCode !== 0 ? result.stderr : undefined,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "read_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			try {
				const result = (await client.request("exec.bash", {
					command: `cat ${shellEscape(path)}`,
				})) as { stdout?: string; exitCode?: number };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: result.stdout || "",
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "write_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			try {
				const escapedPath = shellEscape(path);
				const escapedContent = shellEscape(args.content as string);
				const result = (await client.request("exec.bash", {
					command: `mkdir -p "$(dirname ${escapedPath})" && printf '%s' ${escapedContent} > ${escapedPath}`,
				})) as { exitCode?: number; stderr?: string };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: `File written: ${path}`,
					error: result.exitCode !== 0 ? result.stderr : undefined,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
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
			try {
				const command = args.content
					? `grep -rl ${shellEscape(pattern)} ${shellEscape(searchPath)} 2>/dev/null | head -20`
					: `find ${shellEscape(searchPath)} -name ${shellEscape(pattern)} 2>/dev/null | head -20`;
				const result = (await client.request("exec.bash", {
					command,
				})) as { stdout?: string; exitCode?: number };
				return {
					success: true,
					output: result.stdout || "No matches found",
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "web_search": {
			try {
				const result = await client.request("skills.invoke", {
					skill: "web-search",
					args: { query: args.query },
				});
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

		default:
			return { success: false, output: "", error: `Unknown tool: ${toolName}` };
	}
}
