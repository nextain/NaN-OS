// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { reconcileExplicitLocalProfile } from "../config";
import {
	RETIRED_CONFIG_KEYS,
	buildSeedShellConfig,
	type SeedableShellConfig,
} from "../config-seed";

describe("config-seed (FR-VOICE.15)", () => {
	it("passes a clean product-schema seed through unchanged", () => {
		const seed: SeedableShellConfig = {
			provider: "codex",
			model: "gpt-5.4",
			localVoiceEnabled: true,
			ttsProvider: "naia-local-voice",
			ttsEnabled: true,
			vllmTtsHost: "http://127.0.0.1:8910",
		};
		expect(buildSeedShellConfig(seed)).toEqual(seed);
	});

	it("rejects every retired key arriving through a spread at runtime", () => {
		const retiredValues: Record<string, unknown> = {
			cascadeRuntimeUrl: "http://localhost:8910",
			local8gFocus: "llm",
			localAvatarVoiceFocus: "llm",
			localGpuTier: "windows-voice-6g",
		};
		for (const key of RETIRED_CONFIG_KEYS) {
			const sneaky = {
				provider: "codex",
				model: "gpt-5.4",
				...{ [key]: retiredValues[key] },
			} as SeedableShellConfig;
			expect(() => buildSeedShellConfig(sneaky)).toThrow(key);
		}
	});

	it("matches the safety migration: every listed key is actually stripped", () => {
		// SoT tie — if normalizeLocalRuntimeConfig stops stripping a listed key
		// (or strips one not listed), this contract breaks and the list must be
		// reconciled instead of drifting silently.
		const retiredValues: Record<string, unknown> = {
			cascadeRuntimeUrl: "http://localhost:8910",
			local8gFocus: "llm",
			localAvatarVoiceFocus: "llm",
			localGpuTier: "windows-voice-6g",
		};
		expect(Object.keys(retiredValues).sort()).toEqual(
			[...RETIRED_CONFIG_KEYS].sort(),
		);
		for (const key of RETIRED_CONFIG_KEYS) {
			const migrated = reconcileExplicitLocalProfile({
				provider: "nextain",
				model: "gemini-3.5-flash",
				apiKey: "",
				[key]: retiredValues[key],
			});
			expect(
				(migrated as unknown as Record<string, unknown>)[key],
				`retired key '${key}' must be stripped by the migration`,
			).toBeUndefined();
		}
	});
});
