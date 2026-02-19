import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCustomSkills } from "../loader.js";
import { SkillRegistry } from "../registry.js";

const SKILLS_DIR = path.join(os.homedir(), ".cafelua", "skills");

/** All 51 OpenClaw built-in skill names */
const EXPECTED_SKILLS = [
	"1password",
	"apple-notes",
	"apple-reminders",
	"bear-notes",
	"blogwatcher",
	"blucli",
	"bluebubbles",
	"camsnap",
	"canvas",
	"clawhub",
	"coding-agent",
	"discord",
	"eightctl",
	"food-order",
	"gemini",
	"gifgrep",
	"github",
	"gog",
	"goplaces",
	"healthcheck",
	"himalaya",
	"imsg",
	"mcporter",
	"model-usage",
	"nano-banana-pro",
	"nano-pdf",
	"notion",
	"obsidian",
	"openai-image-gen",
	"openai-whisper",
	"openai-whisper-api",
	"openhue",
	"oracle",
	"ordercli",
	"peekaboo",
	"sag",
	"session-logs",
	"sherpa-onnx-tts",
	"skill-creator",
	"slack",
	"songsee",
	"sonoscli",
	"spotify-player",
	"summarize",
	"things-mac",
	"tmux",
	"trello",
	"video-frames",
	"voice-call",
	"wacli",
	"weather",
];

describe("bulk skill migration (51 OpenClaw skills)", () => {
	let registry: SkillRegistry;

	beforeAll(() => {
		registry = new SkillRegistry();
		loadCustomSkills(registry, SKILLS_DIR);
	});

	it("loads all 51 custom skills", () => {
		const loaded = registry.list();
		expect(loaded.length).toBeGreaterThanOrEqual(EXPECTED_SKILLS.length);
	});

	it("each expected skill is registered with skill_ prefix", () => {
		for (const name of EXPECTED_SKILLS) {
			// Loader uses manifest name as-is with skill_ prefix (hyphens preserved)
			const skillName = `skill_${name}`;
			expect(
				registry.has(skillName),
				`Missing skill: ${skillName}`,
			).toBe(true);
		}
	});

	it("all custom skills are gateway-dependent", () => {
		for (const skill of registry.list()) {
			expect(skill.requiresGateway).toBe(true);
		}
	});

	it("all custom skills have valid tier (0-3)", () => {
		for (const skill of registry.list()) {
			expect(skill.tier).toBeGreaterThanOrEqual(0);
			expect(skill.tier).toBeLessThanOrEqual(3);
		}
	});

	it("all custom skills have description", () => {
		for (const skill of registry.list()) {
			expect(skill.description.length).toBeGreaterThan(0);
		}
	});

	it("all custom skills have parameters object", () => {
		for (const skill of registry.list()) {
			expect(skill.parameters).toBeDefined();
			expect(typeof skill.parameters).toBe("object");
		}
	});

	it("generates valid LLM tool definitions", () => {
		const tools = registry.toToolDefinitions(true);
		expect(tools.length).toBeGreaterThanOrEqual(EXPECTED_SKILLS.length);
		for (const tool of tools) {
			expect(tool.name).toMatch(/^skill_/);
			expect(tool.description.length).toBeGreaterThan(0);
		}
	});

	it("each manifest file exists on disk", () => {
		for (const name of EXPECTED_SKILLS) {
			const manifestPath = path.join(SKILLS_DIR, name, "skill.json");
			expect(
				fs.existsSync(manifestPath),
				`Missing manifest: ${manifestPath}`,
			).toBe(true);
		}
	});

	/** Key skills that should have specific parameter schemas (not generic "input") */
	const KEY_SKILLS_WITH_SCHEMA = [
		"weather",
		"github",
		"slack",
		"discord",
		"healthcheck",
		"session-logs",
		"notion",
		"obsidian",
		"coding-agent",
		"gemini",
	];

	it("key skills have specific parameter descriptions (not generic)", () => {
		for (const name of KEY_SKILLS_WITH_SCHEMA) {
			const manifestPath = path.join(SKILLS_DIR, name, "skill.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			const props = manifest.parameters?.properties ?? {};
			for (const [key, val] of Object.entries(props)) {
				const desc = (val as Record<string, unknown>).description as string;
				expect(
					desc,
					`${name}.${key} has no description`,
				).toBeDefined();
				expect(
					desc?.startsWith("Input for the "),
					`${name}.${key} still has generic description: "${desc}"`,
				).toBe(false);
			}
		}
	});

	it("key skills have at least one required or described parameter", () => {
		for (const name of KEY_SKILLS_WITH_SCHEMA) {
			const manifestPath = path.join(SKILLS_DIR, name, "skill.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			const props = manifest.parameters?.properties ?? {};
			expect(
				Object.keys(props).length,
				`${name} has no parameters defined`,
			).toBeGreaterThan(0);
		}
	});
});
