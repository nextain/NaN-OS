import { Logger } from "./logger";

export interface UpdateInfo {
	version: string;
	body: string;
	installFn: () => Promise<void>;
}

/**
 * Check for app updates via Tauri updater plugin.
 * Returns null only when the updater confirms that the app is up to date.
 * Transport, metadata, signature, and plugin errors are surfaced to the caller
 * so the UI cannot misreport a failed check as "latest".
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
	try {
		const { check } = await import("@tauri-apps/plugin-updater");
		const update = await check();
		if (!update) return null;

		return {
			version: update.version,
			body: update.body ?? "",
			installFn: async () => {
				await update.downloadAndInstall();
				const { relaunch } = await import("@tauri-apps/plugin-process");
				await relaunch();
			},
		};
	} catch (err) {
		Logger.error("updater", "Update check failed", { error: String(err) });
		throw err;
	}
}
