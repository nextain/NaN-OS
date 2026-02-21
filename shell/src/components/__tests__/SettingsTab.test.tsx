import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
	convertFileSrc: vi.fn((path: string) => `file://${path}`),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { directToolCall } from "../../lib/chat-service";
vi.mock("../../lib/chat-service", () => ({
	directToolCall: vi.fn().mockResolvedValue({ success: false }),
}));

import { SettingsTab } from "../SettingsTab";

describe("SettingsTab", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders dynamic models with pricing info", async () => {
		mockInvoke.mockResolvedValue([]);
		(directToolCall as any).mockResolvedValueOnce({
			success: true,
			output: JSON.stringify({
				models: [
					{ id: "test-model-1", name: "Test Model", provider: "gemini", price: { input: 1.5, output: 2.5 } }
				]
			})
		});
		render(<SettingsTab />);
		
		await vi.waitFor(() => {
			expect(screen.getByText("Test Model ($1.5 / $2.5)")).toBeDefined();
		});
	});

	it("renders provider select and API key input", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByLabelText(/provider|프로바이더/i)).toBeDefined();
		expect(screen.getByLabelText(/^API/i)).toBeDefined();
	});

	it("renders VRM model picker with sample cards", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByAltText("Shino (Dark)")).toBeDefined();
		expect(screen.getByAltText("Shino (Light)")).toBeDefined();
		expect(screen.getByText("Girl")).toBeDefined();
		expect(screen.getByText("Boy")).toBeDefined();
	});

	it("renders background image picker with none option", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/기본 그라데이션|Default Gradient/i)).toBeDefined();
		expect(screen.getByText("Space")).toBeDefined();
	});

	it("renders VRM custom file button", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/커스텀|Custom/i)).toBeDefined();
	});

	it("selects VRM card and marks as active", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const girlCard = screen.getByTitle("Girl");
		fireEvent.click(girlCard);
		expect(girlCard.className).toContain("active");
	});

	it("renders memory section with empty state", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/기억|Memory/i)).toBeDefined();
		expect(
			screen.getByText(/저장된 기억이|No stored memories/i),
		).toBeDefined();
	});

	it("renders facts when available", async () => {
		mockInvoke.mockResolvedValue([
			{
				id: "f1",
				key: "favorite_lang",
				value: "Rust",
				source_session: null,
				created_at: 1000,
				updated_at: 1000,
			},
		]);
		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(screen.getByText("favorite_lang")).toBeDefined();
			expect(screen.getByText("Rust")).toBeDefined();
		});
	});

	it("saves config with VRM model", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		// Set API key
		const apiInput = screen.getByLabelText(/^API/i);
		fireEvent.change(apiInput, { target: { value: "test-key" } });

		// Select non-default VRM
		const girlCard = screen.getByTitle("Girl");
		fireEvent.click(girlCard);

		// Save
		fireEvent.click(screen.getByText(/save|저장/i));

		const saved = JSON.parse(
			localStorage.getItem("naia-config") || "{}",
		);
		expect(saved.apiKey).toBe("test-key");
		expect(saved.vrmModel).toBe("/avatars/vrm-ol-girl.vrm");
	});

	it("renders theme picker", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByTitle("Espresso")).toBeDefined();
		expect(screen.getByTitle("Midnight")).toBeDefined();
	});

	it("shows error for empty API key", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});
});
