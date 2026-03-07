import { invoke } from "@tauri-apps/api/core";
import { loadConfig } from "./config";
import { upsertFact } from "./db";
import { Logger } from "./logger";
import { extractFacts } from "./memory-processor";
import { syncToOpenClaw } from "./openclaw-sync";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = "naia-memory-sync-last-scan";

function getLastScanMs(): number {
	try {
		return Number(localStorage.getItem(STORAGE_KEY)) || 0;
	} catch {
		return 0;
	}
}

function setLastScanMs(ms: number): void {
	try {
		localStorage.setItem(STORAGE_KEY, String(ms));
	} catch {
		// ignore
	}
}

/**
 * Scan OpenClaw workspace/memory/*.md for new files, extract facts,
 * and upsert them into Shell's facts DB. Triggers SOUL.md sync if new facts found.
 */
export async function syncFromOpenClawMemory(): Promise<void> {
	const config = loadConfig();
	if (!config?.apiKey) return;

	const sinceMs = getLastScanMs();
	let files: Array<[string, string, number]>;
	try {
		files = await invoke("read_openclaw_memory_files", { since_ms: sinceMs });
	} catch (err) {
		Logger.warn("memory-sync", "Failed to read OpenClaw memory files", {
			error: String(err),
		});
		return;
	}

	if (files.length === 0) return;

	let newFactCount = 0;
	let maxMtime = sinceMs;

	for (const [filename, content, mtime] of files) {
		if (mtime > maxMtime) maxMtime = mtime;

		// Treat file content as a single message for fact extraction
		const rows = [{ role: "assistant", content }];
		try {
			const rawFacts = await extractFacts(
				rows,
				`OpenClaw memory file: ${filename}`,
				config.apiKey,
				config.provider || "gemini",
			);
			for (const f of rawFacts) {
				const now = Date.now();
				await upsertFact({
					id: `fact-${f.key}-${now}`,
					key: f.key,
					value: f.value,
					source_session: `openclaw:${filename}`,
					created_at: now,
					updated_at: now,
				});
				newFactCount++;
			}
		} catch (err) {
			Logger.warn("memory-sync", `Failed to extract facts from ${filename}`, {
				error: String(err),
			});
		}
	}

	setLastScanMs(maxMtime);

	if (newFactCount > 0) {
		Logger.info(
			"memory-sync",
			`Extracted ${newFactCount} facts from ${files.length} OpenClaw memory files`,
		);
		syncToOpenClaw(config.provider, config.model, config.apiKey).catch(
			() => {},
		);
	}
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Start periodic memory sync (call once on app startup). */
export function startMemorySync(): void {
	if (intervalId) return;
	// Initial sync after short delay (let app finish loading)
	setTimeout(() => syncFromOpenClawMemory().catch(() => {}), 5000);
	intervalId = setInterval(
		() => syncFromOpenClawMemory().catch(() => {}),
		SYNC_INTERVAL_MS,
	);
}

export function stopMemorySync(): void {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}
