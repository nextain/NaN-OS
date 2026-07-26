// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadConfigWithSecrets = vi.fn();
const mockWriteNaiaUiConfig = vi.fn();

vi.mock("../../lib/config", async () => {
	const actual = await vi.importActual<typeof import("../../lib/config")>("../../lib/config");
	return {
		...actual,
		loadConfig: vi.fn(),
		loadConfigWithSecrets: (...args: unknown[]) => mockLoadConfigWithSecrets(...args),
		saveConfig: vi.fn(),
	};
});

vi.mock("../../lib/adk-store", () => ({
	writeNaiaUiConfig: (...args: unknown[]) => mockWriteNaiaUiConfig(...args),
}));

import { AiControlBar } from "../AiControlBar";
import { useAppStore } from "../../stores/app";

const baseConfig = {
	provider: "nextain" as const,
	model: "test",
	apiKey: "",
	ttsEnabled: true,
	proactiveSpeechProfile: "personal_radio_dj" as const,
};

describe("AiControlBar proactive cost control", () => {
	beforeEach(() => {
		useAppStore.setState({ ttsEnabled: true });
		mockWriteNaiaUiConfig.mockResolvedValue(true);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows a blocked control when no profile is configured", async () => {
		mockLoadConfigWithSecrets.mockResolvedValue({
			...baseConfig,
			proactiveSpeechProfile: "disabled",
		});
		render(<AiControlBar />);
		const button = await screen.findByRole("button", { name: /requires a profile and TTS/i });
		expect(button).toHaveAttribute("data-proactive-state", "blocked");
		expect(button).toHaveAttribute("aria-pressed", "false");
	});

	it("persists visible permission and requests profile start", async () => {
		mockLoadConfigWithSecrets.mockResolvedValue({
			...baseConfig,
			proactiveSpeechPermitted: false,
		});
		const requested: boolean[] = [];
		window.addEventListener("naia-proactive-permission-change", (event) => {
			requested.push((event as CustomEvent<{ permitted: boolean }>).detail.permitted);
		});
		render(<AiControlBar />);
		const button = await screen.findByRole("button", { name: /Allow proactive speech/i });
		fireEvent.click(button);
		await waitFor(() => expect(mockWriteNaiaUiConfig).toHaveBeenCalled());
		expect(requested).toEqual([true]);
	});

	it("reflects an active activity without changing permission", async () => {
		mockLoadConfigWithSecrets.mockResolvedValue({
			...baseConfig,
			proactiveSpeechPermitted: true,
		});
		render(<AiControlBar />);
		await screen.findByRole("button", { name: /Stop proactive speech/i });
		act(() => window.dispatchEvent(new CustomEvent("naia-proactive-activity-state", {
			detail: { active: true },
		})));
		expect(screen.getByRole("button", { name: /Stop proactive speech/i }))
			.toHaveAttribute("data-proactive-state", "active");
	});
});
