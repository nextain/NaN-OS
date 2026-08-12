import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fetchLocalVoiceHealth,
	localVoiceFacadeUrlFromReady,
} from "../local-runtime";

describe("localVoiceFacadeUrlFromReady", () => {
	it("returns the facade for a ready TTS service", () => {
		expect(localVoiceFacadeUrlFromReady(JSON.stringify({
			facade_port: 8910,
			services: [{ kind: "tts" }, { kind: "facade" }],
		}))).toBe("http://127.0.0.1:8910");
	});

	it("rejects avatar-only, malformed, and missing readiness payloads", () => {
		expect(localVoiceFacadeUrlFromReady(JSON.stringify({ facade_port: 8910, services: [{ kind: "avatar" }] }))).toBeNull();
		expect(localVoiceFacadeUrlFromReady(JSON.stringify({ services: [{ kind: "tts" }] }))).toBeNull();
		expect(localVoiceFacadeUrlFromReady("not-json")).toBeNull();
	});
});

describe("fetchLocalVoiceHealth (FR-VOICE.14)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reports TTS readiness from the façade health body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ tts_enabled: true, avatar_enabled: false, mode: "tts_only" }),
			}),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910/")).toEqual({
			ttsReady: true,
			avatarReady: false,
			mode: "tts_only",
		});
	});

	it("distinguishes an engine with TTS unavailable from a ready one", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ tts_enabled: false, avatar_enabled: true }),
			}),
		);
		const health = await fetchLocalVoiceHealth("http://127.0.0.1:8910");
		expect(health?.ttsReady).toBe(false);
		expect(health?.avatarReady).toBe(true);
	});

	it("returns null when the façade is unreachable, non-OK, or off-contract", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();

		// A reachable port serving a different JSON body is NOT readiness.
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ voices: [] }) }));
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();
	});
});
