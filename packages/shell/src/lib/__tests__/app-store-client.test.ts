import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../config", () => ({
	DEFAULT_GATEWAY_URL: "ws://localhost:18789",
	loadConfig: vi.fn(() => ({
		gatewayUrl: "ws://localhost:18789/",
	})),
}));

import { hasStoreEntitlement, listStoreProducts, purchaseStoreApp } from "../app-store-client";

describe("app-store-client", () => {
	beforeEach(() => { vi.restoreAllMocks(); invoke.mockReset(); });

	it("does not require credentials for the public catalog", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);
		await expect(listStoreProducts()).resolves.toEqual([]);
		expect(fetchMock).toHaveBeenCalledWith("http://localhost:18789/v1/apps/products");
	});

	it("keeps purchase credentials behind native IPC", async () => {
		invoke.mockResolvedValue(undefined);
		await purchaseStoreApp("slides");
		expect(invoke).toHaveBeenCalledWith("app_store_purchase", expect.objectContaining({ appId: "slides", gatewayUrl: "http://localhost:18789" }));
		expect(JSON.stringify(invoke.mock.calls)).not.toContain("user-key");
	});

	it("checks ownership behind native IPC", async () => {
		invoke.mockResolvedValue(true);
		await expect(hasStoreEntitlement("slides")).resolves.toBe(true);
		expect(invoke).toHaveBeenCalledWith("app_store_has_entitlement", { appId: "slides", gatewayUrl: "http://localhost:18789" });
	});
});
