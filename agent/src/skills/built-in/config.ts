import { MODEL_PRICING } from "../../providers/cost.js";
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
		requiresGateway: false,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (action !== "models" && !gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Config management requires a running Gateway.",
				};
			}

			switch (action) {
				case "get": {
					const result = await getConfig(gateway!);
					return { success: true, output: JSON.stringify(result) };
				}

				case "set": {
					const patch = args.patch as
						| Record<string, unknown>
						| undefined;
					if (!patch || Object.keys(patch).length === 0) {
						return {
							success: false,
							output: "",
							error: "patch is required for set action",
						};
					}
					const result = await setConfig(gateway!, patch);
					return { success: true, output: JSON.stringify(result) };
				}

				case "schema": {
					const result = await getConfigSchema(gateway!);
					return { success: true, output: JSON.stringify(result) };
				}

				case "models": {
					const localModels = [
						{ id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "gemini" },
						{ id: "gemini-3-flash", name: "Gemini 3 Flash", provider: "gemini" },
						{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
						{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
						{ id: "gpt-4o", name: "GPT-4o", provider: "openai" },
						{ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
						{ id: "o3-mini", name: "o3 Mini", provider: "openai" },
						{ id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic" },
						{ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic" },
						{ id: "claude-3-7-sonnet-20250219", name: "Claude Sonnet 3.7", provider: "anthropic" },
						{ id: "grok-4", name: "Grok 4", provider: "xai" },
						{ id: "grok-4-fast-reasoning", name: "Grok 4 Fast", provider: "xai" },
						{ id: "grok-3-mini", name: "Grok 3 Mini", provider: "xai" },
						{ id: "grok-3", name: "Grok 3", provider: "xai" },
						{ id: "glm-4.7", name: "GLM 4.7", provider: "zai" },
						{ id: "glm-4-plus", name: "GLM 4 Plus", provider: "zai" },
						{ id: "deepseek-r1:8b", name: "DeepSeek R1 (8B)", provider: "ollama" },
						{ id: "gpt-oss:20b", name: "GPT-OSS (20B)", provider: "ollama" },
						{ id: "llama3.2", name: "Llama 3.2", provider: "ollama" }
					].map(m => {
						const price = MODEL_PRICING[m.id];
						return price ? { ...m, price } : m;
					});

					let gatewayModels: any[] = [];
					if (gateway?.isConnected()) {
						try {
							const res = await listModels(gateway);
							gatewayModels = res.models || [];
						} catch {
							// Ignore if gateway fails to list models
						}
					}

					// Merge, preferring gateway models if IDs conflict
					const merged = [...gatewayModels];
					for (const lm of localModels) {
						if (!merged.find(m => m.id === lm.id)) {
							merged.push(lm);
						}
					}

					return { success: true, output: JSON.stringify({ models: merged }) };
				}

				case "patch": {
					const patch =
						(args.patch as Record<string, unknown>) ?? {};
					const result = await patchConfig(gateway!, patch);
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
