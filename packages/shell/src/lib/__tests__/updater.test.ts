import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));

import { checkForUpdate } from "../updater";

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
			version: "0.2.0",
			body: "Signed updater recovery",
			downloadAndInstall,
		});

		const update = await checkForUpdate();
		expect(update).toMatchObject({
			version: "0.2.0",
			body: "Signed updater recovery",
		});
		await update?.installFn();
		expect(downloadAndInstall).toHaveBeenCalledOnce();
		expect(relaunch).toHaveBeenCalledOnce();
	});
});
