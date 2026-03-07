import type { ToolDefinition } from "../providers/types.js";
import type {
	SkillDefinition,
	SkillExecutionContext,
	SkillResult,
} from "./types.js";

export class SkillRegistry {
	private skills = new Map<string, SkillDefinition>();

	register(skill: SkillDefinition): void {
		if (!skill.name.startsWith("skill_")) {
			throw new Error(`Skill name "${skill.name}" must have skill_ prefix`);
		}
		if (this.skills.has(skill.name)) {
			throw new Error(`Skill "${skill.name}" is already registered`);
		}
		this.skills.set(skill.name, skill);
	}

	get(name: string): SkillDefinition | undefined {
		return this.skills.get(name);
	}

	has(name: string): boolean {
		return this.skills.has(name);
	}

	list(): SkillDefinition[] {
		return [...this.skills.values()];
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		ctx: SkillExecutionContext,
	): Promise<SkillResult> {
		const skill = this.skills.get(name);
		if (!skill) {
			return {
				success: false,
				output: "",
				error: `Unknown skill: ${name}`,
			};
		}
		try {
			return await skill.execute(args, ctx);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	toToolDefinitions(hasGateway: boolean): ToolDefinition[] {
		const result: ToolDefinition[] = [];
		for (const skill of this.skills.values()) {
			if (skill.requiresGateway && !hasGateway) continue;
			result.push({
				name: skill.name,
				description: skill.description,
				parameters: skill.parameters,
			});
		}
		return result;
	}
}
