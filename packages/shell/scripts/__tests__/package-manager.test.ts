import { describe, expect, it } from "vitest";
import { resolvePnpmInvocation } from "../package-manager.mjs";

describe("project package-manager resolution", () => {
	it("uses ambient pnpm only when the project has no declaration", () => {
		expect(resolvePnpmInvocation(undefined)).toEqual({ command: "pnpm", prefixArgs: [] });
	});

	it("pins a declared pnpm version through Corepack", () => {
		expect(resolvePnpmInvocation("pnpm@10.33.0")).toEqual({
			command: "corepack",
			prefixArgs: ["pnpm@10.33.0"],
		});
	});

	it.each(["npm@11.0.0", "pnpm@latest", "pnpm@10", "pnpm@10.33.0;calc"])(
		"rejects an unsupported or unsafe declaration: %s",
		(packageManager) => {
			expect(() => resolvePnpmInvocation(packageManager)).toThrow("unsupported packageManager");
		},
	);
});
