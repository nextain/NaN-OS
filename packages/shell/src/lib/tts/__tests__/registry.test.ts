import { describe, expect, it } from "vitest";
import { listTtsProviderMetas } from "../registry";

describe("TTS provider presentation order", () => {
	it("promotes Naia Local Voice to the second position and requires login", () => {
		const providers = listTtsProviderMetas();
		expect(providers.slice(0, 2).map((provider) => provider.id)).toEqual([
			"browser",
			"naia-local-voice",
		]);
		expect(
			providers.find((provider) => provider.id === "naia-local-voice")
				?.requiresNaiaKey,
		).toBe(true);
	});
});
