import {
	getConfig,
	getConfigSchema,
	listModels,
	patchConfig,
	setConfig,
} from "../../gateway/config-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createConfigSkill(): SkillDefinition {
	return {
		name: "skill_config",
		description:
			"Manage Gateway configuration. Actions: get, set, schema, models, patch.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "Action: get, set, schema, models, patch",
					enum: ["get", "set", "schema", "models", "patch"],
				},
				patch: {
					type: "object",
					description:
						"Configuration key-value pairs (for set and patch actions)",
				},
			},
			required: ["action"],
		},
		tier: 1,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Config management requires a running Gateway.",
				};
			}

			switch (action) {
				case "get": {
					const result = await getConfig(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "set": {
					const patch = (args.patch as Record<string, unknown>) ?? {};
					const result = await setConfig(gateway, patch);
					return { success: true, output: JSON.stringify(result) };
				}

				case "schema": {
					const result = await getConfigSchema(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "models": {
					const result = await listModels(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "patch": {
					const patch = (args.patch as Record<string, unknown>) ?? {};
					const result = await patchConfig(gateway, patch);
					return { success: true, output: JSON.stringify(result) };
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
