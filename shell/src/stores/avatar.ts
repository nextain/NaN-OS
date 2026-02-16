import { create } from "zustand";

interface AvatarState {
	modelPath: string;
	animationPath: string;
	isLoaded: boolean;
	loadProgress: number;
	setLoaded: (loaded: boolean) => void;
	setLoadProgress: (progress: number) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
	modelPath: "/avatars/Sendagaya-Shino-dark-uniform.vrm",
	animationPath: "/animations/idle_loop.vrma",
	isLoaded: false,
	loadProgress: 0,
	setLoaded: (loaded) => set({ isLoaded: loaded }),
	setLoadProgress: (progress) => set({ loadProgress: progress }),
}));
