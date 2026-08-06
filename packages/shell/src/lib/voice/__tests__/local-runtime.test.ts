import { describe, expect, it } from "vitest";
import { localVoiceFacadeUrlFromReady } from "../local-runtime";

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
