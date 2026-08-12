import type { AppConfig } from "./config";

/**
 * FR-VOICE.15 (#418): retired config fields that the safety migration strips
 * (normalizeLocalRuntimeConfig in config.ts). Harness/e2e seeds must never
 * reintroduce them — a seeded retired field is treated as stale authority and
 * silently disables local voice (the 2026-08-11 voice-6g harness incident).
 * Keep in sync with the destructuring in normalizeLocalRuntimeConfig;
 * config-seed.test.ts pins the correspondence against real migration output.
 */
export const RETIRED_CONFIG_KEYS = [
	"cascadeRuntimeUrl",
	"local8gFocus",
	"localAvatarVoiceFocus",
	"localGpuTier",
] as const;

export type RetiredConfigKey = (typeof RETIRED_CONFIG_KEYS)[number];

/** Shell config shape a harness may seed: product schema minus retired keys. */
export type SeedableShellConfig = Partial<Omit<AppConfig, RetiredConfigKey>>;

/**
 * Build a harness/e2e config seed from the product schema. Excess-property
 * checking rejects unknown and retired keys at compile time for object
 * literals; the runtime guard rejects retired keys arriving through spreads.
 */
export function buildSeedShellConfig(
	seed: SeedableShellConfig,
): SeedableShellConfig {
	for (const key of RETIRED_CONFIG_KEYS) {
		if (key in seed) {
			throw new Error(`retired config key must not be seeded: ${key}`);
		}
	}
	return seed;
}
