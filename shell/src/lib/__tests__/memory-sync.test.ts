// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock config
const mockLoadConfig = vi.fn();
vi.mock("../config", () => ({
	loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

// Mock db
const mockUpsertFact = vi.fn().mockResolvedValue(undefined);
vi.mock("../db", () => ({
	upsertFact: (...args: unknown[]) => mockUpsertFact(...args),
	getAllFacts: vi.fn().mockResolvedValue([]),
}));

// Mock memory-processor
const mockExtractFacts = vi.fn().mockResolvedValue([]);
vi.mock("../memory-processor", () => ({
	extractFacts: (...args: unknown[]) => mockExtractFacts(...args),
}));

// Mock openclaw-sync
const mockSyncToOpenClaw = vi.fn().mockResolvedValue(undefined);
vi.mock("../openclaw-sync", () => ({
	syncToOpenClaw: (...args: unknown[]) => mockSyncToOpenClaw(...args),
}));

vi.mock("../i18n", () => ({ getLocale: () => "ko" }));
vi.mock("../logger", () => ({ Logger: { warn: vi.fn(), info: vi.fn() } }));

import { syncFromOpenClawMemory } from "../memory-sync";

beforeEach(() => {
	mockInvoke.mockClear();
	mockLoadConfig.mockReturnValue({
		apiKey: "test-key",
		provider: "gemini",
		model: "gemini-3-flash",
	});
	mockExtractFacts.mockResolvedValue([]);
	mockUpsertFact.mockResolvedValue(undefined);
	mockSyncToOpenClaw.mockResolvedValue(undefined);
	localStorage.clear();
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("syncFromOpenClawMemory", () => {
	it("skips when no API key configured", async () => {
		mockLoadConfig.mockReturnValue(null);

		await syncFromOpenClawMemory();

		expect(mockInvoke).not.toHaveBeenCalled();
	});

	it("calls read_openclaw_memory_files with since_ms from localStorage", async () => {
		localStorage.setItem("naia-memory-sync-last-scan", "1000");
		mockInvoke.mockResolvedValue([]);

		await syncFromOpenClawMemory();

		expect(mockInvoke).toHaveBeenCalledWith("read_openclaw_memory_files", {
			since_ms: 1000,
		});
	});

	it("defaults since_ms to 0 when no localStorage value", async () => {
		mockInvoke.mockResolvedValue([]);

		await syncFromOpenClawMemory();

		expect(mockInvoke).toHaveBeenCalledWith("read_openclaw_memory_files", {
			since_ms: 0,
		});
	});

	it("does nothing when no new memory files", async () => {
		mockInvoke.mockResolvedValue([]);

		await syncFromOpenClawMemory();

		expect(mockExtractFacts).not.toHaveBeenCalled();
		expect(mockSyncToOpenClaw).not.toHaveBeenCalled();
	});

	it("extracts facts from memory files and upserts them", async () => {
		mockInvoke.mockResolvedValue([
			["2026-03-05-chat.md", "User said their birthday is March 5th", 2000],
		]);
		mockExtractFacts.mockResolvedValue([
			{ key: "birthday", value: "March 5th" },
		]);

		await syncFromOpenClawMemory();

		expect(mockExtractFacts).toHaveBeenCalledWith(
			[{ role: "assistant", content: "User said their birthday is March 5th" }],
			"OpenClaw memory file: 2026-03-05-chat.md",
			"test-key",
			"gemini",
		);
		expect(mockUpsertFact).toHaveBeenCalledWith(
			expect.objectContaining({
				key: "birthday",
				value: "March 5th",
				source_session: "openclaw:2026-03-05-chat.md",
			}),
		);
	});

	it("triggers syncToOpenClaw when new facts are extracted", async () => {
		mockInvoke.mockResolvedValue([["2026-03-05-chat.md", "content", 2000]]);
		mockExtractFacts.mockResolvedValue([{ key: "name", value: "Luke" }]);

		await syncFromOpenClawMemory();

		expect(mockSyncToOpenClaw).toHaveBeenCalledWith(
			"gemini",
			"gemini-3-flash",
			"test-key",
		);
	});

	it("does NOT trigger syncToOpenClaw when no facts extracted", async () => {
		mockInvoke.mockResolvedValue([
			["2026-03-05-chat.md", "no personal info here", 2000],
		]);
		mockExtractFacts.mockResolvedValue([]);

		await syncFromOpenClawMemory();

		expect(mockSyncToOpenClaw).not.toHaveBeenCalled();
	});

	it("updates lastScanMs to max mtime of processed files", async () => {
		mockInvoke.mockResolvedValue([
			["file1.md", "content1", 3000],
			["file2.md", "content2", 5000],
			["file3.md", "content3", 4000],
		]);

		await syncFromOpenClawMemory();

		expect(localStorage.getItem("naia-memory-sync-last-scan")).toBe("5000");
	});

	it("processes multiple files and accumulates facts", async () => {
		mockInvoke.mockResolvedValue([
			["file1.md", "content1", 3000],
			["file2.md", "content2", 4000],
		]);
		mockExtractFacts
			.mockResolvedValueOnce([{ key: "k1", value: "v1" }])
			.mockResolvedValueOnce([{ key: "k2", value: "v2" }]);

		await syncFromOpenClawMemory();

		expect(mockUpsertFact).toHaveBeenCalledTimes(2);
		expect(mockSyncToOpenClaw).toHaveBeenCalledTimes(1);
	});

	it("continues processing other files when one fails", async () => {
		mockInvoke.mockResolvedValue([
			["bad-file.md", "content", 3000],
			["good-file.md", "content", 4000],
		]);
		mockExtractFacts
			.mockRejectedValueOnce(new Error("LLM error"))
			.mockResolvedValueOnce([{ key: "k1", value: "v1" }]);

		await syncFromOpenClawMemory();

		// Second file should still be processed
		expect(mockUpsertFact).toHaveBeenCalledTimes(1);
		expect(mockSyncToOpenClaw).toHaveBeenCalledTimes(1);
	});

	it("handles invoke failure gracefully", async () => {
		mockInvoke.mockRejectedValue(new Error("Tauri error"));

		// Should not throw
		await syncFromOpenClawMemory();

		expect(mockExtractFacts).not.toHaveBeenCalled();
	});
});
