export type SlidePresenterMode =
	| "empty"
	| "loading"
	| "ready"
	| "presenting"
	| "paused"
	| "answering"
	| "completed"
	| "error";

export interface SlidePresenterState {
	mode: SlidePresenterMode;
	page: number;
	totalPages: number;
	generation: number;
	speech: "idle" | "requested" | "speaking";
	resumeAfterAnswer: boolean;
	error?: string;
}

export type SlidePresenterAction =
	| { type: "load" }
	| { type: "loaded"; totalPages: number }
	| { type: "fail"; error: string }
	| { type: "start" }
	| { type: "pause" }
	| { type: "resume" }
	| { type: "stop" }
	| { type: "next" }
	| { type: "previous" }
	| { type: "goto"; page: number }
	| { type: "question" }
	| { type: "speech-requested"; generation: number }
	| { type: "speech-finished"; generation: number }
	| { type: "speech-cancelled"; generation: number }
	| { type: "speech-failed"; generation: number; error: string };

export const EMPTY_SLIDE_PRESENTER_STATE: SlidePresenterState = {
	mode: "empty",
	page: 1,
	totalPages: 0,
	generation: 0,
	speech: "idle",
	resumeAfterAnswer: false,
};

function boundedPage(page: number, totalPages: number): number {
	if (totalPages <= 0) return 1;
	return Math.min(totalPages, Math.max(1, Math.trunc(page)));
}

function invalidateSpeech(
	state: SlidePresenterState,
	overrides: Partial<SlidePresenterState>,
): SlidePresenterState {
	return {
		...state,
		...overrides,
		generation: state.generation + 1,
		speech: "idle",
	};
}

export function reduceSlidePresenter(
	state: SlidePresenterState,
	action: SlidePresenterAction,
): SlidePresenterState {
	switch (action.type) {
		case "load":
			return {
				...EMPTY_SLIDE_PRESENTER_STATE,
				mode: "loading",
				generation: state.generation + 1,
			};
		case "loaded": {
			const totalPages = Math.max(0, Math.trunc(action.totalPages));
			if (totalPages === 0) {
				return invalidateSpeech(state, {
					mode: "error",
					totalPages: 0,
					page: 1,
					error: "empty_pdf",
				});
			}
			return invalidateSpeech(state, {
				mode: "ready",
				totalPages,
				page: 1,
				resumeAfterAnswer: false,
				error: undefined,
			});
		}
		case "fail":
			return invalidateSpeech(state, {
				mode: "error",
				error: action.error,
			});
		case "start":
			if (state.totalPages === 0) return state;
			return {
				...invalidateSpeech(state, {
					mode: "presenting",
					page: state.mode === "completed" ? 1 : state.page,
					resumeAfterAnswer: false,
					error: undefined,
				}),
				speech: "requested",
			};
		case "pause":
			if (state.mode !== "presenting") return state;
			return invalidateSpeech(state, { mode: "paused" });
		case "resume":
			if (!["paused", "answering"].includes(state.mode)) return state;
			return {
				...invalidateSpeech(state, {
					mode: "presenting",
					resumeAfterAnswer: false,
				}),
				speech: "requested",
			};
		case "stop":
			if (state.totalPages === 0) return state;
			return invalidateSpeech(state, {
				mode: "ready",
				resumeAfterAnswer: false,
			});
		case "next": {
			if (state.totalPages === 0) return state;
			const page = boundedPage(state.page + 1, state.totalPages);
			const presenting = state.mode === "presenting";
			return {
				...invalidateSpeech(state, { page }),
				speech: presenting ? "requested" : "idle",
			};
		}
		case "previous": {
			if (state.totalPages === 0) return state;
			const page = boundedPage(state.page - 1, state.totalPages);
			const presenting = state.mode === "presenting";
			return {
				...invalidateSpeech(state, { page }),
				speech: presenting ? "requested" : "idle",
			};
		}
		case "goto": {
			if (state.totalPages === 0) return state;
			const page = boundedPage(action.page, state.totalPages);
			const presenting = state.mode === "presenting";
			return {
				...invalidateSpeech(state, { page }),
				speech: presenting ? "requested" : "idle",
			};
		}
		case "question":
			if (state.totalPages === 0) return state;
			return invalidateSpeech(state, {
				mode: "answering",
				resumeAfterAnswer: state.mode === "presenting",
			});
		case "speech-requested":
			if (
				state.mode !== "presenting" ||
				state.speech !== "requested" ||
				action.generation !== state.generation
			) {
				return state;
			}
			return { ...state, speech: "speaking" };
		case "speech-finished":
			if (
				state.mode !== "presenting" ||
				state.speech !== "speaking" ||
				action.generation !== state.generation
			) {
				return state;
			}
			if (state.page >= state.totalPages) {
				return invalidateSpeech(state, { mode: "completed" });
			}
			return {
				...invalidateSpeech(state, { page: state.page + 1 }),
				mode: "presenting",
				speech: "requested",
			};
		case "speech-failed":
			if (action.generation !== state.generation) return state;
			return invalidateSpeech(state, {
				mode: "paused",
				error: action.error,
			});
		case "speech-cancelled":
			if (
				state.mode !== "presenting" ||
				state.speech !== "speaking" ||
				action.generation !== state.generation
			) {
				return state;
			}
			return invalidateSpeech(state, { mode: "paused", error: undefined });
	}
}

export function parseSlideSpeakerNotes(markdown: string): Map<number, string> {
	const notes = new Map<number, string>();
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	let page: number | null = null;
	let buffer: string[] = [];
	const flush = () => {
		if (page == null) return;
		const note = buffer.join("\n").trim();
		if (note) notes.set(page, note);
	};
	for (const line of lines) {
		const match = line.match(/^##\s+(\d+)(?:[.)]|\s)/);
		if (match) {
			flush();
			page = Number.parseInt(match[1], 10);
			buffer = [];
			continue;
		}
		if (/^##\s+/.test(line)) {
			flush();
			page = null;
			buffer = [];
			continue;
		}
		if (page != null) buffer.push(line);
	}
	flush();
	return notes;
}

export function narrationForPage(
	page: number,
	notes: ReadonlyMap<number, string>,
	pageTexts: readonly string[],
): string {
	return (
		notes.get(page)?.trim() || pageTexts[page - 1]?.trim() || `Slide ${page}`
	);
}

export function boundedDeckContext(
	pageTexts: readonly string[],
	notes: ReadonlyMap<number, string>,
	maxCharacters = 12_000,
): string {
	const sections = pageTexts.map((text, index) => {
		const page = index + 1;
		const note = notes.get(page)?.trim();
		return [
			`[Slide ${page}]`,
			text.trim(),
			note ? `[Speaker note]\n${note}` : "",
		]
			.filter(Boolean)
			.join("\n");
	});
	return sections.join("\n\n").slice(0, Math.max(0, maxCharacters));
}
