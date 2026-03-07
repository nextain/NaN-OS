import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type CronJobInfo,
	addCronJob,
	getCronRuns,
	getCronStatus,
	listCronJobs,
	removeCronJob,
	runCronJob,
} from "../cron-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_JOBS: CronJobInfo[] = [
	{
		id: "job-1",
		name: "daily-backup",
		schedule: { type: "cron", expression: "0 3 * * *" },
		enabled: true,
	},
	{
		id: "job-2",
		name: "hourly-check",
		schedule: { type: "every", intervalMs: 3600000 },
		enabled: false,
	},
];

describe("cron-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "cron.list":
						respond.ok({ jobs: MOCK_JOBS });
						break;
					case "cron.status":
						respond.ok({
							enabled: true,
							jobCount: 2,
							nextWake: 1700000000000,
						});
						break;
					case "cron.add":
						respond.ok({
							id: "job-new",
							name: params.name,
							created: true,
						});
						break;
					case "cron.remove":
						if (params.jobId === "job-1") {
							respond.ok({ removed: true, jobId: params.jobId });
						} else {
							respond.error("NOT_FOUND", `Job not found: ${params.jobId}`);
						}
						break;
					case "cron.run":
						respond.ok({
							jobId: params.jobId,
							executed: true,
							result: "ok",
						});
						break;
					case "cron.runs":
						respond.ok({
							jobId: params.jobId,
							runs: [
								{ firedAt: 1700000000000, result: "ok" },
								{ firedAt: 1699999000000, result: "ok" },
							],
						});
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"cron.list",
					"cron.status",
					"cron.add",
					"cron.remove",
					"cron.run",
					"cron.runs",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	describe("listCronJobs", () => {
		it("returns job list", async () => {
			const result = await listCronJobs(client);

			expect(result.jobs).toHaveLength(2);
			expect(result.jobs[0].name).toBe("daily-backup");
			expect(result.jobs[1].enabled).toBe(false);
		});
	});

	describe("getCronStatus", () => {
		it("returns scheduler status", async () => {
			const result = await getCronStatus(client);

			expect(result.enabled).toBe(true);
			expect(result.jobCount).toBe(2);
		});
	});

	describe("addCronJob", () => {
		it("creates a new cron job", async () => {
			const result = await addCronJob(client, {
				name: "test-job",
				schedule: { type: "cron", expression: "0 * * * *" },
			});

			expect(result.created).toBe(true);
			expect(result.name).toBe("test-job");
		});
	});

	describe("removeCronJob", () => {
		it("removes a job", async () => {
			const result = await removeCronJob(client, "job-1");

			expect(result.removed).toBe(true);
		});

		it("throws for unknown job", async () => {
			await expect(removeCronJob(client, "nonexistent")).rejects.toThrow();
		});
	});

	describe("runCronJob", () => {
		it("executes a job manually", async () => {
			const result = await runCronJob(client, "job-1");

			expect(result.executed).toBe(true);
		});
	});

	describe("getCronRuns", () => {
		it("returns run history", async () => {
			const result = await getCronRuns(client, "job-1");

			expect(result.runs).toHaveLength(2);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(listCronJobs(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
