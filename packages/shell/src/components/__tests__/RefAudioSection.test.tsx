// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCascadeAvatarStore } from "../../stores/cascade-avatar";
import { RefAudioSection } from "../RefAudioSection";

// The local (naia-local-voice) picker now browses the CLOUD catalog — the
// engine is only involved when speaking. Stub just the two gateway calls so
// picker tests need no signed-in account; everything else stays real.
vi.mock("../../lib/voice/ref-audio-api", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../lib/voice/ref-audio-api")>();
	return {
		...actual,
		getRefAudioPresets: vi.fn(),
		applyRefAudioPreset: vi.fn(),
	};
});
import {
	applyRefAudioPreset,
	getRefAudioPresets,
} from "../../lib/voice/ref-audio-api";

const CLOUD_PRESETS = [
	{
		id: "cc0-ko-female-01",
		name: "여성 음색 1",
		locale: "ko",
		gender: "female",
		durationSeconds: 8,
		sampleUrl:
			"https://stnaiapub.example/ref-audio/cc0/cc0-ko-female-01.wav",
		sampleFormat: "wav",
		source: "mozilla-common-voice",
		license: "cc0",
	},
	{
		id: "cc0-ko-male-01",
		name: "남성 음색 1",
		locale: "ko",
		gender: "male",
		durationSeconds: 8,
		sampleUrl: "https://stnaiapub.example/ref-audio/cc0/cc0-ko-male-01.wav",
		sampleFormat: "wav",
		source: "mozilla-common-voice",
		license: "cc0",
	},
];

