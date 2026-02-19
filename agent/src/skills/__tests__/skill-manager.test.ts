import { describe, expect, it, vi } from "vitest";
import { createSkillManagerSkill } from "../built-in/skill-manager.js";
import { SkillRegistry } from "../registry.js";
import type { SkillDefinition, SkillExecutionContext } from "../types.js";

function makeSkill(overrides: Partial<SkillDefinition>): SkillDefinition {
	return {
		name: overrides.name ?? "skill_test",
		description: overrides.description ?? "A test skill",
		parameters: overrides.parameters ?? { type: "object", properties: {} },
		tier: overrides.tier ?? 0,
		requiresGateway: overrides.requiresGateway ?? false,
		source: overrides.source ?? "built-in",
		execute: overrides.execute ?? (async () => ({ success: true, output: "ok" })),
	};
}

function buildRegistry(): SkillRegistry {
	const registry = new SkillRegistry();
	registry.register(makeSkill({ name: "skill_time", description: "Get current time", source: "built-in" }));
	registry.register(makeSkill({ name: "skill_memo", description: "Save and read memos", source: "built-in" }));
	registry.register(
		makeSkill({
			name: "skill_code_review",
			description: "Review code changes",
			tier: 2,
			requiresGateway: true,
			source: "/home/user/.cafelua/skills/code-review/skill.json",
		}),
	);
	registry.register(
		makeSkill({
			name: "skill_web_search",
			description: "Search the web for information",
			tier: 1,
			requiresGateway: true,
			source: "/home/user/.cafelua/skills/web-search/skill.json",
		}),
	);
	return registry;
}

function makeCtx(overrides?: Partial<SkillExecutionContext>): SkillExecutionContext {
	return {
		writeLine: overrides?.writeLine ?? vi.fn(),
		requestId: overrides?.requestId ?? "req-123",
		disabledSkills: overrides?.disabledSkills ?? [],
		...overrides,
	};
}

describe("skill_skill_manager", () => {
	const registry = buildRegistry();
	const skill = createSkillManagerSkill(registry);

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_skill_manager");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	describe("action: list", () => {
		it("returns all skills with enabled/disabled status", async () => {
			const ctx = makeCtx({ disabledSkills: ["skill_code_review"] });
			const result = await skill.execute({ action: "list" }, ctx);
			expect(result.success).toBe(true);

			const parsed = JSON.parse(result.output);
			expect(parsed.skills).toHaveLength(4);

			const codeReview = parsed.skills.find((s: { name: string }) => s.name === "skill_code_review");
			expect(codeReview.enabled).toBe(false);

			const time = parsed.skills.find((s: { name: string }) => s.name === "skill_time");
			expect(time.enabled).toBe(true);
		});

		it("includes skill_skill_manager itself in list (5 total)", async () => {
			// The manager skill itself is also registered
			const fullRegistry = buildRegistry();
			fullRegistry.register(createSkillManagerSkill(fullRegistry));
			const managerSkill = fullRegistry.get("skill_skill_manager")!;

			const ctx = makeCtx();
			const result = await managerSkill.execute({ action: "list" }, ctx);
			const parsed = JSON.parse(result.output);
			expect(parsed.skills).toHaveLength(5);
		});
	});

	describe("action: search", () => {
		it("finds skills by name keyword", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "search", query: "code" }, ctx);
			expect(result.success).toBe(true);

			const parsed = JSON.parse(result.output);
			expect(parsed.results.length).toBe(1);
			expect(parsed.results[0].name).toBe("skill_code_review");
		});

		it("finds skills by description keyword", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "search", query: "memo" }, ctx);
			expect(result.success).toBe(true);

			const parsed = JSON.parse(result.output);
			expect(parsed.results.length).toBe(1);
			expect(parsed.results[0].name).toBe("skill_memo");
		});

		it("returns empty for no match", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "search", query: "zzz_nonexistent" }, ctx);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.results).toHaveLength(0);
		});

		it("fails without query", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "search" }, ctx);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/query/i);
		});
	});

	describe("action: info", () => {
		it("returns detailed info for a skill", async () => {
			const ctx = makeCtx({ disabledSkills: ["skill_code_review"] });
			const result = await skill.execute({ action: "info", skillName: "skill_code_review" }, ctx);
			expect(result.success).toBe(true);

			const parsed = JSON.parse(result.output);
			expect(parsed.name).toBe("skill_code_review");
			expect(parsed.description).toBe("Review code changes");
			expect(parsed.tier).toBe(2);
			expect(parsed.requiresGateway).toBe(true);
			expect(parsed.enabled).toBe(false);
		});

		it("fails for unknown skill", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "info", skillName: "skill_nonexistent" }, ctx);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not found/i);
		});

		it("fails without skillName", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "info" }, ctx);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/skillName/i);
		});
	});

	describe("action: enable", () => {
		it("sends config_update to enable a disabled skill", async () => {
			const writeLine = vi.fn();
			const ctx = makeCtx({ writeLine, disabledSkills: ["skill_code_review"] });
			const result = await skill.execute(
				{ action: "enable", skillName: "skill_code_review" },
				ctx,
			);
			expect(result.success).toBe(true);
			expect(writeLine).toHaveBeenCalledWith({
				type: "config_update",
				requestId: "req-123",
				action: "enable_skill",
				skillName: "skill_code_review",
			});
		});

		it("succeeds even if skill is already enabled", async () => {
			const writeLine = vi.fn();
			const ctx = makeCtx({ writeLine, disabledSkills: [] });
			const result = await skill.execute(
				{ action: "enable", skillName: "skill_time" },
				ctx,
			);
			expect(result.success).toBe(true);
		});

		it("fails for unknown skill", async () => {
			const ctx = makeCtx();
			const result = await skill.execute(
				{ action: "enable", skillName: "skill_nonexistent" },
				ctx,
			);
			expect(result.success).toBe(false);
		});

		it("rejects disabling built-in skills", async () => {
			const ctx = makeCtx();
			const result = await skill.execute(
				{ action: "disable", skillName: "skill_time" },
				ctx,
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/built-in/i);
		});
	});

	describe("action: disable", () => {
		it("sends config_update to disable a skill", async () => {
			const writeLine = vi.fn();
			const ctx = makeCtx({ writeLine, disabledSkills: [] });
			const result = await skill.execute(
				{ action: "disable", skillName: "skill_code_review" },
				ctx,
			);
			expect(result.success).toBe(true);
			expect(writeLine).toHaveBeenCalledWith({
				type: "config_update",
				requestId: "req-123",
				action: "disable_skill",
				skillName: "skill_code_review",
			});
		});

		it("succeeds even if already disabled", async () => {
			const writeLine = vi.fn();
			const ctx = makeCtx({ writeLine, disabledSkills: ["skill_code_review"] });
			const result = await skill.execute(
				{ action: "disable", skillName: "skill_code_review" },
				ctx,
			);
			expect(result.success).toBe(true);
		});
	});

	describe("invalid action", () => {
		it("fails with unknown action", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({ action: "delete" }, ctx);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/unknown action/i);
		});

		it("fails without action", async () => {
			const ctx = makeCtx();
			const result = await skill.execute({}, ctx);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/action.*required/i);
		});
	});
});
