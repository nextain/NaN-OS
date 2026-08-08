// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { NvaManifest } from "../../nva";
import { canCarryAlpha, containRect, PrebakedAvatarRenderer } from "../prebaked-renderer";

describe("containRect", () => {
	it("letterboxes a portrait source inside a wider target", () => {
		const rect = containRect(200, 100, 100, 200);
		expect(rect.dh).toBe(100);
		expect(rect.dw).toBe(50);
		expect(rect.dx).toBe(75);
		expect(rect.dy).toBe(0);
	});

	it("returns an empty rect for a zero-size source or target", () => {
		expect(containRect(0, 100, 100, 100)).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
		expect(containRect(100, 100, 0, 0)).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
	});
});

describe("canCarryAlpha", () => {
	it("only webm containers can carry a real alpha channel", () => {
		expect(canCarryAlpha("clips/idle.webm")).toBe(true);
		expect(canCarryAlpha("clips/speech-ko.mp4")).toBe(false);
		expect(canCarryAlpha("clips/talking.MOV")).toBe(false);
	});
});

function baseManifest(): NvaManifest {
	return {
		nva_version: "0.2",
		canvas: { width: 100, height: 100 },
		background: { type: "transparent", color: "#cad8cc" },
		animations: {
			idle: { clip: "clips/idle.webm", loop: true, can_talk: false },
			talking: { clip: "clips/speech-ko.mp4", loop: true, can_talk: true },
		},
		speech_clips: {
			greeting: {
				clip: "clips/greeting.webm",
				locale: "ko-KR",
				text: "안녕하세요",
			},
		},
	};
}

function makeVideo(): HTMLVideoElement {
	const video = document.createElement("video");
	vi.spyOn(video, "play").mockResolvedValue();
	return video;
}

describe("PrebakedAvatarRenderer", () => {
	it("never synthesizes speech itself — it only resolves and plays clips", async () => {
		const manifest = baseManifest();
		const resolveAssetUrl = vi.fn(async (path: string) => `blob:${path}`);
		const renderer = new PrebakedAvatarRenderer({
			manifest,
			locale: "ko-KR",
			resolveAssetUrl,
		});
		expect(renderer.hasAuthoredClip("안녕하세요")).toBe(true);
		expect(renderer.hasAuthoredClip("no match")).toBe(false);
		// Not implemented in this class at all — the type itself has no speak/speakAudio.
		expect((renderer as unknown as { speak?: unknown }).speak).toBeUndefined();
	});

	it("plays the idle clip on start and the talking clip on setSpeakingVisual(true)", async () => {
		const manifest = baseManifest();
		const resolveAssetUrl = vi.fn(async (path: string) => `blob:${path}`);
		const onSpeaking = vi.fn();
		const renderer = new PrebakedAvatarRenderer({
			manifest,
			locale: "ko-KR",
			resolveAssetUrl,
			onSpeaking,
		});
		const video = makeVideo();
		const canvas = document.createElement("canvas");
		renderer.start(video, canvas);
		await Promise.resolve();
		await Promise.resolve();
		expect(resolveAssetUrl).toHaveBeenCalledWith("clips/idle.webm");

		renderer.setSpeakingVisual(true);
		await Promise.resolve();
		await Promise.resolve();
		expect(onSpeaking).toHaveBeenCalledWith(true);
		expect(resolveAssetUrl).toHaveBeenCalledWith("clips/speech-ko.mp4");

		renderer.setSpeakingVisual(false);
		await Promise.resolve();
		await Promise.resolve();
		expect(onSpeaking).toHaveBeenCalledWith(false);
		renderer.stop();
	});

	it("plays an authored clip end-to-end and returns to idle", async () => {
		const manifest = baseManifest();
		const resolveAssetUrl = vi.fn(async (path: string) => `blob:${path}`);
		const renderer = new PrebakedAvatarRenderer({
			manifest,
			locale: "ko-KR",
			resolveAssetUrl,
		});
		const video = makeVideo();
		const canvas = document.createElement("canvas");
		renderer.start(video, canvas);
		await Promise.resolve();

		const onPlaybackReady = vi.fn();
		const playPromise = renderer.playAuthoredClip("안녕하세요", {
			onPlaybackReady,
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(resolveAssetUrl).toHaveBeenCalledWith("clips/greeting.webm");
		video.dispatchEvent(new Event("playing"));
		expect(onPlaybackReady).toHaveBeenCalled();
		video.dispatchEvent(new Event("ended"));
		await playPromise;
		renderer.stop();
	});
});
