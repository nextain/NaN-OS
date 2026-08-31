import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../config", () => ({
	DEFAULT_GATEWAY_URL: "ws://localhost:18789",
	loadConfig: vi.fn(() => ({
		gatewayUrl: "ws://localhost:18789/",
	})),
}));

import { getStoreGatewayUrl, getStoreProductName, hasStoreEntitlement } from "../app-store-client";

describe("app-store-client", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	beforeEach(() => { vi.restoreAllMocks(); invoke.mockReset(); });

	it("derives the HTTP gateway used for native entitlement checks", () => {
		expect(getStoreGatewayUrl()).toBe("http://localhost:18789");
	});

	it("checks ownership behind native IPC", async () => {
		invoke.mockResolvedValue(true);
		await expect(hasStoreEntitlement("slides")).resolves.toBe(true);
		expect(invoke).toHaveBeenCalledWith("app_store_has_entitlement", { appId: "slides", gatewayUrl: "http://localhost:18789" });
	});

	it("resolves the localized product name from the public catalog", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [{ app_id: "land.naia.slides", manifest: { nameKo: "나이아 슬라이드" } }],
			}),
		}));

		await expect(getStoreProductName("land.naia.slides")).resolves.toBe("나이아 슬라이드");
	});

	it("does not borrow another product's name", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ app_id: "another.app", manifest: { name: "Wrong" } }] }),
		}));

		await expect(getStoreProductName("land.naia.slides")).resolves.toBeNull();
	});
});
