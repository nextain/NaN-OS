/**
 * UC8 공간분위기 — skill_youtube_bgm 패널(환경) 도구 (FR-BGM.1, 2026-07-16).
 *
 * BgmPlayer 위젯은 앱이 아니라 descriptor.tools 등록 경로가 없어 new-core 에서
 * 나이아가 BGM 존재를 몰랐다(이식 갭). 배선 = 패널 도구 경로(E1 — naia-agent 무변경):
 *   부팅 시 App.tsx 가 sendPanelSkills(BGM_PANEL_ID, [SKILL_YOUTUBE_BGM]) 등록
 *   → agent panelExec 가 LLM 에 노출 → panel_tool_call
 *   → ChatArea dispatchPanelToolCall 의 BGM 분기가 executeBgmSkill 실행
 *   → 위젯이 이미 듣는 `bgm_youtube_*` agent_response 이벤트로 제어 (BgmPlayer 무변경).
 *
 * 검색 = BGM 사이드카(:18791, Rust 가 기동 #335 — BgmPlayer.ytSearch 와 동일 표면).
 * 액션 모델·볼륨 clamp = naia-agent UC8 어댑터(youtube-bgm-skills.ts) 동형 — 어휘 드리프트 방지.
 */

import { emit } from "@tauri-apps/api/event";
import type { NaiaTool } from "./app-registry";
import {
	BGM_SIDECAR_BASE_URL,
	ensureBgmSidecar,
} from "./bgm-sidecar-url";
import {
	bgmPlayback,
	toBgmPlayToolResult,
	toBgmQueuedToolResult,
	toBgmObservedContext,
	type BgmPlaybackPort,
} from "./bgm-playback";

/** panelExec 등록용 패널 id — 위젯 전용(앱 아님), panel_skills_clear 대상 아님(항상 유지). */
export const BGM_PANEL_ID = "bgm-widget";

const YT_BASE = BGM_SIDECAR_BASE_URL;

export const BGM_ACTIONS = [
	"play",
	"stop",
	"pause",
	"resume",
	"next",
	"prev",
	"status",
	"volume",
] as const;
export type BgmAction = (typeof BGM_ACTIONS)[number];

export const SKILL_YOUTUBE_BGM: NaiaTool = {
	name: "skill_youtube_bgm",
	description:
		"YouTube BGM(배경음악) 플레이어 제어. 사용자가 어떤 언어로든 음악, BGM, 곡 변경, 다음 곡 또는 라디오 DJ를 요청하면 반드시 이 도구를 의미적으로 선택한다. play(query 검색 결과 재생, videoId 직접 지정 가능)/stop/pause/resume/next(즐겨찾기 다음)/prev(이전)/volume(0~1). 도구 결과가 requested이면 재생 성공이라고 말하지 말고, observed playing만 실제 재생으로 표현한다.",
	parameters: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: [...BGM_ACTIONS],
				description: BGM_ACTIONS.join(" | "),
			},
			query: {
				type: "string",
				description: "검색어 (play 에서 videoId 없을 때)",
			},
			videoId: { type: "string", description: "YouTube video id (play, 선택)" },
			title: { type: "string", description: "제목 (play+videoId, 선택)" },
			volume: { type: "number", description: "0.0~1.0 (volume)" },
			mode: {
				type: "string",
				enum: ["player", "radio_dj"],
				description:
					"Semantic intent chosen by the LLM in any language. Use radio_dj only when the user asks for an ongoing autonomous DJ/radio-host experience (including synonyms or similar phrasing); use player for ordinary song, playlist, or BGM playback.",
			},
		},
		required: ["action"],
	},
	tier: 0, // App.tsx 부팅 시 addAllowedTool("skill_youtube_bgm") — 저위험 환경 조작
};

/** Shell policy boundary: only the LLM's structured semantic choice activates DJ mode. */
export function shouldActivateRadioDj(args: Record<string, unknown>): boolean {
	return args.action === "play" && args.mode === "radio_dj";
}

export interface BgmSearchResult {
	id: string;
	title: string;
	thumbnail?: string;
}

/** 주입 가능 deps — 테스트 헤르메틱(사이드카/Tauri 불요). */
export interface BgmSkillDeps {
	search: (query: string) => Promise<BgmSearchResult[]>;
	/** 위젯(BgmPlayer)이 listen("agent_response") 로 받는 payload 를 발사. */
	emitBgm: (payload: Record<string, unknown>) => Promise<void>;
	playback: BgmPlaybackPort;
	/** Number of YouTube favorites available to next/prev navigation. */
	favoriteCount?: () => number;
	now?: () => number;
}

function persistedFavoriteCount(): number {
	try {
		const parsed = JSON.parse(localStorage.getItem("yt-bgm-favorites") ?? "[]");
		return Array.isArray(parsed) ? parsed.length : 0;
	} catch {
		return 0;
	}
}

