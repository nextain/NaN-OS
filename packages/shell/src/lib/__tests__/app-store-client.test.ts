import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../config", () => ({
	DEFAULT_GATEWAY_URL: "ws://localhost:18789",
	loadConfig: vi.fn(() => ({
		gatewayUrl: "ws://localhost:18789/",
	})),
}));

import { getStoreGatewayUrl, hasStoreEntitlement } from "../app-store-client";

describe("app-store-client", () => {
	beforeEach(() => { vi.restoreAllMocks(); invoke.mockReset(); });

	it("derives the HTTP gateway used for native entitlement checks", () => {
		expect(getStoreGatewayUrl()).toBe("http://localhost:18789");
	});

	it("checks ownership behind native IPC", async () => {
		invoke.mockResolvedValue(true);
		await expect(hasStoreEntitlement("slides")).resolves.toBe(true);
		expect(invoke).toHaveBeenCalledWith("app_store_has_entitlement", { appId: "slides", gatewayUrl: "http://localhost:18789" });
	});
});