describe("RefAudioSection", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		useCascadeAvatarStore.getState().setLocalFacadeUrl(null);
		vi.unstubAllGlobals();
	});

	it("local preset picker browses the cloud catalog and never touches the engine", async () => {
		// Regression guard for the empty-picker bug: binding the local picker to the
		// engine's /ref/voices made browse dead until the engine finished loading
		// (~77s model load) and authenticated. The picker must work engine-off.
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
			}),
		);
		// The engine is DOWN: every direct fetch (health) fails.
		const fetchMock = vi.fn().mockRejectedValue(new Error("engine down"));
		vi.stubGlobal("fetch", fetchMock);
		vi.mocked(getRefAudioPresets).mockResolvedValue(CLOUD_PRESETS);

		render(<RefAudioSection />);
		const details = document.querySelector("details");
		expect(details).not.toBeNull();
		(details as HTMLDetailsElement).open = true;
		fireEvent(details as HTMLDetailsElement, new Event("toggle"));

		// Both catalog voices render even though the engine is unreachable.
		await waitFor(() =>
			expect(screen.getAllByText("Apply").length).toBe(2),
		);
		expect(getRefAudioPresets).toHaveBeenCalledTimes(1);
		// And the picker made NO engine palette request.
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes("/ref/voices"),
			),
		).toBe(false);
	});

	it("#429: an uploaded local reference stays the active voice — presets must not stomp it", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
				// 프리셋 팔레트에 없는 값 — 구 코드는 이를 기본 프리셋 sampleUrl 로
				// 되돌려 썼다(업로드 선택 스톰프).
				voiceRefUrl: "http://127.0.0.1:8910/ref/audio/uploaded-c0ffee.wav",
			}),
		);
		// 저장된 로컬 업로드(레퍼런스 WAV base64) 존재 상태 — 실제 저장 키 사용.
		localStorage.setItem("naia.voiceRefAudioB64", btoa("RIFFfakewav"));
		// The engine may be down — refresh must not care (health probe fails).
		const fetchMock = vi.fn().mockRejectedValue(new Error("engine down"));
		vi.stubGlobal("fetch", fetchMock);
		// 녹음본이 있는 상태에서 프리셋을 고르면 그것이 사라지므로 먼저 묻는다
		// (UC-QUALITY-DESTRUCTIVE-AFFORDANCE). 이 테스트가 보는 것은 확인 이후
		// 동작이므로 승낙해 둔다.
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

		render(<RefAudioSection />);

		// Let refresh (async health probe + state updates) fully settle.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		// refresh never rewrites the stored selection over the upload.
		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.voiceRefUrl).toBe(
			"http://127.0.0.1:8910/ref/audio/uploaded-c0ffee.wav",
		);
		localStorage.removeItem("naia.voiceRefAudioB64");
	});

	it("FR-VOICE.14: shows an explicit engine-off state with an in-place start action", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
			}),
		);
		// Every request fails: /ref/voices (load) and /health (verdict) = engine off.
		const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
		vi.stubGlobal("fetch", fetchMock);
		const ensureReady = vi.fn().mockImplementation(async () => {
			// Once started, the engine serves both /health and /ref/voices.
			fetchMock.mockImplementation(async (url: unknown) =>
				String(url).endsWith("/health")
					? {
							ok: true,
							json: async () => ({ tts_enabled: true, avatar_enabled: false }),
						}
					: { ok: true, json: async () => ({ voices: [] }) },
			);
			return true;
		});

		render(<RefAudioSection ensureLocalVoiceReady={ensureReady} />);

		await waitFor(() =>
			expect(screen.getByTestId("ref-audio-engine-off")).toBeDefined(),
		);
		// An engine that is simply off must not read as a generic network error.
		expect(document.querySelector(".settings-error")).toBeNull();

		fireEvent.click(screen.getByTestId("ref-audio-engine-start"));
		await waitFor(() => expect(ensureReady).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.queryByTestId("ref-audio-engine-off")).toBeNull(),
		);
	});

	it("FR-VOICE.14: reports engine-up-but-TTS-unavailable as preparing, not an error", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(async (url: unknown) => {
				if (String(url).endsWith("/health")) {
					return {
						ok: true,
						json: async () => ({ tts_enabled: false, avatar_enabled: true }),
					};
				}
				throw new Error("voices route unavailable");
			}),
		);

		render(<RefAudioSection />);

		await waitFor(() =>
			expect(screen.getByTestId("ref-audio-engine-starting")).toBeDefined(),
		);
		expect(document.querySelector(".settings-error")).toBeNull();
	});

	it("shows recording and audio-file attachment controls for Naia Local", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ voices: [] }),
			}),
		);

		render(<RefAudioSection />);

		expect(screen.getByText("Make your voice")).toBeDefined();
		expect(screen.getByText(/Record$/)).toBeDefined();
		expect(screen.getByTestId("ref-audio-file-button").textContent).toContain(
			"Upload file",
		);
		const input = screen.getByTestId("ref-audio-file-input");
		expect(input.getAttribute("type")).toBe("file");
		expect(input.getAttribute("accept")).toBe("audio/*");
		expect(screen.getByText(/recording & upload are free/i)).toBeDefined();
	});

	it("applies a local preset by persisting config only — no gateway apply, no engine", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
				voiceRefUrl: CLOUD_PRESETS[0].sampleUrl,
			}),
		);
		const fetchMock = vi.fn().mockRejectedValue(new Error("engine down"));
		vi.stubGlobal("fetch", fetchMock);
		vi.mocked(getRefAudioPresets).mockResolvedValue(CLOUD_PRESETS);

		render(<RefAudioSection />);
		const details = document.querySelector("details");
		expect(details).not.toBeNull();
		(details as HTMLDetailsElement).open = true;
		fireEvent(details as HTMLDetailsElement, new Event("toggle"));

		await waitFor(() => expect(screen.getAllByText("Apply").length).toBe(2));
		fireEvent.click(screen.getAllByText("Apply")[1]);

		await waitFor(() => {
			const saved = JSON.parse(localStorage.getItem("naia-config") ?? "{}");
			expect(saved.voiceRefUrl).toBe(CLOUD_PRESETS[1].sampleUrl);
		});
		// Local apply is config-only: no gateway preset POST, no engine call.
		expect(applyRefAudioPreset).not.toHaveBeenCalled();
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes("/ref/voices"),
			),
		).toBe(false);
	});

	it("previews a local preset by playing its public sampleUrl directly — no engine gate", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
				voiceRefUrl: CLOUD_PRESETS[0].sampleUrl,
			}),
		);
		const fetchMock = vi.fn().mockRejectedValue(new Error("engine down"));
		vi.stubGlobal("fetch", fetchMock);
		vi.mocked(getRefAudioPresets).mockResolvedValue(CLOUD_PRESETS);
		const play = vi.fn().mockResolvedValue(undefined);
		const audioSrcs: string[] = [];
		vi.stubGlobal(
			"Audio",
			class {
				preload = "";
				onended: (() => void) | null = null;
				onerror: (() => void) | null = null;
				pause = vi.fn();
				play = play;
				constructor(src?: string) {
					if (src) audioSrcs.push(src);
				}
			},
		);
		const ensureLocalVoiceReady = vi.fn().mockResolvedValue(true);

		render(<RefAudioSection ensureLocalVoiceReady={ensureLocalVoiceReady} />);
		const details = document.querySelector("details");
		(details as HTMLDetailsElement).open = true;
		fireEvent(details as HTMLDetailsElement, new Event("toggle"));
		await waitFor(() => expect(screen.getAllByText("Play").length).toBe(2));
		fireEvent.click(screen.getAllByText("Play")[1]);

		await waitFor(() => {
			// The public catalog sample plays directly.
			expect(play).toHaveBeenCalled();
			expect(audioSrcs).toContain(CLOUD_PRESETS[1].sampleUrl);
		});
		// No engine readiness gate and no auth-gated /ref/audio download.
		expect(ensureLocalVoiceReady).not.toHaveBeenCalled();
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes("/ref/audio"),
			),
		).toBe(false);
	});
});
