import type { GatewayClient } from "../gateway/client.js";

/** Result from skill execution */
export interface SkillResult {
	success: boolean;
	output: string;
	error?: string;
}

/** Context passed to skill handlers */
export interface SkillExecutionContext {
	gateway?: GatewayClient;
	/** Send a JSON chunk to the shell (for config_update etc.) */
	writeLine?: (data: unknown) => void;
	/** Current request ID (for addressable chunks) */
	requestId?: string;
	/** Currently disabled skill names */
	disabledSkills?: string[];
}

/** Skill handler function */
export type SkillHandler = (
	args: Record<string, unknown>,
	ctx: SkillExecutionContext,
) => Promise<SkillResult>;

/** Full skill definition */
export interface SkillDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: SkillHandler;
	tier: number;
	requiresGateway: boolean;
	source: string;
}
