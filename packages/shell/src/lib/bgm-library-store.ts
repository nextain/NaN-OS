/**
 * BGM 라이브러리 영속 계층 (#540 UI QA · 앱 샌드박스 프로토콜).
 *
 * SoT 는 앱 샌드박스 `data-private/apps/land.naia.shell/bgm/library.json` 이다
 * (docs/app-store-protocol.md). config.json 의 `bgmLibrary` 는 구버전 사본으로,
 * 샌드박스 파일이 없을 때 1회 이관 소스이자 샌드박스 쓰기 실패 시 폴백이다.
 *
 * 모듈 캐시는 음성 스킬(bgm-skill)의 동기 판독을 위해 존재한다 — BgmPlayer 가
 * 항상 마운트되어 기동 직후 hydrate 하므로 스킬이 읽을 때는 채워져 있다.
 */

import { readAppSandboxFile, writeAppSandboxFile } from "./app-sandbox";
import { loadBgmLibrary, type BgmLibraryState } from "./bgm-library";
import { loadConfig, saveConfig } from "./config";
import { Logger } from "./logger";

const APP_ID = "land.naia.shell";
const LIBRARY_PATH = "bgm/library.json";

let cache: BgmLibraryState | null = null;

/** 동기 판독용 캐시 — hydrate 전에는 null. */
export function bgmLibraryCache(): BgmLibraryState | null {
	return cache;
}

/** 테스트 전용 초기화. */
export function resetBgmLibraryCache(): void {
	cache = null;
}

/**
 * 샌드박스에서 로드한다. 파일이 없거나 깨져 있으면 config.bgmLibrary 를
 * 1회 이관(샌드박스에 기록)한다.
 */
export async function loadBgmLibraryFromSandbox(
	legacyYoutubeLikes: readonly unknown[] = [],
): Promise<BgmLibraryState> {
	try {
		const bytes = await readAppSandboxFile(APP_ID, LIBRARY_PATH);
		const parsed = JSON.parse(
			new TextDecoder().decode(Uint8Array.from(bytes)),
		) as unknown;
		cache = loadBgmLibrary(parsed);
		return cache;
	} catch {
		// 파일 부재/파손 — config 이관 경로로 넘어간다.
	}
	const cfg = loadConfig();
	const migrated = loadBgmLibrary(cfg?.bgmLibrary, legacyYoutubeLikes);
	cache = migrated;
	await persistBgmLibrary(migrated);
	return migrated;
}

/** 캐시 갱신 + 샌드박스 기록. 실패 시 config 폴백을 남기고 경고한다. */
export async function persistBgmLibrary(state: BgmLibraryState): Promise<void> {
	cache = state;
	try {
		const bytes = Array.from(new TextEncoder().encode(JSON.stringify(state)));
		await writeAppSandboxFile(APP_ID, LIBRARY_PATH, bytes);
	} catch (error) {
		Logger.warn(
			"BgmLibraryStore",
			"sandbox persist failed — falling back to config.json",
			{ error: String(error) },
		);
		const cfg = loadConfig();
		(globalThis as unknown as { __BGM_LIB_PROBE__?: string[] }).__BGM_LIB_PROBE__ = [
			...(((globalThis as unknown as { __BGM_LIB_PROBE__?: string[] }).__BGM_LIB_PROBE__) ?? []),
			`fallback:hasCfg=${!!cfg}`,
		];
		if (cfg) saveConfig({ ...cfg, bgmLibrary: state });
	}
}
