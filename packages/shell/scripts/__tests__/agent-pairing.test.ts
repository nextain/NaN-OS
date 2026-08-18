import { describe, expect, it } from "vitest";
import { parseGitWorktreePaths } from "../agent-pairing.mjs";

describe("parseGitWorktreePaths", () => {
	it("discovers registered worktrees outside the conventional worktree directory", () => {
		const porcelain = [
			"worktree D:/alpha-adk/projects/naia-agent",
			"HEAD c19f166cf655d7375b9a37bb6d2cd70fd008a7e7",
			"branch refs/heads/main",
			"",
			"worktree D:/alpha-adk/projects/naia-agent-voxcpm2-e2e-196fc64",
			"HEAD 196fc64cc01e852bd27dc88675d53f5995f228dd",
			"detached",
			"",
		].join("\n");

		expect(parseGitWorktreePaths(porcelain)).toEqual([
			"D:/alpha-adk/projects/naia-agent",
			"D:/alpha-adk/projects/naia-agent-voxcpm2-e2e-196fc64",
		]);
	});

	it("returns no candidates for a failed or empty git query", () => {
		expect(parseGitWorktreePaths(null)).toEqual([]);
		expect(parseGitWorktreePaths("")).toEqual([]);
	});
});
