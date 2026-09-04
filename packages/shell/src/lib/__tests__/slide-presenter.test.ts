import { describe, expect, it } from "vitest";
import {
	EMPTY_SLIDE_PRESENTER_STATE,
	boundedDeckContext,
	narrationForPage,
	parseSlideSpeakerNotes,
	reduceSlidePresenter,
} from "../slide-presenter";

describe("slide presenter state", () => {
	it("loads, presents, advances once, and completes at the final slide", () => {
		let state = reduceSlidePresenter(EMPTY_SLIDE_PRESENTER_STATE, {
			type: "load",
		});
		state = reduceSlidePresenter(state, { type: "loaded", totalPages: 2 });
		state = reduceSlidePresenter(state, { type: "start" });
		const firstGeneration = state.generation;
		expect(state).toMatchObject({
			mode: "presenting",
			page: 1,
			speech: "requested",
		});

		state = reduceSlidePresenter(state, {
			type: "speech-requested",
			generation: firstGeneration,
		});
		state = reduceSlidePresenter(state, {
			type: "speech-finished",
			generation: firstGeneration,
		});
		expect(state).toMatchObject({
			mode: "presenting",
			page: 2,
			speech: "requested",
		});

		const secondGeneration = state.generation;
		state = reduceSlidePresenter(state, {
			type: "speech-requested",
			generation: secondGeneration,
		});
		state = reduceSlidePresenter(state, {
			type: "speech-finished",
			generation: secondGeneration,
		});
		expect(state).toMatchObject({ mode: "completed", page: 2, speech: "idle" });
	});

	it("invalidates a late completion after pause or navigation", () => {
		let state = reduceSlidePresenter(EMPTY_SLIDE_PRESENTER_STATE, {
			type: "loaded",
			totalPages: 3,
		});
		state = reduceSlidePresenter(state, { type: "start" });
		const staleGeneration = state.generation;
		state = reduceSlidePresenter(state, {
			type: "speech-requested",
			generation: staleGeneration,
		});
		state = reduceSlidePresenter(state, { type: "pause" });
		state = reduceSlidePresenter(state, {
			type: "speech-finished",
			generation: staleGeneration,
		});
		expect(state).toMatchObject({ mode: "paused", page: 1, speech: "idle" });

		state = reduceSlidePresenter(state, { type: "goto", page: 99 });
		expect(state.page).toBe(3);
	});

	it("pauses a correlated cancelled narration instead of remaining speaking", () => {
		let state = reduceSlidePresenter(EMPTY_SLIDE_PRESENTER_STATE, {
			type: "loaded",
			totalPages: 3,
		});
		state = reduceSlidePresenter(state, { type: "start" });
		const generation = state.generation;
		state = reduceSlidePresenter(state, { type: "speech-requested", generation });
		state = reduceSlidePresenter(state, { type: "speech-cancelled", generation });
		expect(state).toMatchObject({ mode: "paused", speech: "idle" });
	});

	it("pauses for a question and resumes from the same page", () => {
		let state = reduceSlidePresenter(EMPTY_SLIDE_PRESENTER_STATE, {
			type: "loaded",
			totalPages: 5,
		});
		state = reduceSlidePresenter(state, { type: "goto", page: 3 });
		state = reduceSlidePresenter(state, { type: "start" });
		state = reduceSlidePresenter(state, { type: "question" });
		expect(state).toMatchObject({
			mode: "answering",
			page: 3,
			resumeAfterAnswer: true,
		});
		state = reduceSlidePresenter(state, { type: "resume" });
		expect(state).toMatchObject({
			mode: "presenting",
			page: 3,
			speech: "requested",
		});
	});
});

describe("slide speaker notes", () => {
	it("maps numbered level-two headings to slide notes", () => {
		const notes = parseSlideSpeakerNotes(
			"# Deck\n\n## 1. Cover\n\nHello.\n\n## 2. Market\n\nLine one.\nLine two.\n\n## Questions\n\nNot a slide.",
		);
		expect(notes.get(1)).toBe("Hello.");
		expect(notes.get(2)).toBe("Line one.\nLine two.");
		expect(notes.size).toBe(2);
	});

	it("prefers authored notes and bounds the deck context", () => {
		const notes = new Map([[1, "Authored narration"]]);
		expect(narrationForPage(1, notes, ["PDF text"])).toBe("Authored narration");
		expect(narrationForPage(2, notes, ["PDF text", "Second page"])).toBe(
			"Second page",
		);
		expect(boundedDeckContext(["a".repeat(200)], notes, 80)).toHaveLength(80);
	});
});