/** 사이드카 검색 — BgmPlayer.ytSearch 동형 표면(GET /yt/search?q=&max=). */
async function sidecarSearch(query: string): Promise<BgmSearchResult[]> {
	await ensureBgmSidecar();
	const res = await fetch(
		`${YT_BASE}/yt/search?q=${encodeURIComponent(query)}&max=5`,
	);
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `BGM 검색 서버 오류 (HTTP ${res.status})`);
	}
	const data = (await res.json()) as { results?: BgmSearchResult[] };
	return data.results ?? [];
}

const defaultDeps: BgmSkillDeps = {
	search: sidecarSearch,
	// Tauri emit 은 JS listen("agent_response") 리스너에도 브로드캐스트 — BgmPlayer 가 즉시 반응.
	emitBgm: (payload) => emit("agent_response", JSON.stringify(payload)),
	playback: bgmPlayback,
	favoriteCount: persistedFavoriteCount,
};

/** 도메인: volume 0..1 clamp(순수) — agent UC8 어댑터 clampVolume 동형. 비유한=0.5. */
export function clampVolume(v: unknown): number {
	const n = typeof v === "number" && Number.isFinite(v) ? v : 0.5;
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * skill_youtube_bgm 실행. 에이전트가 추측으로 성공을 판정하지 않도록
 * 모든 정상 실행 결과는 구조화 JSON으로 반환한다.
 */
export async function executeBgmSkill(
	args: Record<string, unknown>,
	deps: BgmSkillDeps = defaultDeps,
): Promise<string> {
	const action = args?.action;
	if (
		typeof action !== "string" ||
		!(BGM_ACTIONS as readonly string[]).includes(action)
	) {
		throw new Error(`unknown action (allowed: ${BGM_ACTIONS.join("/")})`);
	}
	const act = action as BgmAction;

	const enqueueTrack = async (track: BgmSearchResult): Promise<string> => {
		// Speech activities such as Radio DJ own their current selection. A new
		// activity request means "change the music now", not "play this later".
		// Ordinary chat/tool requests keep the queue-preserving behavior below.
		if (args.replace === true) {
			const playback = deps.playback.request({
				videoId: track.id,
				title: track.title,
			});
			await deps.emitBgm({
				type: "bgm_youtube_play",
				videoId: track.id,
				title: track.title,
				...(track.thumbnail ? { thumbnail: track.thumbnail } : {}),
			});
			return JSON.stringify(toBgmPlayToolResult(playback));
		}
		const result = deps.playback.enqueue({
			videoId: track.id,
			title: track.title,
		});
		if (result.disposition === "play") {
			await deps.emitBgm({
				type: "bgm_youtube_play",
				videoId: track.id,
				title: track.title,
				...(track.thumbnail ? { thumbnail: track.thumbnail } : {}),
			});
			return JSON.stringify(toBgmPlayToolResult(result.playback));
		}
		await deps.emitBgm({
			type: "bgm_youtube_enqueue",
			videoId: track.id,
			title: track.title,
			queueId: result.queued.queueId,
			position: result.queued.position,
			...(track.thumbnail ? { thumbnail: track.thumbnail } : {}),
		});
		return JSON.stringify(
			toBgmQueuedToolResult(result.queued, result.queueLength),
		);
	};

	if (act === "status") {
		return JSON.stringify({
			ok: true,
			action: act,
			...toBgmObservedContext(deps.playback.current(), deps.now?.() ?? Date.now(), deps.playback.queue()),
		});
	}

	if (act === "play") {
		const videoId = args.videoId;
		if (typeof videoId === "string" && videoId.trim())
			return enqueueTrack({
				id: videoId,
				title: typeof args.title === "string" ? args.title : "",
			});
		const query = args.query;
		if (typeof query !== "string" || !query.trim())
			throw new Error("play requires query or videoId");
		const results = await deps.search(query);
		if (results.length === 0)
			return JSON.stringify({
				ok: false,
				action: act,
				reason: "no_search_results",
				query,
			});
		const currentVideoId = deps.playback.current()?.selected.videoId;
		const selected =
			args.replace === true
				? results.find((result) => result.id !== currentVideoId) ?? results[0]
				: results[0];
		return enqueueTrack(selected);
	}

	if (act === "volume") {
		const v = clampVolume(args.volume);
		await deps.emitBgm({ type: "bgm_youtube_volume", volume: v });
		return JSON.stringify({ ok: true, action: act, volume: v });
	}

	if ((act === "next" || act === "prev") && (deps.favoriteCount?.() ?? 0) === 0) {
		return JSON.stringify({
			ok: false,
			action: act,
			reason: "no_favorites",
		});
	}

	// stop / pause / resume / next / prev — 위젯 리스너 타입 1:1
	const eventType = `bgm_youtube_${act}`;
	await deps.emitBgm({ type: eventType });
	return JSON.stringify({ ok: true, action: act });
}
