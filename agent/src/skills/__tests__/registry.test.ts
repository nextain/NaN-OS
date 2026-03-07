import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../registry.js";
import type { SkillDefinition, SkillResult } from "../types.js";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
	return {
		name: overrides.name ?? "skill_test",
		description: overrides.description ?? "A test skill",
		parameters: overrides.parameters ?? {
			type: "object",
			properties: {},
		},
		execute:
			overrides.execute ?? (async () => ({ success: true, output: "ok" })),
		tier: overrides.tier ?? 0,
		requiresGateway: overrides.requiresGateway ?? false,
		source: overrides.source ?? "built-in",
	};
}

describe("SkillRegistry", () => {
	it("registers and retrieves a skill", () => {
		const registry = new SkillRegistry();
		const skill = makeSkill();
		registry.register(skill);
		expect(registry.get("skill_test")).toBe(skill);
	});

	it("has() returns true for registered skills", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill());
		expect(registry.has("skill_test")).toBe(true);
		expect(registry.has("skill_nonexistent")).toBe(false);
	});

	it("list() returns all registered skills", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_a" }));
		registry.register(makeSkill({ name: "skill_b" }));
		const names = registry.list().map((s) => s.name);
		expect(names).toEqual(["skill_a", "skill_b"]);
	});

	it("execute() calls the skill handler and returns result", async () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				execute: async (args) => ({
					success: true,
					output: `hello ${args.name}`,
				}),
			}),
		);
		const result = await registry.execute("skill_test", { name: "world" }, {});
		expect(result.success).toBe(true);
		expect(result.output).toBe("hello world");
	});

	it("execute() returns error for unknown skill", async () => {
		const registry = new SkillRegistry();
		const result = await registry.execute("skill_unknown", {}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown skill");
	});

	it("execute() catches handler errors", async () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				execute: async () => {
					throw new Error("boom");
				},
			}),
		);
		const result = await registry.execute("skill_test", {}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("boom");
	});

	it("toToolDefinitions() converts skills to ToolDefinitions", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_time" }));
		const tools = registry.toToolDefinitions(true);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("skill_time");
		expect(tools[0].description).toBeDefined();
		expect(tools[0].parameters).toBeDefined();
	});

	it("toToolDefinitions() filters out gateway skills when hasGateway=false", () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({ name: "skill_local", requiresGateway: false }),
		);
		registry.register(
			makeSkill({ name: "skill_remote", requiresGateway: true }),
		);

		const withGateway = registry.toToolDefinitions(true);
		expect(withGateway).toHaveLength(2);

		const withoutGateway = registry.toToolDefinitions(false);
		expect(withoutGateway).toHaveLength(1);
		expect(withoutGateway[0].name).toBe("skill_local");
	});

	it("register() rejects names without skill_ prefix", () => {
		const registry = new SkillRegistry();
		expect(() => registry.register(makeSkill({ name: "bad_name" }))).toThrow(
			/skill_ prefix/,
		);
	});

	it("register() rejects duplicate names", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_dup" }));
		expect(() => registry.register(makeSkill({ name: "skill_dup" }))).toThrow(
			/already registered/,
		);
	});
});
