/**
 * Paired-agent checkout cleanliness must ignore request-contract runtime
 * crash-recovery leases (.agents/session-contracts/.recovery/) so a lease
 * dropped by a concurrent tool call cannot demote the correctly-paired main
 * checkout and select a build-broken sibling worktree. Regression guard for the
 * dev/bundle agent-build selection.
 */
import { describe, expect, it } from "vitest";
import { isCleanPorcelainIgnoringRecovery } from "../stage-runtime.mjs";

describe("isCleanPorcelainIgnoringRecovery", () => {
	it("treats an empty porcelain as clean", () => {
		expect(isCleanPorcelainIgnoringRecovery("")).toBe(true);
	});

	it("ignores an untracked .recovery lease dir (forward and back slashes)", () => {
		expect(
			isCleanPorcelainIgnoringRecovery(
				"?? .agents/session-contracts/.recovery/",
			),
		).toBe(true);
		expect(
			isCleanPorcelainIgnoringRecovery(
				"?? .agents/session-contracts/.recovery/leases/x.json",
			),
		).toBe(true);
		expect(
			isCleanPorcelainIgnoringRecovery(
				"?? .agents\\session-contracts\\.recovery\\leases\\x.json",
			),
		).toBe(true);
	});

	it("stays dirty when a real change accompanies the recovery dir", () => {
		expect(
			isCleanPorcelainIgnoringRecovery(
				"?? .agents/session-contracts/.recovery/\n M src/main/composition/index.ts",
			),
		).toBe(false);
	});

	it("stays dirty for any real tracked/untracked change", () => {
		expect(isCleanPorcelainIgnoringRecovery(" M src/foo.ts")).toBe(false);
		expect(isCleanPorcelainIgnoringRecovery("?? newfile.ts")).toBe(false);
	});

	it("treats a git failure (null) as not clean", () => {
		expect(isCleanPorcelainIgnoringRecovery(null)).toBe(false);
	});
});
