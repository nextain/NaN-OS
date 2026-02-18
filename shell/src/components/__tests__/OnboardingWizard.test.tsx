import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn().mockResolvedValue(true),
	convertFileSrc: vi.fn((path: string) => `file://${path}`),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { OnboardingWizard } from "../OnboardingWizard";

describe("OnboardingWizard", () => {
	const onComplete = vi.fn();

	afterEach(() => {
		cleanup();
		onComplete.mockReset();
		localStorage.removeItem("cafelua-config");
	});

	it("renders agent name step initially", () => {
		render(<OnboardingWizard onComplete={onComplete} />);
		expect(screen.getByText(/AI 캐릭터|AI character/)).toBeDefined();
	});

	it("progresses through steps", () => {
		render(<OnboardingWizard onComplete={onComplete} />);

		// Agent name → Next
		const nextBtn = screen.getByText(/다음|Next/);
		fireEvent.click(nextBtn);

		// User name step
		expect(screen.getByText(/불러드릴|call you/)).toBeDefined();
		fireEvent.click(screen.getByText(/다음|Next/));

		// Character step (VRM)
		expect(screen.getByText(/모습|look/i)).toBeDefined();
		fireEvent.click(screen.getByText(/다음|Next/));

		// Personality step — title contains "골라주세요" or "personality"
		expect(screen.getByText(/골라주세요|Choose.*personality/i)).toBeDefined();
		fireEvent.click(screen.getByText(/다음|Next/));

		// Provider step
		expect(screen.getByText(/두뇌|brain/i)).toBeDefined();
		fireEvent.click(screen.getByText(/다음|Next/));

		// API key step
		expect(screen.getByText(/API/)).toBeDefined();
	});

	it("skip saves config and calls onComplete", () => {
		render(<OnboardingWizard onComplete={onComplete} />);
		const skipBtn = screen.getByText(/건너뛰기|Skip/);
		fireEvent.click(skipBtn);
		expect(onComplete).toHaveBeenCalled();
		const config = JSON.parse(
			localStorage.getItem("cafelua-config") || "{}",
		);
		expect(config.onboardingComplete).toBe(true);
	});

	it("complete step saves agentName, userName, persona and calls onComplete", () => {
		render(<OnboardingWizard onComplete={onComplete} />);

		// Agent name
		const agentInput = screen.getByPlaceholderText(/이름|name/i);
		fireEvent.change(agentInput, { target: { value: "Mochi" } });
		fireEvent.click(screen.getByText(/다음|Next/));

		// User name
		const nameInput = screen.getByPlaceholderText(/이름|name/i);
		fireEvent.change(nameInput, { target: { value: "Luke" } });
		fireEvent.click(screen.getByText(/다음|Next/));

		// Character (VRM) → keep default
		fireEvent.click(screen.getByText(/다음|Next/));

		// Personality → keep default
		fireEvent.click(screen.getByText(/다음|Next/));

		// Provider → keep default
		fireEvent.click(screen.getByText(/다음|Next/));

		// API key
		const apiInput = screen.getByPlaceholderText("API key...");
		fireEvent.change(apiInput, { target: { value: "test-key" } });
		fireEvent.click(screen.getByText(/다음|Next/));

		// Complete
		expect(screen.getByText(/Luke/)).toBeDefined();
		fireEvent.click(screen.getByText(/시작|Get Started/));
		expect(onComplete).toHaveBeenCalled();

		const config = JSON.parse(
			localStorage.getItem("cafelua-config") || "{}",
		);
		expect(config.userName).toBe("Luke");
		expect(config.agentName).toBe("Mochi");
		expect(config.onboardingComplete).toBe(true);
		expect(config.apiKey).toBe("test-key");
		expect(config.persona).toContain("Mochi");
	});
});
