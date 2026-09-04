// @vitest-environment jsdom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../lib/logger";
import {
	SLIDE_PRESENTER_CANCEL_EVENT,
	SLIDE_PRESENTER_SPEAK_EVENT,
	SLIDE_PRESENTER_SPEECH_RESULT_EVENT,
	activateSlidePresenterSpeechConsumer,
	deactivateSlidePresenterSpeechConsumer,
} from "../../lib/slide-presenter-events";
import { DeferredChatArea } from "../DeferredChatArea";

function BufferedConsumer({
	onActivated,
	onRequest,
}: {
	onActivated?: () => void;
	onRequest: (id: string) => void;
}) {
	useEffect(() => {
		const handleSpeak = (event: Event) => {
			onRequest((event as CustomEvent<{ requestId: string }>).detail.requestId);
		};
		window.addEventListener(SLIDE_PRESENTER_SPEAK_EVENT, handleSpeak);
		onActivated?.();
		return () => {
			window.removeEventListener(SLIDE_PRESENTER_SPEAK_EVENT, handleSpeak);
		};
	}, [onActivated, onRequest]);
	return <div data-testid="buffered-consumer" />;
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	deactivateSlidePresenterSpeechConsumer();
	vi.restoreAllMocks();
});

describe("DeferredChatArea", () => {
	it("renders the default chat surface without inventing a variant", async () => {
		const load = vi.fn().mockResolvedValue({
			default: ({ variant }: { variant?: string }) => (
				<div data-testid="default-chat">{variant ?? "default"}</div>
			),
		});

		render(<DeferredChatArea load={load} />);

		expect(await screen.findByTestId("default-chat")).toHaveTextContent(
			"default",
		);
		expect(load).toHaveBeenCalledOnce();
	});

	it("shows progress while the chat chunk is pending", () => {
		render(<DeferredChatArea load={() => new Promise(() => undefined)} />);
		expect(screen.getByText("Loading...")).toHaveAttribute(
			"aria-live",
			"polite",
		);
	});

	it("delivers pending slide narration once across StrictMode remount", async () => {
		let resolveLoad:
			| ((module: { default: () => JSX.Element }) => void)
			| undefined;
		const load = () =>
			new Promise<{ default: () => JSX.Element }>((resolve) => {
				resolveLoad = resolve;
			});
		const onRequest = vi.fn();
		render(
			<StrictMode>
				<DeferredChatArea load={load} />
			</StrictMode>,
		);

		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "pending-narration",
					generation: 3,
					page: 2,
					text: "Read this slide",
				},
			}),
		);
		resolveLoad?.({
			default: () => <BufferedConsumer onRequest={onRequest} />,
		});

		expect(await screen.findByTestId("buffered-consumer")).toBeInTheDocument();
		await waitFor(() => expect(onRequest).toHaveBeenCalledOnce());
		expect(onRequest).toHaveBeenCalledWith("pending-narration");
	});

	it("buffers narration for the lifetime of the mounted deferred surface", () => {
		const load = () =>
			new Promise<{ default: () => JSX.Element }>(() => undefined);
		render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "hidden-narration",
					generation: 4,
					page: 3,
					text: "Do not replay later",
				},
			}),
		);
		expect(activateSlidePresenterSpeechConsumer()?.requestId).toBe(
			"hidden-narration",
		);
	});

	it("settles buffered narration as cancelled when the surface unmounts", () => {
		const load = () =>
			new Promise<{ default: () => JSX.Element }>(() => undefined);
		const onResult = vi.fn();
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		const { unmount } = render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "unmounted-narration",
					generation: 7,
					page: 6,
					text: "Settle before unmount",
				},
			}),
		);

		unmount();
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);

		expect(onResult).toHaveBeenCalledOnce();
		expect((onResult.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
			requestId: "unmounted-narration",
			generation: 7,
			page: 6,
			status: "cancelled",
		});
	});

	it("honors cancellation after consumer activation but before handoff", async () => {
		vi.useFakeTimers();
		let resolveLoad:
			| ((module: { default: () => JSX.Element }) => void)
			| undefined;
		const load = () =>
			new Promise<{ default: () => JSX.Element }>((resolve) => {
				resolveLoad = resolve;
			});
		const onActivated = vi.fn();
		const onRequest = vi.fn();
		const onResult = vi.fn();
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "cancel-before-handoff",
					generation: 5,
					page: 4,
					text: "Cancelled narration",
				},
			}),
		);

		await act(async () => {
			resolveLoad?.({
				default: () => (
					<BufferedConsumer onActivated={onActivated} onRequest={onRequest} />
				),
			});
			await Promise.resolve();
		});
		expect(onActivated).toHaveBeenCalledOnce();
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_CANCEL_EVENT, {
				detail: { requestId: "cancel-before-handoff", generation: 5 },
			}),
		);
		await act(async () => vi.runAllTimers());
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);

		expect(onRequest).not.toHaveBeenCalled();
		expect(onResult).toHaveBeenCalledOnce();
		expect((onResult.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
			requestId: "cancel-before-handoff",
			generation: 5,
			page: 4,
			status: "cancelled",
		});
	});

	it("keeps the newest narration when it arrives during handoff", async () => {
		vi.useFakeTimers();
		let resolveLoad:
			| ((module: { default: () => JSX.Element }) => void)
			| undefined;
		const load = () =>
			new Promise<{ default: () => JSX.Element }>((resolve) => {
				resolveLoad = resolve;
			});
		const onActivated = vi.fn();
		const onRequest = vi.fn();
		const onResult = vi.fn();
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "older-narration",
					generation: 5,
					page: 4,
					text: "Older narration",
				},
			}),
		);

		await act(async () => {
			resolveLoad?.({
				default: () => (
					<BufferedConsumer onActivated={onActivated} onRequest={onRequest} />
				),
			});
			await Promise.resolve();
		});
		expect(onActivated).toHaveBeenCalledOnce();
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "newer-narration",
					generation: 6,
					page: 5,
					text: "Newer narration",
				},
			}),
		);
		await act(async () => vi.runAllTimers());
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);

		expect(onRequest).toHaveBeenCalledOnce();
		expect(onRequest).toHaveBeenCalledWith("newer-narration");
		expect(onResult).toHaveBeenCalledOnce();
		expect((onResult.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
			requestId: "older-narration",
			generation: 5,
			page: 4,
			status: "cancelled",
		});
	});

	it("routes live narration to the loaded ChatArea consumer", async () => {
		const onRequest = vi.fn();
		render(
			<DeferredChatArea
				load={() =>
					Promise.resolve({
						default: () => <BufferedConsumer onRequest={onRequest} />,
					})
				}
			/>,
		);
		expect(await screen.findByTestId("buffered-consumer")).toBeInTheDocument();
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "live-after-show",
					generation: 6,
					page: 5,
					text: "Play only once",
				},
			}),
		);

		expect(onRequest).toHaveBeenCalledOnce();
		expect(onRequest).toHaveBeenCalledWith("live-after-show");
		expect(activateSlidePresenterSpeechConsumer()).toBeNull();
	});

	it("settles buffered narration when a newer buffered request supersedes it", async () => {
		vi.useFakeTimers();
		let resolveLoad:
			| ((module: { default: () => JSX.Element }) => void)
			| undefined;
		const load = () =>
			new Promise<{ default: () => JSX.Element }>((resolve) => {
				resolveLoad = resolve;
			});
		render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "buffered-before-live",
					generation: 8,
					page: 7,
					text: "Settle this request",
				},
			}),
		);
		const onRequest = vi.fn();
		const onActivated = vi.fn();
		const onResult = vi.fn();
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "live-superseding-buffer",
					generation: 9,
					page: 8,
					text: "Play this request",
				},
			}),
		);
		await act(async () => {
			resolveLoad?.({
				default: () => (
					<BufferedConsumer onActivated={onActivated} onRequest={onRequest} />
				),
			});
			await Promise.resolve();
		});
		expect(onActivated).toHaveBeenCalledOnce();
		await act(async () => vi.runAllTimers());
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);

		expect(onRequest).toHaveBeenCalledOnce();
		expect(onRequest).toHaveBeenCalledWith("live-superseding-buffer");
		expect(onResult).toHaveBeenCalledOnce();
		expect((onResult.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
			requestId: "buffered-before-live",
			generation: 8,
			page: 7,
			status: "cancelled",
		});
	});

	it("contains a failed chunk and retries the deferred surface", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(Logger, "error").mockImplementation(() => undefined);
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error("chunk unavailable"))
			.mockResolvedValueOnce({
				default: ({ variant }: { variant?: string }) => (
					<div>Chat {variant}</div>
				),
			});

		render(
			<div>
				<span>Shell remains mounted</span>
				<DeferredChatArea variant="rail" load={load} />
			</div>,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent("Error");
		expect(screen.getByText("Shell remains mounted")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("Chat rail")).toBeInTheDocument();
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("settles buffered narration as failed when the chat chunk cannot load", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(Logger, "error").mockImplementation(() => undefined);
		let rejectLoad: ((error: Error) => void) | undefined;
		const load = () =>
			new Promise<{ default: () => JSX.Element }>((_resolve, reject) => {
				rejectLoad = reject;
			});
		const onResult = vi.fn();
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		const { unmount } = render(<DeferredChatArea load={load} />);
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "narration-during-failed-load",
					generation: 10,
					page: 9,
					text: "Cannot be delivered",
				},
			}),
		);

		await act(async () => {
			rejectLoad?.(new Error("chunk unavailable"));
		});
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		window.dispatchEvent(
			new CustomEvent(SLIDE_PRESENTER_SPEAK_EVENT, {
				detail: {
					requestId: "narration-after-failed-load",
					generation: 11,
					page: 10,
					text: "Fail immediately",
				},
			}),
		);
		unmount();
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);

		expect(onResult).toHaveBeenCalledTimes(2);
		expect((onResult.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
			requestId: "narration-during-failed-load",
			generation: 10,
			page: 9,
			status: "failed",
			error: "chat_unavailable",
		});
		expect((onResult.mock.calls[1]?.[0] as CustomEvent).detail).toEqual({
			requestId: "narration-after-failed-load",
			generation: 11,
			page: 10,
			status: "failed",
			error: "chat_unavailable",
		});
	});

	it("uses the explicit reload recovery without retrying a failed loader", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(Logger, "error").mockImplementation(() => undefined);
		const reload = vi.fn();
		const load = vi.fn().mockRejectedValue(new Error("chunk unavailable"));

		render(
			<DeferredChatArea load={load} reload={reload} reloadOnFailure={true} />,
		);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));

		expect(reload).toHaveBeenCalledOnce();
		expect(load).toHaveBeenCalledOnce();
	});
});
