import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "../SettingsModal";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("SettingsModal", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders provider select, API key input, and save button", () => {
		render(<SettingsModal onClose={() => {}} />);
		expect(screen.getByLabelText(/provider|프로바이더/i)).toBeDefined();
		expect(screen.getByLabelText(/^API/i)).toBeDefined();
		expect(screen.getByText(/save|저장/i)).toBeDefined();
	});

	it("shows error for empty API key on save", () => {
		render(<SettingsModal onClose={() => {}} />);
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});

	it("saves config and calls onClose", () => {
		const onClose = vi.fn();
		render(<SettingsModal onClose={onClose} />);

		const apiKeyInput = screen.getByLabelText(/^API/i);
		fireEvent.change(apiKeyInput, {
			target: { value: "test-key-123" },
		});
		fireEvent.click(screen.getByText(/save|저장/i));

		expect(onClose).toHaveBeenCalled();

		// Verify saved in localStorage
		const saved = JSON.parse(localStorage.getItem("cafelua-config") || "{}");
		expect(saved.apiKey).toBe("test-key-123");
	});

	it("renders language selector", () => {
		render(<SettingsModal onClose={() => {}} />);
		expect(screen.getByLabelText(/language|언어/i)).toBeDefined();
		expect(screen.getByText("한국어")).toBeDefined();
		expect(screen.getByText("English")).toBeDefined();
	});

	it("voice preview button calls invoke with preview_tts", async () => {
		mockInvoke.mockResolvedValue("base64audio");
		// Set API key so preview has a key to use
		localStorage.setItem(
			"cafelua-config",
			JSON.stringify({ provider: "gemini", apiKey: "test-key", model: "m" }),
		);
		render(<SettingsModal onClose={() => {}} />);

		const previewBtn = screen.getByText(/미리 듣기|preview/i);
		expect(previewBtn).toBeDefined();
		fireEvent.click(previewBtn);

		// invoke should be called with preview_tts
		await vi.waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith("preview_tts", {
				apiKey: "test-key",
				voice: "ko-KR-Neural2-A",
				text: "안녕하세요, 저는 알파예요.",
			});
		});
	});

	it("section dividers show distinct labels (no duplicate provider)", () => {
		render(<SettingsModal onClose={() => {}} />);
		const dividers = screen.getAllByText(
			/AI 설정|AI Settings|페르소나|Persona|음성|Voice/i,
		);
		// Should have 3 section dividers: persona, AI settings, voice
		expect(dividers.length).toBeGreaterThanOrEqual(3);
		// "프로바이더" should appear only once (as field label, not as section title)
		const providerTexts = screen.getAllByText(/프로바이더|provider/i);
		expect(providerTexts.length).toBe(1);
	});
});
