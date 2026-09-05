// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	copyBundledAssets: vi.fn(),
	getAdkPath: vi.fn(),
	readNaiaConfig: vi.fn(),
	setAdkPath: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/api/path", () => ({
	homeDir: vi.fn().mockResolvedValue("C:\\Users\\Public"),
	join: vi.fn(async (...parts: string[]) => parts.join("\\")),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/adk-store", () => ({
	copyBundledAssets: mocks.copyBundledAssets,
	getAdkPath: mocks.getAdkPath,
	readNaiaConfig: mocks.readNaiaConfig,
	setAdkPath: mocks.setAdkPath,
}));
vi.mock("../../lib/config", () => ({
	NAIA_WEB_BASE_URL: "https://www.naia.land",
}));
vi.mock("../../lib/i18n", () => ({
	getLocale: () => "ko",
	t: (key: string) => key,
}));
vi.mock("../../lib/slots/model", () => ({
	NAIA_SLOT_DEFAULTS: { main: { model: "gemini-test" } },
	applyNaiaSlotDefaults: (config: unknown) => config,
}));

import { AdkSetupScreen } from "../AdkSetupScreen";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function openNewSetup(container: HTMLElement) {
	const card = container.querySelector<HTMLButtonElement>(
		".adk-setup-option-card",
	);
	expect(card).not.toBeNull();
	fireEvent.click(card!);
	await waitFor(() =>
		expect(container.querySelector(".adk-setup-confirm-btn")).not.toBeNull(),
	);
}

describe("AdkSetupScreen operation locking", () => {
	beforeEach(() => {
		mocks.invoke.mockReset();
		mocks.copyBundledAssets.mockReset().mockResolvedValue(undefined);
		mocks.getAdkPath.mockReset().mockReturnValue("");
		mocks.readNaiaConfig.mockReset().mockResolvedValue(null);
		mocks.setAdkPath.mockReset().mockResolvedValue(undefined);
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it("keeps new setup controls locked until path persistence completes", async () => {
		const pathGate = deferred<void>();
		mocks.setAdkPath.mockReturnValue(pathGate.promise);
		mocks.invoke.mockImplementation((command: string) => {
			if (command === "workspace_detect_adk_root") return Promise.resolve("");
			if (command === "inspect_adk_dir") return Promise.resolve("empty");
			return Promise.resolve(undefined);
		});
		const onComplete = vi.fn();
		const { container } = render(<AdkSetupScreen onComplete={onComplete} />);
		await openNewSetup(container);

		const input =
			container.querySelector<HTMLInputElement>(".adk-setup-input")!;
		fireEvent.change(input, { target: { value: "C:\\tmp\\naia-adk" } });
		const confirm = container.querySelector<HTMLButtonElement>(
			".adk-setup-confirm-btn",
		)!;
		fireEvent.click(confirm);

		await waitFor(() => expect(mocks.setAdkPath).toHaveBeenCalledTimes(1));
		expect(confirm.disabled).toBe(true);
		expect(input.disabled).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>(".adk-setup-back")?.disabled,
		).toBe(true);
		fireEvent.click(confirm);
		expect(
			mocks.invoke.mock.calls.filter(
				([command]) => command === "inspect_adk_dir",
			),
		).toHaveLength(1);

		pathGate.resolve();
		await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
	});

	// 워크스페이스를 통째로 지우는 것은 되돌릴 수 없다
	// (UC-QUALITY-DESTRUCTIVE-AFFORDANCE). 확인을 거절하면 지우는 호출이
	// 아예 일어나지 않아야 한다 — 묻기만 하고 답과 무관하게 지우면 확인은
	// 장식이다.
	it("does not touch the workspace when the user declines the confirmation", async () => {
		mocks.invoke.mockImplementation((command: string) => {
			if (command === "workspace_detect_adk_root") return Promise.resolve("");
			if (command === "inspect_adk_dir") return Promise.resolve("has_other_files");
			return Promise.resolve(undefined);
		});
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

		const { container } = render(<AdkSetupScreen onComplete={vi.fn()} />);
		await openNewSetup(container);
		fireEvent.click(
			container.querySelector<HTMLButtonElement>(".adk-setup-confirm-btn")!,
		);
		await screen.findByText("adk.setup.exists.filesTitle");
		fireEvent.click(
			screen.getByText("adk.setup.exists.recreate").closest("button")!,
		);

		expect(globalThis.confirm).toHaveBeenCalledTimes(1);
		expect(
			mocks.invoke.mock.calls.filter(
				([command]) => command === "delete_naia_adk",
			),
		).toHaveLength(0);
	});

	it("prevents duplicate delete and recreate transactions", async () => {
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
		const deleteGate = deferred<void>();
		mocks.invoke.mockImplementation((command: string) => {
			if (command === "workspace_detect_adk_root") return Promise.resolve("");
			if (command === "inspect_adk_dir") {
				return Promise.resolve("has_other_files");
			}
			if (command === "delete_naia_adk") return deleteGate.promise;
			return Promise.resolve(undefined);
		});
		const onComplete = vi.fn();
		const { container } = render(<AdkSetupScreen onComplete={onComplete} />);
		await openNewSetup(container);
		fireEvent.click(
			container.querySelector<HTMLButtonElement>(".adk-setup-confirm-btn")!,
		);
		await screen.findByText("adk.setup.exists.filesTitle");

		const recreate = screen
			.getByText("adk.setup.exists.recreate")
			.closest("button") as HTMLButtonElement;
		fireEvent.click(recreate);
		fireEvent.click(recreate);
		await waitFor(() =>
			expect(
				mocks.invoke.mock.calls.filter(
					([command]) => command === "delete_naia_adk",
				),
			).toHaveLength(1),
		);
		expect(recreate.disabled).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>(".adk-setup-back")?.disabled,
		).toBe(true);

		deleteGate.resolve();
		await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
	});
});
