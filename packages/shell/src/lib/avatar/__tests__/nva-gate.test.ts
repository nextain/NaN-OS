import { describe, expect, it } from "vitest";
import {
	canUseVideoAvatarFromConfig,
	effectiveAvatarProviderFromConfig,
	hasExplicitLocalAvatarProfile,
} from "../nva-gate";

describe("NVA playback and precision-runtime gates", () => {
	it("keeps a logged-out NVA selection while leaving local precision runtime disabled", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "auto" as const,
			naiaKey: "",
		};

		expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
		expect(canUseVideoAvatarFromConfig(config, 8)).toBe(true);
		expect(effectiveAvatarProviderFromConfig(config, 8)).toBe(
			"naia-video-avatar",
		);
	});

	it("keeps an explicit local avatar profile dormant after logout", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "laptop-4060-8g" as const,
			naiaKey: "",
		};

		expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
		expect(canUseVideoAvatarFromConfig(config, 8)).toBe(true);
		expect(effectiveAvatarProviderFromConfig(config, 8)).toBe(
			"naia-video-avatar",
		);
	});

	it("keeps legacy auto/off profiles from starting precision runtime without hiding NVA", () => {
		for (const localGpuTier of ["auto", "off"] as const) {
			const config = {
				avatarProvider: "naia-video-avatar" as const,
				localGpuTier,
				naiaKey: "",
			};

			expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
			expect(canUseVideoAvatarFromConfig(config, 8)).toBe(true);
			expect(effectiveAvatarProviderFromConfig(config, 8)).toBe(
				"naia-video-avatar",
			);
		}
	});

	it("allows logged-in remote NVA without a local profile", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "off" as const,
			naiaKey: "naia_test_key",
		};

		expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
		expect(canUseVideoAvatarFromConfig(config, 8)).toBe(true);
		expect(effectiveAvatarProviderFromConfig(config, 8)).toBe(
			"naia-video-avatar",
		);
	});

	it("keeps stored NVA playback below 8GB or with unknown VRAM", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "laptop-4060-8g" as const,
			naiaKey: "naia_test_key",
		};
		for (const detectedVramGb of [6, 7, null] as const) {
			expect(canUseVideoAvatarFromConfig(config, detectedVramGb)).toBe(true);
			expect(effectiveAvatarProviderFromConfig(config, detectedVramGb)).toBe(
				"naia-video-avatar",
			);
		}
	});
});
