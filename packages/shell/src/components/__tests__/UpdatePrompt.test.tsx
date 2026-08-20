// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../lib/logger", () => ({
	Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const pushModal = vi.fn();
const popModal = vi.fn();
vi.mock("../../stores/app", () => ({
	useAppStore: (selector: (state: unknown) => unknown) =>
		selector({ pushModal, popModal }),
}));

import { setLocale } from "../../lib/i18n";
import type { UpdateInfo } from "../../lib/updater";
import { UpdatePrompt } from "../UpdatePrompt";

function updateInfo(
	installFn = vi.fn().mockResolvedValue(undefined),
): UpdateInfo {
	return {
		currentVersion: "0.2.0",
		version: "0.3.0",
		body: "새로운 시작 업데이트 안내",
		installFn,
	};
}

describe("UpdatePrompt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setLocale("ko");
	});
	afterEach(() => cleanup());

	it("shows release versions without starting the update", () => {
		const info = updateInfo();
		render(<UpdatePrompt info={info} onLater={() => {}} />);

		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
		expect(screen.getByText("현재 버전: 0.2.0")).toBeTruthy();
		expect(screen.getByText("새 버전: 0.3.0")).toBeTruthy();
		expect(info.installFn).not.toHaveBeenCalled();
		expect(pushModal).toHaveBeenCalledOnce();
	});

	it("keeps keyboard focus inside the modal and applies Escape dismissal", () => {
		const onLater = vi.fn();
		render(<UpdatePrompt info={updateInfo()} onLater={onLater} />);

		const checkbox = screen.getByRole("checkbox", {
			name: "한 달간 보지 않기",
		});
		const install = screen.getByRole("button", { name: "지금 업데이트" });
		expect(document.activeElement).toBe(install);

		fireEvent.keyDown(install, { key: "Tab" });
		expect(document.activeElement).toBe(checkbox);
		fireEvent.click(checkbox);
		fireEvent.keyDown(checkbox, { key: "Escape" });
		expect(onLater).toHaveBeenCalledWith(true);
	});

	it("passes the one-month choice only when the user selects Later", () => {
		const onLater = vi.fn();
		const info = updateInfo();
		render(<UpdatePrompt info={info} onLater={onLater} />);

		fireEvent.click(
			screen.getByRole("checkbox", { name: "한 달간 보지 않기" }),
		);
		expect(info.installFn).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "나중에" }));

		expect(onLater).toHaveBeenCalledWith(true);
		expect(info.installFn).not.toHaveBeenCalled();
	});

	it("installs only after explicit confirmation and surfaces a failure", async () => {
		const installFn = vi
			.fn()
			.mockRejectedValueOnce(new Error("signature mismatch"))
			.mockResolvedValueOnce(undefined);
		render(<UpdatePrompt info={updateInfo(installFn)} onLater={() => {}} />);

		const installButton = screen.getByRole("button", { name: "지금 업데이트" });
		fireEvent.click(installButton);
		expect(installFn).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"업데이트를 설치하지 못했습니다",
			),
		);
		expect(installButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(installButton);
		await waitFor(() => expect(installFn).toHaveBeenCalledTimes(2));
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
