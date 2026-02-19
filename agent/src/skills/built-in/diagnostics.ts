import {
	getHealth,
	getGatewayStatus,
	getUsageCost,
	getUsageStatus,
	startLogsTail,
	stopLogsTail,
} from "../../gateway/diagnostics-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createDiagnosticsSkill(): SkillDefinition {
	return {
		name: "skill_diagnostics",
		description:
			"Gateway diagnostics. Actions: health, status, usage_status, usage_cost, logs_start, logs_stop.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"Action: health, status, usage_status, usage_cost, logs_start, logs_stop",
					enum: [
						"health",
						"status",
						"usage_status",
						"usage_cost",
						"logs_start",
						"logs_stop",
					],
				},
			},
			required: ["action"],
		},
		tier: 0,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Diagnostics requires a running Gateway.",
				};
			}

			switch (action) {
				case "health": {
					const result = await getHealth(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "status": {
					const result = await getGatewayStatus(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "usage_status": {
					const result = await getUsageStatus(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "usage_cost": {
					const result = await getUsageCost(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "logs_start": {
					const result = await startLogsTail(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "logs_stop": {
					const result = await stopLogsTail(gateway);
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
