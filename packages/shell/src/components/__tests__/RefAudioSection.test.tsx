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

describe("RefAudioSection", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		useCascadeAvatarStore.getState().setLocalFacadeUrl(null);
		vi.unstubAllGlobals();
	});

	it("retries local voice presets when the cascade facade becomes ready", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://localhost:8910",
			}),
		);
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("runtime is still starting"))
			.mockResolvedValue({
				ok: true,
				json: async () => ({ voices: [] }),
			});
		vi.stubGlobal("fetch", fetchMock);

		render(<RefAudioSection />);
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"http://localhost:8910/ref/voices",
			),
		);

		act(() => {
			useCascadeAvatarStore
				.getState()
				.setLocalFacadeUrl("http://127.0.0.1:8910");
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"http://127.0.0.1:8910/ref/voices",
			),
		);
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
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					voices: [
						{
							name: "ref_ko_485.wav",
							url: "http://127.0.0.1:8910/ref/audio/ref_ko_485.wav",
							gender: "female",
							lang: "ko",
							idx: 1,
							default: true,
						},
					],
				}),
			}),
		);

		render(<RefAudioSection />);

		// refresh(프리셋 fetch)가 실제로 끝난 뒤에 판정해야 구 코드의 늦은 스톰프를
		// 놓치지 않는다 — 초기값 순간 통과(공허)를 차단.
		const fetchMock = window.fetch as ReturnType<typeof vi.fn>;
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"http://127.0.0.1:8910/ref/voices",
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
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

	it("persists a non-default local preset without calling the cloud gateway", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
				voiceRefUrl: "http://127.0.0.1:8910/ref/audio/ref_ko_485.wav",
			}),
		);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				voices: [
					{
						name: "ref_ko_485.wav",
						url: "http://127.0.0.1:8910/ref/audio/ref_ko_485.wav",
						gender: "female",
						lang: "ko",
						idx: 1,
						default: true,
					},
					{
						name: "male-20s-01.wav",
						url: "http://127.0.0.1:8910/ref/audio/male-20s-01.wav",
						gender: "male",
						lang: "ko",
						idx: 1,
						default: false,
					},
				],
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<RefAudioSection />);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const details = document.querySelector("details");
		expect(details).not.toBeNull();
		(details as HTMLDetailsElement).open = true;
		fireEvent(details as HTMLDetailsElement, new Event("toggle"));

		await waitFor(() => expect(screen.getAllByText("Apply").length).toBe(2));
		fireEvent.click(screen.getAllByText("Apply")[1]);

		await waitFor(() => {
			const saved = JSON.parse(localStorage.getItem("naia-config") ?? "{}");
			expect(saved.voiceRefUrl).toBe(
				"http://127.0.0.1:8910/ref/audio/male-20s-01.wav",
			);
		});
		expect(fetchMock).toHaveBeenCalled();
		expect(
			fetchMock.mock.calls.every(
				([url]) => url === "http://127.0.0.1:8910/ref/voices",
			),
		).toBe(true);
	});

	it("starts Naia Local and downloads the preset before preview playback", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				ttsProvider: "naia-local-voice",
				vllmTtsHost: "http://127.0.0.1:8910",
			}),
		);
		const sampleUrl = "http://127.0.0.1:8910/ref/audio/male-20s-01.wav";
		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url.endsWith("/ref/voices")) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						voices: [
							{
								name: "male-20s-01.wav",
								url: sampleUrl,
								gender: "male",
								lang: "ko",
								idx: 1,
								default: true,
							},
						],
					}),
				});
			}
			return Promise.resolve({
				ok: true,
				blob: async () => new Blob(["wav"], { type: "audio/wav" }),
			});
		});
		const play = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal(
			"Audio",
			class {
				preload = "";
				onended: (() => void) | null = null;
				onerror: (() => void) | null = null;
				pause = vi.fn();
				play = play;
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preset-preview");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const ensureLocalVoiceReady = vi.fn().mockResolvedValue(true);

		render(
			<RefAudioSection ensureLocalVoiceReady={ensureLocalVoiceReady} />,
		);
		await waitFor(() => expect(screen.getByText("Play")).toBeDefined());
		fireEvent.click(screen.getByText("Play"));

		await waitFor(() => {
			expect(ensureLocalVoiceReady).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith(sampleUrl);
			expect(play).toHaveBeenCalledTimes(1);
		});
	});
});
