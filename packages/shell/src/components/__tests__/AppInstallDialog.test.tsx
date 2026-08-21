// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(), entitlement: vi.fn(), purchase: vi.fn(), reload: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../../lib/app-store-client", async (original) => ({
	...(await original<typeof import("../../lib/app-store-client")>()),
	listStoreProducts: vi.fn().mockResolvedValue([{ id: "p1", app_id: "land.naia.slides", version: "1.0.0", price_credits: "10", manifest: { name: "Naia Slides", description: "Slides" } }]),
	hasStoreEntitlement: mocks.entitlement,
	purchaseStoreApp: mocks.purchase,
	getStoreGatewayUrl: vi.fn().mockReturnValue("http://localhost:8000"),
}));
vi.mock("../../lib/app-loader", () => ({ loadInstalledApps: mocks.reload }));
vi.mock("../../stores/app", () => ({ useAppStore: (selector: (s: unknown) => unknown) => selector({ pushModal: vi.fn(), popModal: vi.fn() }) }));

import { AppInstallDialog } from "../AppInstallDialog";

describe("AppInstallDialog store install", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.entitlement.mockReset();
		mocks.purchase.mockReset();
		mocks.invoke.mockReset().mockResolvedValue({ id: "land.naia.slides", name: "Naia Slides", path: "/tmp/slides" });
	});
	afterEach(cleanup);

	it("purchases only when ownership is absent, then installs through native verification", async () => {
		mocks.entitlement.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		render(<AppInstallDialog onClose={() => {}} />);
		fireEvent.click(await screen.findByRole("button", { name: /10 (?:크레딧|credits)/i }));
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("app_install_store", { appId: "land.naia.slides", gatewayUrl: "http://localhost:8000" }));
		expect(mocks.purchase).toHaveBeenCalledWith("land.naia.slides");
		expect(mocks.reload).toHaveBeenCalled();
	});

	it("does not purchase when entitlement verification itself fails", async () => {
		mocks.entitlement.mockRejectedValue(new Error("offline"));
		render(<AppInstallDialog onClose={() => {}} />);
		const install = await screen.findByRole("button", { name: /10 (?:크레딧|credits)/i });
		fireEvent.click(install);
		await waitFor(() => expect(install).not.toBeDisabled());
		expect(mocks.entitlement).toHaveBeenCalledTimes(1);
		expect(mocks.purchase).not.toHaveBeenCalled();
		expect(mocks.invoke).not.toHaveBeenCalled();
	});
});
