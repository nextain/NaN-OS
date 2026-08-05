// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarStore } from "../../stores/avatar";
import { useCascadeAvatarStore } from "../../stores/cascade-avatar";
import { VideoAvatarCanvas } from "../VideoAvatarCanvas";

const testState = vi.hoisted(() => ({
	vramGb: 8,
	config: {
		provider: "nextain",
		model: "gemini-3.5-flash",
		naiaKey: "nk",
		localGpuTier: "laptop-4060-8g",
		avatarProvider: "naia-video-avatar",
	},
}));

const mockInvoke = vi.hoisted(() => vi.fn());
const mockToLocalBlobUrl = vi.hoisted(() => vi.fn());
const mockWriteSlotsManifest = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../../lib/adk-store", () => ({
	getAdkPath: () => "D:\\alpha-adk",
	toLocalBlobUrl: (...args: unknown[]) => mockToLocalBlobUrl(...args),
	writeSlotsManifest: (...args: unknown[]) => mockWriteSlotsManifest(...args),
}));

vi.mock("../../lib/capabilities/gpu", () => ({
	detectGpuVramGb: () => Promise.resolve(testState.vramGb),
}));

vi.mock("../../lib/config", () => ({
	loadConfig: () => testState.config,
	loadConfigWithSecrets: () => Promise.resolve(testState.config),
}));

vi.mock("../../lib/avatar/cascade-renderer", () => ({
	CascadeAvatarRenderer: class {
		start() {}
		stop() {}
		setVoice() {
			return Promise.resolve();
		}
	},
	ensureRemoteCharacter: vi.fn().mockResolvedValue(undefined),
	localCascadeUrlFromConfig: () => undefined,
	localFacadeUrlFromReady: (ready: string) =>
		ready.includes("8910") ? "http://127.0.0.1:8910" : undefined,
	probeCascadeHealth: vi.fn().mockResolvedValue(false),
	remoteCascadeUrlFromConfig: () => undefined,
}));

const MANIFEST_BASE64 = btoa(
	JSON.stringify({
		nva_version: "0.2",
		canvas: { width: 512, height: 512 },
		animations: {
			idle: { clip: "clips/idle.webm", loop: true, can_talk: false },
			talking: { clip: "clips/talking.mp4", loop: true, can_talk: true },
		},
		expressions: { neutral: "idle", speaking: "talking" },
	}),
);

describe("VideoAvatarCanvas idle-first contract", () => {
	beforeEach(() => {
		testState.vramGb = 8;
		testState.config.localGpuTier = "laptop-4060-8g";
		mockToLocalBlobUrl.mockImplementation((path: string) =>
			Promise.resolve(
				path.endsWith("talking.mp4") ? "blob:nva-talking" : "blob:nva-idle",
			),
		);
		mockWriteSlotsManifest.mockResolvedValue(undefined);
		mockInvoke.mockImplementation((command: string) => {
			if (command === "read_local_binary")
				return Promise.resolve(MANIFEST_BASE64);
			if (command === "cascade_status") return Promise.resolve(false);
			if (command === "start_cascade") {
				return Promise.reject(new Error("TensorRT is still initializing"));
			}
			return Promise.resolve(undefined);
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn(),
		});
		useCascadeAvatarStore.getState().setLocalFacadeUrl(null);
		useAvatarStore.getState().setSpeaking(false);
	});

	afterEach(() => {
		cleanup();
		useCascadeAvatarStore.getState().setLocalFacadeUrl(null);
		useAvatarStore.getState().setSpeaking(false);
		vi.clearAllMocks();
	});

	it("keeps the manifest idle clip visible when cascade startup fails", async () => {
		const { container } = render(<VideoAvatarCanvas nvaModel="naia.nva" />);

		await vi.waitFor(() =>
			expect(container.querySelector("[data-video-avatar-idle]")).toBeTruthy(),
		);
		const idle = container.querySelector("[data-video-avatar-idle]");
		expect(idle).toHaveAttribute("src", "blob:nva-idle");
		await vi.waitFor(() =>
			expect(mockInvoke).toHaveBeenCalledWith("start_cascade", {
				expectedLoaderProfile: "windows_trt_8g",
			}),
		);
		expect(container.querySelector("[data-video-avatar-idle]")).toBeTruthy();
		expect(
			container
				.querySelector("[data-video-avatar]")
				?.getAttribute("data-video-avatar-error"),
		).toContain("cascade-start-failed");
	});

	it("retry requests another cascade start without removing the idle clip", async () => {
		const { container } = render(<VideoAvatarCanvas nvaModel="naia.nva" />);
		await vi.waitFor(() => {
			expect(
				mockInvoke.mock.calls.filter(
					([command]) => command === "start_cascade",
				),
			).toHaveLength(1);
		});

		fireEvent.click(await screen.findByTestId("nva-retry"));

		await vi.waitFor(() => {
			expect(
				mockInvoke.mock.calls.filter(([command]) => command === "start_cascade")
					.length,
			).toBeGreaterThanOrEqual(2);
		});
		expect(container.querySelector("[data-video-avatar-idle]")).toBeTruthy();
	});

	it("never starts the local cascade below 8GB and follows the TTS speaking state with stored clips", async () => {
		testState.vramGb = 6;
		const { container } = render(<VideoAvatarCanvas nvaModel="naia.nva" />);

		await vi.waitFor(() => {
			expect(
				container
					.querySelector("[data-video-avatar]")
					?.getAttribute("data-video-avatar-mode"),
			).toBe("fallback");
		});
		expect(mockInvoke).not.toHaveBeenCalledWith("start_cascade");
		expect(container.querySelector("[data-video-avatar-idle]")).toHaveAttribute(
			"src",
			"blob:nva-idle",
		);

		act(() => useAvatarStore.getState().setSpeaking(true));
		await vi.waitFor(() =>
			expect(
				container.querySelector("[data-video-avatar-talking]"),
			).toHaveAttribute("src", "blob:nva-talking"),
		);

		act(() => useAvatarStore.getState().setSpeaking(false));
		await vi.waitFor(() =>
			expect(container.querySelector("[data-video-avatar-idle]")).toBeTruthy(),
		);
	});

	it("uses fallback playback without a local profile", async () => {
		testState.config.localGpuTier = "off";
		const { container } = render(<VideoAvatarCanvas nvaModel="naia.nva" />);

		await vi.waitFor(() => {
			expect(
				container
					.querySelector("[data-video-avatar]")
					?.getAttribute("data-video-avatar-mode"),
			).toBe("fallback");
		});
		expect(
			container
				.querySelector("[data-video-avatar]")
				?.getAttribute("data-video-avatar-mode"),
		).toBe("fallback");
		expect(container.querySelector("[data-video-avatar-status]")).toBeNull();
		expect(mockInvoke).not.toHaveBeenCalledWith("start_cascade");
	});
});
