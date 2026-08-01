import {
	MIN_NVA_VRAM_GB,
	normalizeLocal8gFocus,
	normalizeTierSetting,
	resolveActiveTier,
	resolveLocalCapabilities,
} from "../capabilities/vram-tiers";
import type { AppConfig } from "../config";

type AvatarProvider = "vrm" | "naia-video-avatar";

type VideoAvatarGateConfig = Pick<
	AppConfig,
	| "avatarProvider"
	| "local8gFocus"
	| "localAvatarVoiceFocus"
	| "localGpuTier"
	| "naiaKey"
>;

export function hasExplicitLocalAvatarProfile(
	config: VideoAvatarGateConfig | null | undefined,
	detectedVramGb: number | null = null,
): boolean {
	if (!config?.naiaKey) return false;
	if (!isNvaHardwareEligible(detectedVramGb)) return false;
	const setting = normalizeTierSetting(config?.localGpuTier);
	if (setting === "off" || setting === "auto") return false;
	const tier = resolveActiveTier(setting, detectedVramGb);
	return resolveLocalCapabilities(
		tier,
		normalizeLocal8gFocus(
			config?.local8gFocus ?? config?.localAvatarVoiceFocus,
		),
	).includes("avatar");
}

export function canUseVideoAvatarFromConfig(
	config: VideoAvatarGateConfig | null | undefined,
	detectedVramGb: number | null = null,
): boolean {
	return (
		isNvaHardwareEligible(detectedVramGb) &&
		!!config?.naiaKey &&
		(config.avatarProvider === "naia-video-avatar" ||
			hasExplicitLocalAvatarProfile(config, detectedVramGb))
	);
}

export function isNvaHardwareEligible(detectedVramGb: number | null): boolean {
	return detectedVramGb != null && detectedVramGb >= MIN_NVA_VRAM_GB;
}

export function effectiveAvatarProviderFromConfig(
	config: VideoAvatarGateConfig | null | undefined,
	detectedVramGb: number | null = null,
): AvatarProvider {
	const provider = config?.avatarProvider ?? "vrm";
	if (provider !== "naia-video-avatar") return "vrm";
	return canUseVideoAvatarFromConfig(config, detectedVramGb)
		? "naia-video-avatar"
		: "vrm";
}
