import { describe, expect, it } from "vitest";
import { buildAdkLoginConfig, buildDesktopLoginUrl } from "../desktop-auth";

describe("ADK desktop login contract", () => {
	it("includes the portal desktop gate, loopback callback and CSRF state", () => {
		const state = "a".repeat(64);
		const url = new URL(buildDesktopLoginUrl("https://www.naia.land/", "ko", state, "embedded"));
		expect(url.pathname).toBe("/ko/login");
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			redirect: "desktop",
			app: "naia-os",
			source: "embedded",
			redirect_uri: "http://127.0.0.1:18792/auth/callback",
			state,
		});
	});

	it("makes the Naia gateway authoritative over stale direct-provider fields", () => {
		const config = buildAdkLoginConfig({
			provider: "gemini",
			model: "gemini-direct-old",
			apiKey: "stale-secret",
			llmRoles: { main: { provider: "gemini", model: "gemini-direct-old" } },
			workspaceRoot: "/workspace",
		}, "naia-key", "user-1");
		expect(config).toMatchObject({
			provider: "nextain",
			apiKey: "",
			naiaKey: "naia-key",
			naiaUserId: "user-1",
			workspaceRoot: "/workspace",
		});
		expect(config.model).not.toBe("gemini-direct-old");
		expect(config.llmRoles?.main).toEqual({ provider: "nextain", model: config.model });
	});
});
