import {
	getSkillsStatus,
	installSkill,
	updateSkillConfig,
} from "../../gateway/skills-proxy.js";
import type { SkillRegistry } from "../registry.js";
import type {
	SkillDefinition,
	SkillExecutionContext,
	SkillResult,
} from "../types.js";

interface SkillInfo {
	name: string;
	description: string;
	tier: number;
	source: string;
	requiresGateway: boolean;
	enabled: boolean;
}

function toSkillInfo(
	skill: SkillDefinition,
	disabledSkills: string[],
): SkillInfo {
	return {
		name: skill.name,
		description: skill.description,
		tier: skill.tier,
		source: skill.source,
		requiresGateway: skill.requiresGateway,
		enabled: !disabledSkills.includes(skill.name),
	};
}

function isBuiltIn(skill: SkillDefinition): boolean {
	return skill.source === "built-in";
}

export function createSkillManagerSkill(
	registry: SkillRegistry,
): SkillDefinition {
	return {
		name: "skill_skill_manager",
		description:
			"MUST use this tool when the user asks about skills, tools, or capabilities. Actions: 'list' shows all available skills with enabled/disabled status, 'search' finds skills by keyword, 'info' gets details about a specific skill, 'enable' activates a disabled skill, 'disable' deactivates a skill, 'gateway_status' shows Gateway skill eligibility, 'install' installs skill dependencies via Gateway, 'update_config' patches skill config on Gateway. Always call this tool instead of guessing skill information.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"Action to perform: list, search, info, enable, disable, gateway_status, install, update_config",
					enum: [
						"list",
						"search",
						"info",
						"enable",
						"disable",
						"gateway_status",
						"install",
						"update_config",
					],
				},
				query: {
					type: "string",
					description:
						"Search keyword (for action: search). Matches skill name and description.",
				},
				skillName: {
					type: "string",
					description:
						"Skill name (for action: info/enable/disable/install/update_config).",
				},
				enabled: {
					type: "boolean",
					description: "Enable/disable flag (for action: update_config).",
				},
			},
			required: ["action"],
		},
		tier: 0,
		requiresGateway: false,
		source: "built-in",
		execute: async (
			args: Record<string, unknown>,
			ctx: SkillExecutionContext,
		): Promise<SkillResult> => {
			const action = args.action as string | undefined;
			if (!action) {
				return {
					success: false,
					output: "",
					error: "action is required",
				};
			}

			const disabledSkills = ctx.disabledSkills ?? [];
			const allSkills = registry.list();

			switch (action) {
				case "list": {
					const skills = allSkills.map((s) => toSkillInfo(s, disabledSkills));
					return {
						success: true,
						output: JSON.stringify({ skills }),
					};
				}

				case "search": {
					const query = args.query as string | undefined;
					if (!query) {
						return {
							success: false,
							output: "",
							error: "query is required for search action",
						};
					}
					const q = query.toLowerCase();
					const results = allSkills
						.filter(
							(s) =>
								s.name.toLowerCase().includes(q) ||
								s.description.toLowerCase().includes(q),
						)
						.map((s) => toSkillInfo(s, disabledSkills));
					return {
						success: true,
						output: JSON.stringify({ results }),
					};
				}

				case "info": {
					const skillName = args.skillName as string | undefined;
					if (!skillName) {
						return {
							success: false,
							output: "",
							error: "skillName is required for info action",
						};
					}
					const skill = registry.get(skillName);
					if (!skill) {
						return {
							success: false,
							output: "",
							error: `Skill not found: ${skillName}`,
						};
					}
					return {
						success: true,
						output: JSON.stringify(toSkillInfo(skill, disabledSkills)),
					};
				}

				case "enable": {
					const skillName = args.skillName as string | undefined;
					if (!skillName) {
						return {
							success: false,
							output: "",
							error: "skillName is required for enable action",
						};
					}
					if (!registry.has(skillName)) {
						return {
							success: false,
							output: "",
							error: `Skill not found: ${skillName}`,
						};
					}
					if (ctx.writeLine && ctx.requestId) {
						ctx.writeLine({
							type: "config_update",
							requestId: ctx.requestId,
							action: "enable_skill",
							skillName,
						});
					}
					return {
						success: true,
						output: `Enabled skill: ${skillName}`,
					};
				}

				case "disable": {
					const skillName = args.skillName as string | undefined;
					if (!skillName) {
						return {
							success: false,
							output: "",
							error: "skillName is required for disable action",
						};
					}
					const skill = registry.get(skillName);
					if (!skill) {
						return {
							success: false,
							output: "",
							error: `Skill not found: ${skillName}`,
						};
					}
					if (isBuiltIn(skill)) {
						return {
							success: false,
							output: "",
							error: `Cannot disable built-in skill: ${skillName}`,
						};
					}
					if (ctx.writeLine && ctx.requestId) {
						ctx.writeLine({
							type: "config_update",
							requestId: ctx.requestId,
							action: "disable_skill",
							skillName,
						});
					}
					return {
						success: true,
						output: `Disabled skill: ${skillName}`,
					};
				}

				case "gateway_status": {
					const gateway = ctx.gateway;
					if (!gateway?.isConnected()) {
						return {
							success: false,
							output: "",
							error:
								"Gateway not connected. gateway_status requires a running Gateway.",
						};
					}
					const result = await getSkillsStatus(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "install": {
					const skillName = args.skillName as string | undefined;
					if (!skillName) {
						return {
							success: false,
							output: "",
							error: "skillName is required for install action",
						};
					}
					const installId = args.installId as string | undefined;
					if (!installId) {
						return {
							success: false,
							output: "",
							error: "installId is required for install action",
						};
					}
					const gateway = ctx.gateway;
					if (!gateway?.isConnected()) {
						return {
							success: false,
							output: "",
							error:
								"Gateway not connected. install requires a running Gateway.",
						};
					}
					const result = await installSkill(gateway, skillName, installId);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "update_config": {
					const skillName = args.skillName as string | undefined;
					if (!skillName) {
						return {
							success: false,
							output: "",
							error: "skillName is required for update_config action",
						};
					}
					const gateway = ctx.gateway;
					if (!gateway?.isConnected()) {
						return {
							success: false,
							output: "",
							error:
								"Gateway not connected. update_config requires a running Gateway.",
						};
					}
					const patch: { enabled?: boolean } = {};
					if (typeof args.enabled === "boolean") {
						patch.enabled = args.enabled;
					}
					const result = await updateSkillConfig(gateway, skillName, patch);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				default:
					return {
						success: false,
						output: "",
						error: `Unknown action: ${action}`,
					};
			}
		},
	};
}
