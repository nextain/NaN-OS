import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearLocalVoiceAccessToken,
	fetchLocalVoiceHealth,
	isOwnLocalVoiceUrl,
	localVoiceAuthHeaders,
	localVoiceFacadeUrlFromReady,
} from "../local-runtime";

afterEach(() => clearLocalVoiceAccessToken());

describe("localVoiceFacadeUrlFromReady", () => {
	it("returns the facade for a ready TTS service", () => {
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({
					facade_port: 8910,
					services: [{ kind: "tts" }, { kind: "facade" }],
				}),
			),
		).toBe("http://127.0.0.1:8910");
	});

	it("parses the standalone VoxCPM2 TensorRT contract", () => {
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({
					service: "voxcpm2-tensorrt",
					capabilities: ["tts"],
					port: 8910,
					local_access_token: "a".repeat(64),
				}),
			),
		).toBe("http://127.0.0.1:8910");
		expect(localVoiceAuthHeaders()).toEqual({
			Authorization: `Bearer ${"a".repeat(64)}`,
		});
	});

	it("recognizes only the authenticated loopback aliases on port 8910", () => {
		expect(isOwnLocalVoiceUrl("http://127.0.0.1:8910")).toBe(true);
		expect(isOwnLocalVoiceUrl("http://localhost:8910/")).toBe(true);
		expect(isOwnLocalVoiceUrl("http://[::1]:8910")).toBe(true);
		expect(isOwnLocalVoiceUrl("https://localhost:8910")).toBe(false);
		expect(isOwnLocalVoiceUrl("http://example.com:8910")).toBe(false);
	});

	it("rejects a standalone readiness payload without a valid local token", () => {
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({
					service: "voxcpm2-tensorrt",
					capabilities: ["tts"],
					port: 8910,
				}),
			),
		).toBeNull();
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({
					service: "voxcpm2-tensorrt",
					capabilities: ["tts"],
					port: 18910,
					local_access_token: "b".repeat(64),
				}),
			),
		).toBeNull();
	});

	it("parses the Rust ADOPTED_CASCADE_READY payload (shared-runtime adoption, #425)", () => {
		// Must stay byte-compatible with ADOPTED_CASCADE_READY in lib.rs — the
		// adopted shared cascade reuses the fresh-spawn CASCADE_READY contract.
		const adopted =
			'{"facade_port":8910,"services":[{"kind":"tts","id":"tts"}],"adopted":true}';
		expect(localVoiceFacadeUrlFromReady(adopted)).toBe("http://127.0.0.1:8910");
	});

	it("rejects avatar-only, malformed, and missing readiness payloads", () => {
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({ facade_port: 8910, services: [{ kind: "avatar" }] }),
			),
		).toBeNull();
		expect(
			localVoiceFacadeUrlFromReady(
				JSON.stringify({ services: [{ kind: "tts" }] }),
			),
		).toBeNull();
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
				json: async () => ({
					tts_enabled: true,
					avatar_enabled: false,
					mode: "tts_only",
				}),
			}),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910/")).toEqual({
			ttsReady: true,
			avatarReady: false,
			mode: "tts_only",
		});
	});

	it("reports readiness from the standalone TensorRT health contract", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					service: "voxcpm2-tensorrt",
					capabilities: ["tts"],
					ready: true,
				}),
			}),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toEqual({
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
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();

		// A reachable port serving a different JSON body is NOT readiness.
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue({ ok: true, json: async () => ({ voices: [] }) }),
		);
		expect(await fetchLocalVoiceHealth("http://127.0.0.1:8910")).toBeNull();
	});
});
