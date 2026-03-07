import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronStore } from "../../cron/store.js";
import { createCronSkill } from "../built-in/cron.js";

describe("skill_cron", () => {
	let tmpDir: string;
	let store: CronStore;
	let skill: ReturnType<typeof createCronSkill>;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-skill-"));
		store = new CronStore(path.join(tmpDir, "cron-jobs.json"));
		skill = createCronSkill(store);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_cron");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("adds a one-shot cron job", async () => {
		const result = await skill.execute(
			{
				action: "add",
				label: "테스트 알림",
				task: "5초 후에 알림 보내",
				schedule_type: "at",
				schedule_value: "2026-02-20T09:00:00+09:00",
			},
			{},
		);

		expect(result.success).toBe(true);
		expect(result.output).toContain("테스트 알림");
		expect(store.list()).toHaveLength(1);
	});

	it("adds a recurring interval job", async () => {
		const result = await skill.execute(
			{
				action: "add",
				label: "매시간 체크",
				task: "상태 확인",
				schedule_type: "every",
				schedule_value: "3600000",
			},
			{},
		);

		expect(result.success).toBe(true);
		expect(store.list()).toHaveLength(1);
		expect(store.list()[0].schedule).toEqual({
			type: "every",
			intervalMs: 3600000,
		});
	});

	it("adds a cron expression job", async () => {
		const result = await skill.execute(
			{
				action: "add",
				label: "매일 아침",
				task: "날씨 알려줘",
				schedule_type: "cron",
				schedule_value: "0 9 * * *",
			},
			{},
		);

		expect(result.success).toBe(true);
		expect(store.list()[0].schedule).toEqual({
			type: "cron",
			expression: "0 9 * * *",
		});
	});

	it("lists cron jobs", async () => {
		store.add({
			label: "job1",
			task: "task1",
			schedule: { type: "every", intervalMs: 5000 },
		});
		store.add({
			label: "job2",
			task: "task2",
			schedule: { type: "at", date: "2026-03-01T00:00:00Z" },
		});

		const result = await skill.execute({ action: "list" }, {});
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed).toHaveLength(2);
	});

	it("removes a cron job", async () => {
		const job = store.add({
			label: "to delete",
			task: "bye",
			schedule: { type: "every", intervalMs: 1000 },
		});

		const result = await skill.execute(
			{ action: "remove", job_id: job.id },
			{},
		);

		expect(result.success).toBe(true);
		expect(store.list()).toHaveLength(0);
	});

	it("returns error for unknown action", async () => {
		const result = await skill.execute({ action: "unknown" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown action");
	});

	it("updates job enabled state", async () => {
		const job = store.add({
			label: "toggle me",
			task: "toggle",
			schedule: { type: "every", intervalMs: 1000 },
		});

		const result = await skill.execute(
			{ action: "update", job_id: job.id, enabled: false },
			{},
		);

		expect(result.success).toBe(true);
		expect(store.get(job.id)?.enabled).toBe(false);
	});

	describe("gateway actions", () => {
		const mockGateway = {
			isConnected: () => true,
			request: vi.fn(),
		};

		it("gateway_list returns jobs from gateway", async () => {
			mockGateway.request.mockResolvedValue({
				jobs: [{ id: "gw-1", name: "gw-job", enabled: true }],
			});
			const result = await skill.execute(
				{ action: "gateway_list" },
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.jobs).toHaveLength(1);
		});

		it("gateway_status returns scheduler status", async () => {
			mockGateway.request.mockResolvedValue({
				enabled: true,
				jobCount: 3,
			});
			const result = await skill.execute(
				{ action: "gateway_status" },
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.enabled).toBe(true);
		});

		it("gateway_add creates job on gateway", async () => {
			mockGateway.request.mockResolvedValue({
				id: "gw-new",
				name: "new-job",
				created: true,
			});
			const result = await skill.execute(
				{
					action: "gateway_add",
					label: "new-job",
					schedule_type: "cron",
					schedule_value: "0 * * * *",
				},
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.created).toBe(true);
		});

		it("gateway_run executes job manually", async () => {
			mockGateway.request.mockResolvedValue({
				jobId: "gw-1",
				executed: true,
			});
			const result = await skill.execute(
				{ action: "gateway_run", job_id: "gw-1" },
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.executed).toBe(true);
		});

		it("gateway_runs returns run history", async () => {
			mockGateway.request.mockResolvedValue({
				jobId: "gw-1",
				runs: [{ firedAt: 1700000000000, result: "ok" }],
			});
			const result = await skill.execute(
				{ action: "gateway_runs", job_id: "gw-1" },
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.output);
			expect(parsed.runs).toHaveLength(1);
		});

		it("gateway_remove removes job from gateway", async () => {
			mockGateway.request.mockResolvedValue({
				removed: true,
				jobId: "gw-1",
			});
			const result = await skill.execute(
				{ action: "gateway_remove", job_id: "gw-1" },
				{ gateway: mockGateway as never },
			);
			expect(result.success).toBe(true);
		});

		it("gateway actions fail without gateway", async () => {
			const result = await skill.execute({ action: "gateway_list" }, {});
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/gateway/i);
		});
	});
});
