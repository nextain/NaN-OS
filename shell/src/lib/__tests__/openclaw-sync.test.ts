import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock dependencies added for facts-in-SOUL.md feature
const mockLoadConfig = vi.fn();
vi.mock("../config", () => ({
	loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

const mockGetAllFacts = vi.fn().mockResolvedValue([]);
vi.mock("../db", () => ({
	getAllFacts: (...args: unknown[]) => mockGetAllFacts(...args),
}));

vi.mock("../i18n", () => ({ getLocale: () => "ko" }));
vi.mock("../logger", () => ({ Logger: { warn: vi.fn(), info: vi.fn() } }));

import { syncToOpenClaw } from "../openclaw-sync";

beforeEach(() => {
	mockInvoke.mockClear();
	mockLoadConfig.mockReturnValue(null);
	mockGetAllFacts.mockResolvedValue([]);
});

describe("syncToOpenClaw", () => {
	it("passes provider and model to Tauri command", async () => {
		await syncToOpenClaw("gemini", "gemini-3-flash-preview");
		expect(mockInvoke).toHaveBeenCalledWith(
			"sync_openclaw_config",
			expect.objectContaining({
				params: expect.objectContaining({
					provider: "gemini",
					model: "gemini-3-flash-preview",
				}),
			}),
		);
	});

	it("passes TTS settings to Tauri command", async () => {
		await syncToOpenClaw(
			"gemini",
			"gemini-3-flash-preview",
			undefined, // apiKey
			undefined, // persona
			undefined, // agentName
			undefined, // userName
			undefined, // _systemPrompt
			undefined, // locale
			undefined, // discordDmChannelId
			undefined, // discordDefaultUserId
			"edge", // ttsProvider
			"ko-KR-SunHiNeural", // ttsVoice
			"inbound", // ttsAuto
			"final", // ttsMode
		);

		const callArgs = mockInvoke.mock.calls[0];
		const params = callArgs[1].params;
		expect(params.tts_provider).toBe("edge");
		expect(params.tts_voice).toBe("ko-KR-SunHiNeural");
		expect(params.tts_auto).toBe("inbound");
		expect(params.tts_mode).toBe("final");
	});

	it("sends null for omitted TTS fields", async () => {
		await syncToOpenClaw("gemini", "gemini-3-flash-preview");

		const callArgs = mockInvoke.mock.calls[0];
		const params = callArgs[1].params;
		expect(params.tts_provider).toBeNull();
		expect(params.tts_voice).toBeNull();
		expect(params.tts_auto).toBeNull();
		expect(params.tts_mode).toBeNull();
	});

	it("includes facts in persona (SOUL.md) when facts exist", async () => {
		mockGetAllFacts.mockResolvedValue([
			{
				id: "f1",
				key: "birthday",
				value: "1990-01-15",
				source_session: null,
				created_at: 0,
				updated_at: 0,
			},
			{
				id: "f2",
				key: "favorite_food",
				value: "pizza",
				source_session: null,
				created_at: 0,
				updated_at: 0,
			},
		]);

		await syncToOpenClaw("gemini", "gemini-3-flash-preview");

		const callArgs = mockInvoke.mock.calls[0];
		const persona: string = callArgs[1].params.persona;
		expect(persona).toContain("birthday: 1990-01-15");
		expect(persona).toContain("favorite_food: pizza");
	});

	it("ignores _systemPrompt parameter and always builds internally", async () => {
		mockLoadConfig.mockReturnValue({
			persona: "Custom persona",
			userName: "Luke",
		});

		await syncToOpenClaw(
			"gemini",
			"gemini-3-flash-preview",
			undefined, // apiKey
			undefined, // persona (will fall back to config)
			undefined, // agentName
			undefined, // userName
			"This should be ignored", // _systemPrompt
		);

		const callArgs = mockInvoke.mock.calls[0];
		const persona: string = callArgs[1].params.persona;
		// Should contain config persona, NOT the passed systemPrompt
		expect(persona).toContain("Custom persona");
		expect(persona).not.toBe("This should be ignored");
		expect(persona).toContain("Luke");
	});

	it("merges caller overrides with config fallbacks", async () => {
		mockLoadConfig.mockReturnValue({
			persona: "You are Naia (낸), a friendly AI companion.",
			agentName: "Naia",
			userName: "ConfigUser",
			discordDefaultUserId: "config-discord-id",
		});

		// Caller passes agentName override but not userName
		await syncToOpenClaw(
			"gemini",
			"gemini-3-flash-preview",
			undefined, // apiKey
			undefined, // persona (falls back to config)
			"CallerAgent", // agentName override
		);

		const callArgs = mockInvoke.mock.calls[0];
		const persona: string = callArgs[1].params.persona;
		// agentName override replaces "Naia (낸)" in persona text
		expect(persona).toContain("CallerAgent");
		expect(persona).not.toContain("Naia (낸)");
		// userName should fall back to config
		expect(persona).toContain("ConfigUser");
	});

	it("builds prompt without facts when getAllFacts fails", async () => {
		mockGetAllFacts.mockRejectedValue(new Error("DB error"));

		await syncToOpenClaw("gemini", "gemini-3-flash-preview");

		// Should still call invoke (not throw)
		expect(mockInvoke).toHaveBeenCalledWith(
			"sync_openclaw_config",
			expect.objectContaining({
				params: expect.objectContaining({ provider: "gemini" }),
			}),
		);
		// Persona should not contain "Known facts"
		const persona: string = mockInvoke.mock.calls[0][1].params.persona;
		expect(persona).not.toContain("Known facts");
	});
});
