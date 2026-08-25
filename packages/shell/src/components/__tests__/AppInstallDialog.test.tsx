// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(), entitlement: vi.fn(), reload: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../../lib/app-store-client", async (original) => ({
	...(await original<typeof import("../../lib/app-store-client")>()),
	hasStoreEntitlement: mocks.entitlement,
	getStoreGatewayUrl: vi.fn().mockReturnValue("http://localhost:8000"),
}));
vi.mock("../../lib/app-loader", () => ({ loadInstalledApps: mocks.reload }));
vi.mock("../../stores/app", () => ({ useAppStore: (selector: (s: unknown) => unknown) => selector({ pushModal: vi.fn(), popModal: vi.fn() }) }));

import { AppInstallDialog } from "../AppInstallDialog";

describe("AppInstallDialog store install", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.entitlement.mockReset();
		mocks.invoke.mockReset().mockResolvedValue({ id: "land.naia.slides", name: "Naia Slides", path: "/tmp/slides" });
	});
	afterEach(cleanup);

	it("shows only the deep-linked app and installs after ownership verification", async () => {
		mocks.entitlement.mockResolvedValue(true);
		render(<AppInstallDialog request={{ appId: "land.naia.slides", name: "Naia Slides", storeOrigin: "https://naia.nextain.io", state: "once-1" }} onClose={() => {}} />);
		expect(screen.getByText("Naia Slides")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /설치|install/i }));
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("app_install_store", { appId: "land.naia.slides", gatewayUrl: "http://localhost:8000" }));
		expect(mocks.reload).toHaveBeenCalled();
	});

	it("does not install when ownership is absent", async () => {
		mocks.entitlement.mockResolvedValue(false);
		render(<AppInstallDialog request={{ appId: "land.naia.slides", storeOrigin: "https://naia.nextain.io", state: "once-2" }} onClose={() => {}} />);
		const install = screen.getByRole("button", { name: /설치|install/i });
		fireEvent.click(install);
		await waitFor(() => expect(install).not.toBeDisabled());
		expect(mocks.entitlement).toHaveBeenCalledTimes(1);
		expect(mocks.invoke).not.toHaveBeenCalled();
	});
});
