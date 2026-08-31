import {
	SLIDE_PRESENTER_CANCEL_EVENT,
	SLIDE_PRESENTER_SPEAK_EVENT,
	SLIDE_PRESENTER_SPEECH_RESULT_EVENT,
	type SlidePresenterSpeechRequest,
	type SlidePresenterSpeechResult,
} from "./slide-presenter-events";

// Installed apps run in an asset-protocol iframe; only that origin may drive TTS.
const ALLOWED_ORIGIN = "http://asset.localhost";

/**
 * Bridge slide-presenter speech between an installed Slides app (asset.localhost
 * iframe) and the Shell's TTS pipeline in ChatArea.
 *
 * The built-in Slides app dispatches `SLIDE_PRESENTER_SPEAK_EVENT` as a window
 * CustomEvent that ChatArea already handles. An installed Slides app runs in an
 * iframe, so `requestSlidePresenterSpeech` posts `naia-slides:speak` to the
 * parent instead — but nothing re-dispatched it as the window event, so
 * narration never entered TTS, no `speech-finished` came back, and presenting
 * stalled on the first slide (2026-09-01 rehearsal: installed deck stuck at
 * 1/63 in real WebView2). This forwards speak/cancel from the iframe into the
 * window events ChatArea listens for, and forwards the resulting
 * `SLIDE_PRESENTER_SPEECH_RESULT_EVENT` back to the requesting iframe as
 * `naia-slides:speech-result`, closing the loop so the deck auto-advances.
 *
 * Call once from App.tsx. Returns a cleanup function.
 */
export function startSlidePresenterIframeBridge(): () => void {
	let slidesFrame: Window | null = null;

	const onMessage = (event: MessageEvent) => {
		if (event.origin !== ALLOWED_ORIGIN) return;
		const data = event.data as
			| { type?: string; detail?: unknown }
			| null
			| undefined;
		if (!data || typeof data !== "object") return;
		if (data.type === "naia-slides:speak") {
			// Remember the requesting frame so results route back to it only.
			slidesFrame = event.source as Window | null;
			window.dispatchEvent(
				new CustomEvent<SlidePresenterSpeechRequest>(
					SLIDE_PRESENTER_SPEAK_EVENT,
					{ detail: data.detail as SlidePresenterSpeechRequest },
				),
			);
		} else if (data.type === "naia-slides:cancel") {
			window.dispatchEvent(
				new CustomEvent(SLIDE_PRESENTER_CANCEL_EVENT, {
					detail: data.detail ?? {},
				}),
			);
		}
	};

	const onResult = (event: Event) => {
		if (!slidesFrame) return;
		const detail = (event as CustomEvent<SlidePresenterSpeechResult>).detail;
		slidesFrame.postMessage(
			{ type: "naia-slides:speech-result", detail },
			ALLOWED_ORIGIN,
		);
	};

	window.addEventListener("message", onMessage);
	window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
	};
}
