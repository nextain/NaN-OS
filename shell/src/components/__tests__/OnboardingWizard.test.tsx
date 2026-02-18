import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn().mockResolvedValue(true),
}));

import { OnboardingWizard } from "../OnboardingWizard";

describe("OnboardingWizard", () => {
	const onComplete = vi.fn();

	afterEach(() => {
		cleanup();
		onComplete.mockReset();
		localStorage.removeItem("cafelua-config");
	});

	it("renders welcome step initially", () => {
		render(<OnboardingWizard onComplete={onComplete} />);
		expect(screen.getByText(/Cafelua OS/)).toBeDefined();
	});

	it("progresses through steps", () => {
		render(<OnboardingWizard onComplete={onComplete} />);

		// Welcome → Next
		const nextBtn = screen.getByText(/다음|Next/);
		fireEvent.click(nextBtn);

		// Name step
		expect(screen.getByText(/불러줄|call you/)).toBeDefined();
		const nameInput = screen.getByPlaceholderText(/이름|name/i);
		fireEvent.change(nameInput, { target: { value: "Luke" } });
		fireEvent.click(screen.getByText(/다음|Next/));

		// Provider step
		expect(screen.getByText(/프로바이더|provider/i)).toBeDefined();
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

	it("complete step saves userName and calls onComplete", () => {
		render(<OnboardingWizard onComplete={onComplete} />);

		// Go through all steps
		fireEvent.click(screen.getByText(/다음|Next/)); // welcome → name
		const nameInput = screen.getByPlaceholderText(/이름|name/i);
		fireEvent.change(nameInput, { target: { value: "Luke" } });
		fireEvent.click(screen.getByText(/다음|Next/)); // name → provider
		fireEvent.click(screen.getByText(/다음|Next/)); // provider → apiKey

		// Enter API key
		const apiInput = screen.getByPlaceholderText("API key...");
		fireEvent.change(apiInput, { target: { value: "test-key" } });
		fireEvent.click(screen.getByText(/다음|Next/)); // apiKey → complete

		// Complete
		expect(screen.getByText(/Luke/)).toBeDefined();
		fireEvent.click(screen.getByText(/시작|Get Started/));
		expect(onComplete).toHaveBeenCalled();

		const config = JSON.parse(
			localStorage.getItem("cafelua-config") || "{}",
		);
		expect(config.userName).toBe("Luke");
		expect(config.onboardingComplete).toBe(true);
		expect(config.apiKey).toBe("test-key");
	});
});
