import { describe, expect, it } from "vitest";
import {
	AVATAR_PRESETS,
	DEFAULT_AVATAR_MODEL,
	getAvatarGender,
	isLegacyBundledVrmModel,
} from "../avatar-presets";

describe("installed VRM defaults", () => {
	it("does not point a fresh installation at the removed Naia demo asset", () => {
		expect(DEFAULT_AVATAR_MODEL).toBe("");
		expect(isLegacyBundledVrmModel("/avatars/Naia.vrm")).toBe(true);
		expect(
			isLegacyBundledVrmModel("C:\\naia-settings\\vrm-files\\Naia-Hair.vrm"),
		).toBe(true);
	});

	it("keeps installed ADK avatars out of the legacy migration path", () => {
		expect(isLegacyBundledVrmModel("03-Sendagaya-Shino-uniform.vrm")).toBe(
			false,
		);
		expect(isLegacyBundledVrmModel("01-OL_Woman.vrm")).toBe(false);
		expect(isLegacyBundledVrmModel("naia_char_skin_head.vrm")).toBe(false);
		expect(isLegacyBundledVrmModel("naia_char_with_hair.vrm")).toBe(false);
	});

	it("lists all six ADK avatars, preserving OL Woman as the first VRM", () => {
		expect(AVATAR_PRESETS.map(({ filename }) => filename)).toEqual([
			"01-OL_Woman.vrm",
			"02-Hood_Boy.vrm",
			"03-Sendagaya-Shino-uniform.vrm",
			"04-Sakurada-Fumiriya.vrm",
			"naia_char_skin_head.vrm",
			"naia_char_with_hair.vrm",
		]);
	});

	it("uses the female voice family for both official Naia VRMs", () => {
		expect(
			getAvatarGender(
				"C:\\naia-adk\\naia-settings\\vrm-files\\naia_char_skin_head.vrm",
			),
		).toBe("female");
		expect(
			getAvatarGender(
				"/home/user/naia-adk/naia-settings/vrm-files/naia_char_with_hair.vrm",
			),
		).toBe("female");
	});
});
