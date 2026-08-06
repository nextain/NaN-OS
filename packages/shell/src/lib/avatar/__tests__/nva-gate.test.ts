import { describe, expect, it } from "vitest";
import {
	canUseVideoAvatarFromConfig,
	effectiveAvatarProviderFromConfig,
} from "../nva-gate";

describe("pre-baked NVA gate", () => {
	it("uses a selected video avatar without account or GPU requirements", () => {
		const config = {
			avatarProvider: "naia-video-avatar" as const,
			localGpuTier: "off" as const,
			naiaKey: "",
		};
		for (const detected of [null, 0, 6, 8] as const) {
			expect(canUseVideoAvatarFromConfig(config, detected)).toBe(true);
			expect(effectiveAvatarProviderFromConfig(config, detected)).toBe("naia-video-avatar");
		}
	});
	it("keeps VRM when VRM is selected", () => {
		expect(effectiveAvatarProviderFromConfig({ avatarProvider: "vrm" }, null)).toBe("vrm");
	});
});
