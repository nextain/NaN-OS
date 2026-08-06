/**
 * cascade 토킹 아바타 렌더러 공유 store.
 *
 * VideoAvatarCanvas 가 cascade 모드로 진입하면 활성 CascadeAvatarRenderer 를 여기 등록하고,
 * ChatArea(발화 파이프라인)이 이를 읽어 `renderer.speak(text)`/`interrupt()` 로 입을 움직인다.
 * cascade 미사용(정적 폴백)이면 renderer = null → ChatArea 은 평소 로컬 TTS 경로를 탄다.
 *
 * SoT: .agents/progress/naia-os-cascade-talking-avatar-2026-07-01.md
 */
import { create } from "zustand";
import type { AvatarSpeechRenderer } from "../lib/avatar/avatar-renderer";

interface CascadeAvatarState {
	renderer: AvatarSpeechRenderer | null;
	setRenderer: (renderer: AvatarSpeechRenderer | null) => void;
	/** Local VoxCPM2 facade URL from CASCADE_READY; null when local voice is stopped. */
	localFacadeUrl: string | null;
	setLocalFacadeUrl: (url: string | null) => void;
}

export const useCascadeAvatarStore = create<CascadeAvatarState>((set) => ({
	renderer: null,
	setRenderer: (renderer) => set({ renderer }),
	localFacadeUrl: null,
	setLocalFacadeUrl: (localFacadeUrl) => set({ localFacadeUrl }),
}));
