/**
 * TDD RED: Verify that all Naia-exclusive built-in skills have bundled
 * skill.json files in agent/assets/default-skills/ for Shell UI visibility.
 *
 * These skill.json files are bootstrapped to ~/.naia/skills/ on first run,
 * allowing Rust list_skills() to discover them for the SkillsTab.
 *
 * The agent's built-in TypeScript handlers remain the primary execution path;
 * skill.json files are metadata-only for Shell/gateway discovery.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Resolve assets/default-skills relative to this test file
const ASSETS_DIR = join(import.meta.dirname, "../../../assets/default-skills");

/**
 * The 13 Naia-exclusive built-in skills that need bundled skill.json files.
 * These are NOT in Rust's hard-coded list and NOT already covered by
 * existing OpenClaw gateway skills.
 *
 * Rust hard-coded (7): time, system_status, memo, weather,
 *   notify_slack, notify_discord, skill_manager
 */
const NAIA_BUILT_IN_SKILLS = [
	{
		dir: "naia-agents",
		name: "skill_agents",
		description: "Manage Gateway agents",
	},
	{
		dir: "naia-approvals",
		name: "skill_approvals",
		description: "Manage Gateway approval rules",
	},
	{
		dir: "naia-botmadang",
		name: "skill_botmadang",
		description: "Connect with the Botmadang AI Agent community",
	},
	{
		dir: "naia-channels",
		name: "skill_channels",
		description: "Manage messaging channels",
	},
	{
		dir: "naia-config",
		name: "skill_config",
		description: "Manage Gateway configuration",
	},
	{
		dir: "naia-cron",
		name: "skill_cron",
		description: "Manage scheduled tasks",
	},
	{
		dir: "naia-device",
		name: "skill_device",
		description: "Manage Gateway nodes and device pairings",
	},
	{
		dir: "naia-diagnostics",
		name: "skill_diagnostics",
		description: "Gateway diagnostics",
	},
	{
		dir: "naia-discord",
		name: "skill_naia_discord",
		description: "Discord 메시지 전송/수신",
	},
	{
		dir: "naia-google-chat",
		name: "skill_notify_google_chat",
		description: "Send a notification message to Google Chat",
	},
	{
		dir: "naia-sessions",
		name: "skill_sessions",
		description: "Manage Gateway sub-agent sessions",
	},
	{
		dir: "naia-tts",
		name: "skill_tts",
		description: "Manage Gateway TTS",
	},
	{
		dir: "naia-voicewake",
		name: "skill_voicewake",
		description: "Manage voice wake triggers",
	},
];

interface SkillManifest {
	name: string;
	description: string;
	type: "gateway" | "command";
	gatewaySkill?: string;
	tier?: number;
	parameters?: Record<string, unknown>;
}

describe("Bundled Naia skill.json files", () => {
	for (const skill of NAIA_BUILT_IN_SKILLS) {
		describe(skill.name, () => {
			const manifestPath = join(ASSETS_DIR, skill.dir, "skill.json");

			it("has a skill.json in assets/default-skills/", () => {
				expect(
					existsSync(manifestPath),
					`Missing: assets/default-skills/${skill.dir}/skill.json`,
				).toBe(true);
			});

			it("has valid JSON with required fields", () => {
				if (!existsSync(manifestPath)) return; // skip if file doesn't exist yet (RED)

				const raw = readFileSync(manifestPath, "utf-8");
				const manifest: SkillManifest = JSON.parse(raw);

				expect(manifest.name).toBeTruthy();
				expect(manifest.description).toBeTruthy();
				expect(manifest.type).toMatch(/^(gateway|command)$/);
			});

			it("name resolves to the correct skill_ prefixed name", () => {
				if (!existsSync(manifestPath)) return;

				const manifest: SkillManifest = JSON.parse(
					readFileSync(manifestPath, "utf-8"),
				);
				const resolvedName = manifest.name.startsWith("skill_")
					? manifest.name
					: `skill_${manifest.name}`;
				expect(resolvedName).toBe(skill.name);
			});

			it("description matches built-in skill", () => {
				if (!existsSync(manifestPath)) return;

				const manifest: SkillManifest = JSON.parse(
					readFileSync(manifestPath, "utf-8"),
				);
				expect(manifest.description).toContain(skill.description);
			});
		});
	}
});

describe("No duplicate registration", () => {
	it("loadCustomSkills gracefully skips already-registered built-in skills", async () => {
		// Dynamic import to get the live skillRegistry
		const { skillRegistry } = await import("../../gateway/tool-bridge.js");

		// Verify all 13 Naia skills are registered (from built-in TypeScript)
		for (const skill of NAIA_BUILT_IN_SKILLS) {
			expect(
				skillRegistry.has(skill.name),
				`${skill.name} should be registered as built-in`,
			).toBe(true);
		}
	});

	it("getAllTools includes Naia built-in skills", async () => {
		const { getAllTools } = await import("../../gateway/tool-bridge.js");
		const tools = getAllTools(true);
		const toolNames = tools.map((t) => t.name);

		for (const skill of NAIA_BUILT_IN_SKILLS) {
			expect(
				toolNames,
				`${skill.name} should be in getAllTools`,
			).toContain(skill.name);
		}
	});

	it("getAllTools respects disabledSkills filter", async () => {
		const { getAllTools } = await import("../../gateway/tool-bridge.js");
		const disabled = ["skill_naia_discord", "skill_tts"];
		const tools = getAllTools(true, disabled);
		const toolNames = tools.map((t) => t.name);

		expect(toolNames).not.toContain("skill_naia_discord");
		expect(toolNames).not.toContain("skill_tts");
		// Other skills still present
		expect(toolNames).toContain("skill_agents");
	});
});
