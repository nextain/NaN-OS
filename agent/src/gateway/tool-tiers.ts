/**
 * Tool permission tiers.
 * Tier 0: auto-execute (read-only)
 * Tier 1: approval needed (notice level)
 * Tier 2: approval needed (caution level)
 * Tier 3: blocked (handled by tool-bridge BLOCKED_PATTERNS)
 */

const TOOL_TIERS: Record<string, number> = {
	read_file: 0,
	search_files: 0,
	write_file: 1,
	web_search: 1,
	execute_command: 2,
};

export function getToolTier(toolName: string): number {
	return TOOL_TIERS[toolName] ?? 2;
}

export function needsApproval(toolName: string): boolean {
	return getToolTier(toolName) > 0;
}

const TOOL_DESCRIPTIONS: Record<
	string,
	(args: Record<string, unknown>) => string
> = {
	execute_command: (args) => `명령 실행: ${args.command ?? ""}`,
	write_file: (args) => `파일 쓰기: ${args.path ?? ""}`,
	web_search: (args) => `웹 검색: ${args.query ?? ""}`,
	read_file: (args) => `파일 읽기: ${args.path ?? ""}`,
	search_files: (args) => `파일 검색: ${args.pattern ?? ""}`,
};

export function getToolDescription(
	toolName: string,
	args: Record<string, unknown>,
): string {
	const fn = TOOL_DESCRIPTIONS[toolName];
	if (fn) return fn(args);
	return `도구 실행: ${toolName} ${JSON.stringify(args)}`;
}
