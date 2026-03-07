import * as os from "node:os";
import type { SkillDefinition } from "../types.js";

export function createSystemStatusSkill(): SkillDefinition {
	return {
		name: "skill_system_status",
		description:
			"Get system status: uptime, memory, CPU, OS info. Optionally specify a section.",
		parameters: {
			type: "object",
			properties: {
				section: {
					type: "string",
					description: "Section to return: all (default), memory, cpu, os",
					enum: ["all", "memory", "cpu", "os"],
				},
			},
		},
		tier: 0,
		requiresGateway: false,
		source: "built-in",
		execute: async (args) => {
			const section = (args.section as string) || "all";

			const getMemory = () => {
				const totalMB = Math.round(os.totalmem() / 1024 / 1024);
				const freeMB = Math.round(os.freemem() / 1024 / 1024);
				return { totalMB, freeMB, usedMB: totalMB - freeMB };
			};

			const getCpu = () => {
				const cpus = os.cpus();
				return {
					count: cpus.length,
					model: cpus[0]?.model ?? "unknown",
				};
			};

			const getOs = () => ({
				platform: os.platform(),
				release: os.release(),
				hostname: os.hostname(),
				arch: os.arch(),
			});

			let data: unknown;
			switch (section) {
				case "memory":
					data = getMemory();
					break;
				case "cpu":
					data = getCpu();
					break;
				case "os":
					data = getOs();
					break;
				default:
					data = {
						os: getOs(),
						memory: getMemory(),
						cpus: getCpu(),
						uptime: Math.round(os.uptime()),
					};
					break;
			}

			return { success: true, output: JSON.stringify(data) };
		},
	};
}
