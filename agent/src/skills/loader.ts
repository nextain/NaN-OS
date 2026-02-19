import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillRegistry } from "./registry.js";
import type { SkillDefinition, SkillExecutionContext, SkillResult } from "./types.js";

interface SkillManifest {
	name: string;
	description: string;
	type: "gateway" | "command";
	gatewaySkill?: string;
	command?: string;
	tier?: number;
	parameters?: Record<string, unknown>;
}

function makeCommandHandler(
	command: string,
): (args: Record<string, unknown>, ctx: SkillExecutionContext) => Promise<SkillResult> {
	return async (_args, ctx) => {
		if (!ctx.gateway) {
			return {
				success: false,
				output: "",
				error: "Gateway connection required for command execution",
			};
		}
		try {
			const payload = await ctx.gateway.request("exec.bash", { command });
			const rec = payload as Record<string, unknown> | null;
			const stdout =
				(rec && typeof rec.stdout === "string" ? rec.stdout : "") ||
				(rec && typeof rec.output === "string" ? rec.output : "");
			const exitCode =
				rec && typeof rec.exitCode === "number" ? rec.exitCode : 0;
			return {
				success: exitCode === 0,
				output: stdout,
				error: exitCode !== 0 ? String(rec?.stderr ?? "") : undefined,
			};
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	};
}

function makeGatewayHandler(
	gatewaySkill: string,
): (args: Record<string, unknown>, ctx: SkillExecutionContext) => Promise<SkillResult> {
	return async (args, ctx) => {
		if (!ctx.gateway) {
			return {
				success: false,
				output: "",
				error: "Gateway connection required",
			};
		}
		try {
			const payload = await ctx.gateway.request("skills.invoke", {
				skill: gatewaySkill,
				args,
			});
			return {
				success: true,
				output:
					typeof payload === "string"
						? payload
						: JSON.stringify(payload),
			};
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	};
}

export function loadCustomSkills(
	registry: SkillRegistry,
	skillsDir: string,
): void {
	if (!fs.existsSync(skillsDir)) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(skillsDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const manifestPath = path.join(skillsDir, entry.name, "skill.json");
		if (!fs.existsSync(manifestPath)) continue;

		let manifest: SkillManifest;
		try {
			manifest = JSON.parse(
				fs.readFileSync(manifestPath, "utf-8"),
			) as SkillManifest;
		} catch {
			continue;
		}

		if (!manifest.name || !manifest.description || !manifest.type) continue;
		if (manifest.type !== "gateway" && manifest.type !== "command") continue;

		const name = manifest.name.startsWith("skill_")
			? manifest.name
			: `skill_${manifest.name}`;

		const isGateway = manifest.type === "gateway";
		const handler = isGateway
			? makeGatewayHandler(manifest.gatewaySkill ?? manifest.name)
			: makeCommandHandler(manifest.command ?? "echo no command");

		const skill: SkillDefinition = {
			name,
			description: manifest.description,
			parameters: manifest.parameters ?? {
				type: "object",
				properties: {},
			},
			execute: handler,
			tier: manifest.tier ?? 2,
			requiresGateway: isGateway,
			source: path.join(skillsDir, entry.name),
		};

		try {
			registry.register(skill);
		} catch {
			// Skip duplicates or invalid names
		}
	}
}
