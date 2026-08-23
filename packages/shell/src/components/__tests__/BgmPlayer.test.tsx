// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onAiInterferenceEvent } from "../../lib/ai-interference";
import { bgmPlayback } from "../../lib/bgm-playback";
import { useAppStore } from "../../stores/app";
import { useAvatarStore } from "../../stores/avatar";

const listeners = new Map<string, (event: { payload: string }) => void>();

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(
		(event: string, handler: (event: { payload: string }) => void) => {
			listeners.set(event, handler);
			return Promise.resolve(() => listeners.delete(event));
		},
	),
}));
vi.mock("../../lib/adk-store", () => ({
	listNaiaAssets: vi.fn().mockResolvedValue([]),
	toLocalBlobUrl: vi.fn().mockResolvedValue("blob:mock"),
}));
vi.mock("../../lib/bgm-sidecar-url", () => ({
	ensureBgmSidecar: vi.fn().mockResolvedValue(undefined),
	BGM_SIDECAR_BASE_URL: "http://localhost:18791",
}));

import { BgmPlayer } from "../BgmPlayer";

function bgmCommandHandler() {
	const handler = listeners.get("bgm_command");
	expect(handler).toBeDefined();
	return handler!;
}

async function startTrack(videoId: string, title: string) {
	bgmCommandHandler()({
		payload: JSON.stringify({ type: "bgm_youtube_play", videoId, title }),
	});
	await act(async () => {
		await Promise.resolve();
	});
}

async function enqueueTrack(videoId: string, title: string) {
	bgmCommandHandler()({
		payload: JSON.stringify({ type: "e2e_bgm_enqueue", videoId, title }),
	});
	await act(async () => {
		await Promise.resolve();
	});
}

/** Attach a `.app-bg-iframe` matching the current playbackId, the way the
 * real background-rendering component does from useAvatarStore. The YouTube
 * message handler derives eventPlaybackId from this iframe's own `src`. */
function attachIframeForCurrentPlayback(): HTMLIFrameElement {
	const src = useAvatarStore.getState().backgroundVideoUrl;
	const iframe = document.createElement("iframe");
	iframe.className = "app-bg-iframe";
	iframe.src = src;
	document.body.appendChild(iframe);
	return iframe;
}

function postYtMessage(payload: Record<string, unknown>) {
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", { data: JSON.stringify(payload) }),
		);
	});
}

describe("BgmPlayer YouTube playback state machine", () => {
	beforeEach(() => {
		bgmPlayback.reset();
		useAppStore.setState({ aiInterferenceEnabled: true });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.clearAllMocks();
		listeners.clear();
		bgmPlayback.reset();
		useAppStore.setState(useAppStore.getInitialState());
		useAvatarStore.setState(useAvatarStore.getInitialState());
		for (const iframe of document.querySelectorAll(".app-bg-iframe"))
			iframe.remove();
		localStorage.clear();
	});

	it("does not skip to another track when the 12s watchdog fires without any real evidence of failure", async () => {
		vi.useFakeTimers();
		const { container } = render(<BgmPlayer />);
		await startTrack("v1", "Song One (watchdog)");
		attachIframeForCurrentPlayback();
		await enqueueTrack("v2", "Song Two (should not play)");

		const events: string[] = [];
		const unlisten = onAiInterferenceEvent((event) =>
			events.push(event.action),
		);

		// No onStateChange/infoDelivery ever arrives — simulates a lost status
		// message on a track that may actually be playing fine.
		await act(async () => {
			vi.advanceTimersByTime(13_000);
			await Promise.resolve();
		});

		expect(
			container
				.querySelector(".bgm-player")
				?.getAttribute("data-bgm-current-title"),
		).toBe("Song One (watchdog)");
		expect(
			container
				.querySelector(".bgm-player")
				?.getAttribute("data-bgm-playback-status"),
		).toBe("timeout");
		// The old behavior called recoverAfterQueueExhausted here, which would
		// have promoted "Song Two" from the queue. It must not have.
		expect(bgmPlayback.queue().length).toBe(1);
		expect(events).toContain("music_timeout");
		expect(events).not.toContain("music_ended");
		unlisten();
	});

	it("notifies the agent when late progress recovers a diagnostic timeout", async () => {
		vi.useFakeTimers();
		const { container } = render(<BgmPlayer />);
		await startTrack("v1", "Late Song");
		attachIframeForCurrentPlayback();
		const events: string[] = [];
		const unlisten = onAiInterferenceEvent((event) =>
			events.push(event.action),
		);

		await act(async () => {
			vi.advanceTimersByTime(13_000);
			await Promise.resolve();
		});
		postYtMessage({
			event: "infoDelivery",
			info: { currentTime: 2, duration: 180 },
		});

		expect(container.querySelector(".bgm-player")).toHaveAttribute(
			"data-bgm-playback-status",
			"playing",
		);
		expect(events).toEqual(
			expect.arrayContaining(["music_timeout", "music_recovered"]),
		);
		unlisten();
	});

	it("promotes requested/loading to playing from infoDelivery progress alone, surviving a lost onStateChange message", async () => {
		vi.useFakeTimers();
		const { container } = render(<BgmPlayer />);
		await startTrack("v1", "Song One (info-delivery)");
		attachIframeForCurrentPlayback();

		// No onStateChange "playing" (state=1) ever arrives — only infoDelivery,
		// simulating the documented WebView2 handshake-loss case.
		postYtMessage({
			event: "infoDelivery",
			info: { currentTime: 5, duration: 200 },
		});

		expect(
			container
				.querySelector(".bgm-player")
				?.getAttribute("data-bgm-playback-status"),
		).toBe("playing");

		// The 12s watchdog must not override a status it already knows is playing.
		await act(async () => {
			vi.advanceTimersByTime(13_000);
			await Promise.resolve();
		});
		expect(
			container
				.querySelector(".bgm-player")
				?.getAttribute("data-bgm-playback-status"),
		).toBe("playing");
	});

	it("notifies the agent the moment a track genuinely ends, not from the watchdog timer", async () => {
		render(<BgmPlayer />);
		await startTrack("v1", "Song One (ended)");
		attachIframeForCurrentPlayback();

		const events: { action: string; summary?: string }[] = [];
		const unlisten = onAiInterferenceEvent((event) =>
			events.push({ action: event.action, summary: event.summary }),
		);

		postYtMessage({ event: "onStateChange", info: 0 });

		expect(events).toHaveLength(1);
		expect(events[0].action).toBe("music_ended");
		expect(events[0].summary).toContain("Song One (ended)");
		unlisten();
	});
});
