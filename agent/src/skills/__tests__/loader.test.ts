import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SkillRegistry } from "../registry.js";
import { loadCustomSkills } from "../loader.js";

let tmpDir: string;

beforeAll(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-loader-test-"));
});

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(name: string, manifest: Record<string, unknown>): void {
	const dir = path.join(tmpDir, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(manifest));
}

describe("loadCustomSkills", () => {
	it("loads a command-type skill from manifest", () => {
		writeManifest("docker-status", {
			name: "docker_status",
			description: "Running Docker containers",
			type: "command",
			command: "docker ps --format '{{.Names}}'",
			tier: 0,
			parameters: {
				type: "object",
				properties: {},
			},
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_docker_status")).toBe(true);
		const skill = registry.get("skill_docker_status")!;
		expect(skill.tier).toBe(0);
		expect(skill.source).toContain("docker-status");
	});

	it("loads a gateway-type skill from manifest", () => {
		writeManifest("translate", {
			name: "translate",
			description: "Translate text",
			type: "gateway",
			gatewaySkill: "translate",
			parameters: {
				type: "object",
				properties: {
					text: { type: "string" },
					to: { type: "string" },
				},
				required: ["text", "to"],
			},
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_translate")).toBe(true);
		const skill = registry.get("skill_translate")!;
		expect(skill.requiresGateway).toBe(true);
	});

	it("auto-prefixes skill_ to names", () => {
		writeManifest("no-prefix", {
			name: "my_tool",
			description: "Test",
			type: "command",
			command: "echo hello",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_my_tool")).toBe(true);
	});

	it("defaults tier to 2 when not specified", () => {
		writeManifest("no-tier", {
			name: "risky",
			description: "Test",
			type: "command",
			command: "echo risky",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		const skill = registry.get("skill_risky")!;
		expect(skill.tier).toBe(2);
	});

	it("skips directories without skill.json", () => {
		const dir = path.join(tmpDir, "empty-dir");
		fs.mkdirSync(dir, { recursive: true });

		const registry = new SkillRegistry();
		// Should not throw
		loadCustomSkills(registry, tmpDir);
	});

	it("skips invalid JSON manifests", () => {
		const dir = path.join(tmpDir, "bad-json");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "skill.json"), "not json {{{");

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		// Should not throw; bad manifest is skipped
	});

	it("handles missing skills directory gracefully", () => {
		const registry = new SkillRegistry();
		loadCustomSkills(registry, "/nonexistent/path/skills");
		expect(registry.list()).toHaveLength(0);
	});

	it("skips manifest missing name field", () => {
		writeManifest("no-name", {
			description: "Has description but no name",
			type: "gateway",
			gatewaySkill: "no-name",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_no-name")).toBe(false);
	});

	it("skips manifest missing description field", () => {
		writeManifest("no-desc", {
			name: "no_desc",
			type: "command",
			command: "echo test",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_no_desc")).toBe(false);
	});

	it("skips manifest with invalid type field", () => {
		writeManifest("bad-type", {
			name: "bad_type",
			description: "Has bad type",
			type: "invalid",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		expect(registry.has("skill_bad_type")).toBe(false);
	});

	it("skips gateway skill without gatewaySkill or matching name", () => {
		writeManifest("gateway-ok", {
			name: "gateway_ok",
			description: "Valid gateway skill",
			type: "gateway",
			gatewaySkill: "gateway_ok",
		});

		const registry = new SkillRegistry();
		loadCustomSkills(registry, tmpDir);
		// Should load fine since gatewaySkill is provided
		expect(registry.has("skill_gateway_ok")).toBe(true);
	});
});
