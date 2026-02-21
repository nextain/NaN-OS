// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockListen = vi.fn().mockResolvedValue(() => {});
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (...args: unknown[]) => mockListen(...args),
}));

// Mock config
vi.mock("../../lib/config", () => ({
	loadConfig: () => ({
		provider: "gemini",
		model: "gemini-2.5-flash",
		apiKey: "test-key",
		gatewayUrl: "ws://127.0.0.1:18789",
		gatewayToken: "test-token",
		enableTools: true,
	}),
	resolveGatewayUrl: (c: any) => c?.gatewayUrl || "",
	hasApiKey: () => true,
	saveConfig: vi.fn(),
	isToolAllowed: () => true,
	addAllowedTool: vi.fn(),
}));

import { ChannelsTab } from "../ChannelsTab";

describe("ChannelsTab", () => {
	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
		mockListen.mockReset().mockResolvedValue(() => {});
		localStorage.clear();
	});

	it("shows loading state initially", () => {
		// Never resolve the chat message
		mockInvoke.mockReturnValue(new Promise(() => {}));
		render(<ChannelsTab />);
		expect(screen.getByText(/로딩|Loading/)).toBeDefined();
	});

	it("renders with data-testid", () => {
		mockInvoke.mockReturnValue(new Promise(() => {}));
		render(<ChannelsTab />);
		expect(screen.getByTestId("channels-tab")).toBeDefined();
	});

	it("shows gateway required error when no gateway URL", async () => {
		// Override config mock for this test
		const configModule = await import("../../lib/config");
		const loadConfigSpy = vi.spyOn(configModule, "loadConfig");
		loadConfigSpy.mockReturnValue({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "test-key",
		} as ReturnType<typeof configModule.loadConfig>);

		render(<ChannelsTab />);

		await waitFor(() => {
			expect(
				screen.getByText(/Gateway|게이트웨이/),
			).toBeDefined();
		});

		loadConfigSpy.mockRestore();
	});
});
