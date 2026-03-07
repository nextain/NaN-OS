import type { CronStore } from "./store.js";
import type { CronJob, CronPayload } from "./types.js";

export type CronFireCallback = (payload: CronPayload) => void;

/** Parse a basic cron expression and return the next occurrence in ms from now (UTC) */
function nextCronOccurrence(expression: string, now: Date): number | null {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) return null;

	const [minStr, hourStr, , ,] = parts;
	const targetMin = minStr === "*" ? -1 : Number.parseInt(minStr, 10);
	const targetHour = hourStr === "*" ? -1 : Number.parseInt(hourStr, 10);

	if (
		(targetMin !== -1 && Number.isNaN(targetMin)) ||
		(targetHour !== -1 && Number.isNaN(targetHour))
	) {
		return null;
	}

	// Find next matching time (all UTC to avoid timezone issues)
	const candidate = new Date(now);
	candidate.setUTCSeconds(0, 0);

	if (targetMin !== -1) candidate.setUTCMinutes(targetMin);
	if (targetHour !== -1) candidate.setUTCHours(targetHour);

	// If candidate is in the past or exactly now, advance by appropriate interval
	if (candidate.getTime() <= now.getTime()) {
		if (targetHour !== -1) {
			// Daily: advance to next day
			candidate.setUTCDate(candidate.getUTCDate() + 1);
		} else if (targetMin !== -1) {
			// Hourly: advance to next hour
			candidate.setUTCHours(candidate.getUTCHours() + 1);
		} else {
			// Every minute
			candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
		}
	}

	return candidate.getTime() - now.getTime();
}

export class CronScheduler {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly onFire: CronFireCallback;

	constructor(onFire: CronFireCallback) {
		this.onFire = onFire;
	}

	start(job: CronJob): void {
		// Don't start disabled jobs
		if (!job.enabled) return;

		// Clean up existing timer for this job
		this.stop(job.id);

		switch (job.schedule.type) {
			case "at": {
				const targetMs = new Date(job.schedule.date).getTime() - Date.now();
				if (targetMs <= 0) return; // Already past
				const timer = setTimeout(() => {
					this.fire(job);
					this.timers.delete(job.id);
				}, targetMs);
				this.timers.set(job.id, timer);
				break;
			}

			case "every": {
				const timer = setInterval(() => {
					this.fire(job);
				}, job.schedule.intervalMs);
				this.timers.set(job.id, timer);
				break;
			}

			case "cron": {
				this.scheduleCron(job);
				break;
			}
		}
	}

	private scheduleCron(job: CronJob): void {
		const now = new Date();
		const delayMs = nextCronOccurrence(
			(job.schedule as { expression: string }).expression,
			now,
		);
		if (delayMs == null || delayMs <= 0) return;

		const timer = setTimeout(() => {
			this.fire(job);
			this.timers.delete(job.id);
			// Re-schedule for next occurrence
			this.scheduleCron(job);
		}, delayMs);
		this.timers.set(job.id, timer);
	}

	private fire(job: CronJob): void {
		const payload: CronPayload = {
			jobId: job.id,
			label: job.label,
			task: job.task,
			firedAt: new Date().toISOString(),
		};
		this.onFire(payload);
	}

	stop(id: string): void {
		const timer = this.timers.get(id);
		if (timer) {
			clearTimeout(timer);
			clearInterval(timer);
			this.timers.delete(id);
		}
	}

	stopAll(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
			clearInterval(timer);
		}
		this.timers.clear();
	}

	isRunning(id: string): boolean {
		return this.timers.has(id);
	}

	/** Restore all enabled jobs from a persistent store and start them */
	restoreFromStore(store: CronStore): void {
		for (const job of store.list()) {
			if (job.enabled && !this.isRunning(job.id)) {
				this.start(job);
			}
		}
	}
}
