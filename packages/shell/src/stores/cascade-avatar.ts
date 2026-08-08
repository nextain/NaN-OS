/**
 * NVA 비디오 아바타 렌더러 공유 store.
 *
 * VideoAvatarCanvas 가 마운트되면 활성 PrebakedAvatarRenderer 를 여기 등록한다.
 * ChatArea(발화 파이프라인)은 Shell TTS로 오디오를 합성·재생하는 단일 소유자이며,
 * 이 렌더러는 `setSpeakingVisual(active)`로 실제 재생 시작/종료만 소비해 idle/talking
 * 비주얼을 전환한다. 정확히 일치하는 문구는 `hasAuthoredClip`/`playAuthoredClip`로
 * 자체 녹음 음성이 포함된 저작 클립을 재생한다. renderer가 null이면 NVA 미사용(VRM 등).
 */
import { create } from "zustand";
import type { AvatarSpeechRenderer } from "../lib/avatar/avatar-renderer";

interface CascadeAvatarState {
	renderer: AvatarSpeechRenderer | null;
	setRenderer: (renderer: AvatarSpeechRenderer | null) => void;
	/** Local VoxCPM2 facade URL from CASCADE_READY; null when local voice is stopped. */
	localFacadeUrl: string | null;
	setLocalFacadeUrl: (url: string | null) => void;
	/** Set when VideoAvatarCanvas fails to load the NVA bundle; cleared on success/unmount. */
	nvaLoadError: string | null;
	setNvaLoadError: (error: string | null) => void;
}

export const useCascadeAvatarStore = create<CascadeAvatarState>((set) => ({
	renderer: null,
	setRenderer: (renderer) => set({ renderer }),
	localFacadeUrl: null,
	setLocalFacadeUrl: (localFacadeUrl) => set({ localFacadeUrl }),
	nvaLoadError: null,
	setNvaLoadError: (nvaLoadError) => set({ nvaLoadError }),
}));
