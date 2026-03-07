import type { GatewayClient } from "./client.js";

/** Cron job info from Gateway */
export interface CronJobInfo {
	id: string;
	name: string;
	schedule: {
		type: string;
		expression?: string;
		intervalMs?: number;
		date?: string;
	};
	enabled: boolean;
	[key: string]: unknown;
}

/** Result from cron.list */
export interface CronListResult {
	jobs: CronJobInfo[];
}

/** Result from cron.status */
export interface CronStatusResult {
	enabled: boolean;
	jobCount: number;
	nextWake?: number;
}

/** List all cron jobs on Gateway */
export async function listCronJobs(
	client: GatewayClient,
): Promise<CronListResult> {
	const payload = await client.request("cron.list", {});
	return payload as CronListResult;
}

/** Get cron scheduler status from Gateway */
export async function getCronStatus(
	client: GatewayClient,
): Promise<CronStatusResult> {
	const payload = await client.request("cron.status", {});
	return payload as CronStatusResult;
}

/** Add a new cron job on Gateway */
export async function addCronJob(
	client: GatewayClient,
	params: {
		name: string;
		schedule: {
			type: string;
			expression?: string;
			intervalMs?: number;
			date?: string;
		};
		payload?: Record<string, unknown>;
	},
): Promise<{ id: string; name: string; created: boolean }> {
	const payload = await client.request("cron.add", params);
	return payload as { id: string; name: string; created: boolean };
}

/** Remove a cron job from Gateway */
export async function removeCronJob(
	client: GatewayClient,
	jobId: string,
): Promise<{ removed: boolean; jobId: string }> {
	const payload = await client.request("cron.remove", { jobId });
	return payload as { removed: boolean; jobId: string };
}

/** Run a cron job manually on Gateway */
export async function runCronJob(
	client: GatewayClient,
	jobId: string,
	mode?: string,
): Promise<{ jobId: string; executed: boolean; result?: string }> {
	const payload = await client.request("cron.run", { jobId, mode });
	return payload as { jobId: string; executed: boolean; result?: string };
}

/** Get run history for a cron job from Gateway */
export async function getCronRuns(
	client: GatewayClient,
	jobId: string,
	limit?: number,
): Promise<{
	jobId: string;
	runs: Array<{ firedAt: number; result: string }>;
}> {
	const payload = await client.request("cron.runs", { jobId, limit });
	return payload as {
		jobId: string;
		runs: Array<{ firedAt: number; result: string }>;
	};
}
