import {
	getApprovalRules,
	resolveApproval,
	setApprovalRules,
} from "../../gateway/approvals-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createApprovalsSkill(): SkillDefinition {
	return {
		name: "skill_approvals",
		description:
			"Manage Gateway approval rules. Actions: get_rules, set_rules, resolve.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "Action: get_rules, set_rules, resolve",
					enum: ["get_rules", "set_rules", "resolve"],
				},
				allowedTools: {
					type: "array",
					description: "List of allowed tool names (for set_rules)",
					items: { type: "string" },
				},
				blockedPatterns: {
					type: "array",
					description: "List of blocked patterns (for set_rules)",
					items: { type: "string" },
				},
				requestId: {
					type: "string",
					description: "Approval request ID (for resolve)",
				},
				decision: {
					type: "string",
					description: "Decision: approve or reject (for resolve)",
					enum: ["approve", "reject"],
				},
			},
			required: ["action"],
		},
		tier: 2,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Approval management requires a running Gateway.",
				};
			}

			switch (action) {
				case "get_rules": {
					const result = await getApprovalRules(gateway);
					return { success: true, output: JSON.stringify(result) };
				}

				case "set_rules": {
					const allowedTools = args.allowedTools as string[] | undefined;
					const blockedPatterns = args.blockedPatterns as
						| string[]
						| undefined;
					const result = await setApprovalRules(gateway, {
						allowedTools,
						blockedPatterns,
					});
					return { success: true, output: JSON.stringify(result) };
				}

				case "resolve": {
					const requestId = args.requestId as string;
					const decision = args.decision as "approve" | "reject";
					if (!requestId) {
						return {
							success: false,
							output: "",
							error: "requestId is required for resolve action",
						};
					}
					if (!decision) {
						return {
							success: false,
							output: "",
							error: "decision is required for resolve action",
						};
					}
					const result = await resolveApproval(
						gateway,
						requestId,
						decision,
					);
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
