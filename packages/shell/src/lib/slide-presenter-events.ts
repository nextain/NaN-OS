export const SLIDE_PRESENTER_SPEAK_EVENT = "naia:slide-presenter-speak";
export const SLIDE_PRESENTER_CANCEL_EVENT = "naia:slide-presenter-cancel";
export const SLIDE_PRESENTER_SPEECH_RESULT_EVENT =
	"naia:slide-presenter-speech-result";

export interface SlidePresenterSpeechRequest {
	requestId: string;
	generation: number;
	page: number;
	text: string;
}

export interface SlidePresenterSpeechResult {
	requestId: string;
	generation: number;
	page: number;
	status: "finished" | "cancelled" | "failed";
	error?: string;
}

export function requestSlidePresenterSpeech(
	detail: SlidePresenterSpeechRequest,
): void {
	if (window.parent !== window) {
		window.parent.postMessage({ type: "naia-slides:speak", detail }, "*");
		return;
	}
	window.dispatchEvent(
		new CustomEvent<SlidePresenterSpeechRequest>(SLIDE_PRESENTER_SPEAK_EVENT, {
			detail,
		}),
	);
}

export function cancelSlidePresenterSpeech(
	detail: {
		requestId?: string;
		generation?: number;
	} = {},
): void {
	if (window.parent !== window) {
		window.parent.postMessage({ type: "naia-slides:cancel", detail }, "*");
		return;
	}
	window.dispatchEvent(
		new CustomEvent(SLIDE_PRESENTER_CANCEL_EVENT, { detail }),
	);
}
