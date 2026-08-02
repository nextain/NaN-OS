import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

import { ensureBgmSidecar } from "../bgm-sidecar-url";

describe("ensureBgmSidecar", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
	});

	it("requires the native sidecar readiness command to return true", async () => {
		mockInvoke.mockResolvedValue(true);
		await expect(ensureBgmSidecar()).resolves.toBeUndefined();
		expect(mockInvoke).toHaveBeenCalledWith("ensure_bgm_server");
	});

	it("surfaces a false native readiness result", async () => {
		mockInvoke.mockResolvedValue(false);
		await expect(ensureBgmSidecar()).rejects.toThrow("bgm_sidecar_not_ready");
	});

	it("surfaces native launch failures", async () => {
		mockInvoke.mockRejectedValue(new Error("owned health check failed"));
		await expect(ensureBgmSidecar()).rejects.toThrow("owned health check failed");
	});
});
