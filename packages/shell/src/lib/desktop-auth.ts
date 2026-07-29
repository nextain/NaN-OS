import type { AppConfig } from "./config";
import { writeConfiguredLlmRole } from "./llm/roles";
import { applyNaiaSlotDefaults, NAIA_SLOT_DEFAULTS } from "./slots/model";

export const DESKTOP_AUTH_CALLBACK = "http://127.0.0.1:18792/auth/callback";

export function buildDesktopLoginUrl(
	baseUrl: string,
	locale: string,
	state: string,
	source: "desktop" | "embedded",
): string {
	const params = new URLSearchParams({
		redirect: "desktop",
		app: "naia-os",
		source,
		redirect_uri: DESKTOP_AUTH_CALLBACK,
	});
	if (/^[0-9a-f]{64}$/.test(state)) params.set("state", state);
	return `${baseUrl.replace(/\/$/, "")}/${locale}/login?${params.toString()}`;
}

/** Login is an explicit switch to the Naia credit gateway for the main role. */
export function buildAdkLoginConfig(
	existing: Partial<AppConfig>,
	naiaKey: string,
	naiaUserId?: string,
): AppConfig {
	const model =
		existing.provider === "nextain" && existing.model
			? existing.model
			: NAIA_SLOT_DEFAULTS.main.model;
	const authoritative = writeConfiguredLlmRole(
		{
			...existing,
			provider: "nextain",
			model,
			apiKey: "",
			naiaKey,
			naiaUserId,
			onboardingComplete: true,
		} as AppConfig,
		"main",
		{ provider: "nextain", model },
	);
	return applyNaiaSlotDefaults(authoritative);
}
