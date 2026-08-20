import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));

import {
	UPDATE_PROMPT_SNOOZE_KEY,
	UPDATE_PROMPT_SNOOZE_MS,
	checkForUpdate,
	shouldShowStartupUpdatePrompt,
	snoozeStartupUpdatePrompt,
} from "../updater";

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	};
}

describe("checkForUpdate", () => {
	beforeEach(() => {
		check.mockReset();
		relaunch.mockReset();
	});

	it("returns null only when the updater confirms there is no update", async () => {
		check.mockResolvedValue(null);
		await expect(checkForUpdate()).resolves.toBeNull();
	});

	it("surfaces metadata or network failures instead of reporting latest", async () => {
		check.mockRejectedValue(new Error("latest.json returned 404"));
		await expect(checkForUpdate()).rejects.toThrow("latest.json returned 404");
	});

	it("downloads, installs, and relaunches an available update", async () => {
		const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
		check.mockResolvedValue({
			currentVersion: "0.1.9",
			version: "0.2.0",
			body: "Signed updater recovery",
			downloadAndInstall,
		});

		const update = await checkForUpdate();
		expect(update).toMatchObject({
			currentVersion: "0.1.9",
			version: "0.2.0",
			body: "Signed updater recovery",
		});
		await update?.installFn();
		expect(downloadAndInstall).toHaveBeenCalledOnce();
		expect(relaunch).toHaveBeenCalledOnce();
	});

	it("defers only the selected version for exactly 30 days", () => {
		const storage = memoryStorage();
		const now = Date.UTC(2026, 7, 20);

		snoozeStartupUpdatePrompt("0.2.0", now, storage);

		expect(shouldShowStartupUpdatePrompt("0.2.0", now, storage)).toBe(false);
		expect(
			shouldShowStartupUpdatePrompt(
				"0.2.0",
				now + UPDATE_PROMPT_SNOOZE_MS - 1,
				storage,
			),
		).toBe(false);
		expect(
			shouldShowStartupUpdatePrompt(
				"0.2.0",
				now + UPDATE_PROMPT_SNOOZE_MS,
				storage,
			),
		).toBe(true);
		expect(shouldShowStartupUpdatePrompt("0.2.1", now, storage)).toBe(true);

		expect(
			JSON.parse(storage.getItem(UPDATE_PROMPT_SNOOZE_KEY) ?? "{}"),
		).toEqual({
			version: "0.2.0",
			until: now + UPDATE_PROMPT_SNOOZE_MS,
		});
	});

	it("shows the prompt when persisted deferral data is corrupt or unavailable", () => {
		const corrupt = memoryStorage();
		corrupt.setItem(UPDATE_PROMPT_SNOOZE_KEY, "not-json");
		expect(shouldShowStartupUpdatePrompt("0.2.0", Date.now(), corrupt)).toBe(
			true,
		);

		const unavailable = {
			getItem: () => {
				throw new Error("storage blocked");
			},
			setItem: () => {
				throw new Error("storage blocked");
			},
		};
		expect(() =>
			snoozeStartupUpdatePrompt("0.2.0", Date.now(), unavailable),
		).not.toThrow();
		expect(
			shouldShowStartupUpdatePrompt("0.2.0", Date.now(), unavailable),
		).toBe(true);
	});
});
