// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoAvatarCanvas } from "../VideoAvatarCanvas";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock("../../lib/adk-store", () => ({
	getAdkPath: () => "/adk",
	writeSlotsManifest: vi.fn(),
}));
vi.mock("../../lib/config", () => ({ loadConfig: () => ({}) }));

describe("VideoAvatarCanvas idle independence", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		invokeMock.mockImplementation((command: string) => {
			if (command === "workspace_read_file") return Promise.resolve(JSON.stringify({
				nva_version: "0.2",
				canvas: { width: 720, height: 1280 },
				animations: { idle: { clip: "idle.webm", loop: true } },
			}));
			if (command === "cascade_status") return Promise.resolve(false);
			return Promise.reject(new Error(`unexpected ${command}`));
		});
	});

	it("keeps the local idle video visible when cascade is unavailable", async () => {
		const { container } = render(<VideoAvatarCanvas nvaModel="naia" />);
		await waitFor(() => expect(container.querySelector("[data-video-avatar-idle]")).not.toBeNull());
		const video = container.querySelector("[data-video-avatar-idle]") as HTMLVideoElement;
		expect(video.src).toContain("/adk/naia-settings/nva-files/naia/idle.webm");
		expect(container.querySelector("[data-video-avatar-status]")).toBeNull();
	});
});
