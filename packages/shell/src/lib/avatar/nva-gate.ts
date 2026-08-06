import type { AppConfig } from "../config";

type AvatarProvider = "vrm" | "naia-video-avatar";
type VideoAvatarConfig = Pick<AppConfig, "avatarProvider">;

export function canUseVideoAvatarFromConfig(
	config: VideoAvatarConfig | null | undefined,
	_detectedVramGb: number | null = null,
): boolean {
	return config?.avatarProvider === "naia-video-avatar";
}

export function effectiveAvatarProviderFromConfig(
	config: VideoAvatarConfig | null | undefined,
	_detectedVramGb: number | null = null,
): AvatarProvider {
	return canUseVideoAvatarFromConfig(config) ? "naia-video-avatar" : "vrm";
}
