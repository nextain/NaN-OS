import { describe, expect, it } from "vitest";
import {
	canUseVideoAvatarFromConfig,
	effectiveAvatarProviderFromConfig,
	hasExplicitLocalAvatarProfile,
} from "../nva-gate";

describe("NVA login/local gate", () => {
	it("downgrades stale logged-out remote NVA config to VRM", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "auto" as const,
			naiaKey: "",
		};

		expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
		expect(canUseVideoAvatarFromConfig(config, 8)).toBe(false);
		expect(effectiveAvatarProviderFromConfig(config, 8)).toBe("vrm");
	});

	it("keeps an explicit local avatar profile dormant after logout", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "laptop-4060-8g" as const,
			naiaKey: "",
		};

		expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
		expect(canUseVideoAvatarFromConfig(config, 8)).toBe(false);
		expect(effectiveAvatarProviderFromConfig(config, 8)).toBe("vrm");
	});

	it("keeps legacy auto/off profiles from unlocking logged-out NVA", () => {
		for (const localGpuTier of ["auto", "off"] as const) {
			const config = {
				avatarProvider: "naia-video-avatar" as const,
				localGpuTier,
				naiaKey: "",
			};

			expect(hasExplicitLocalAvatarProfile(config, 8)).toBe(false);
			expect(canUseVideoAvatarFromConfig(config, 8)).toBe(false);
			expect(effectiveAvatarProviderFromConfig(config, 8)).toBe("vrm");
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

	it("disables NVA below 8GB or when VRAM cannot be verified, even when logged in", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "laptop-4060-8g" as const,
			naiaKey: "naia_test_key",
		};
		for (const detectedVramGb of [6, 7, null] as const) {
			expect(canUseVideoAvatarFromConfig(config, detectedVramGb)).toBe(false);
			expect(effectiveAvatarProviderFromConfig(config, detectedVramGb)).toBe(
				"vrm",
			);
		}
	});
});
