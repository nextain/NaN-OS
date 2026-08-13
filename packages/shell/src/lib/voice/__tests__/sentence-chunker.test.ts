import { describe, expect, it } from "vitest";
import { ttsTextFilter } from "../../tts/text-filter";
import { SentenceChunker } from "../sentence-chunker";

const speakableLength = (sentence: string) =>
	ttsTextFilter.filter(sentence).length;

describe("SentenceChunker", () => {
	it("emits a complete sentence on hard punctuation", () => {
		const chunker = new SentenceChunker();
		expect(chunker.feed("오늘도 좋은 하루가 될 것 같아요! 그리고")).toEqual([
			"오늘도 좋은 하루가 될 것 같아요!",
		]);
	});

	it("holds a short sentence until the next one arrives", () => {
		const chunker = new SentenceChunker();
		expect(chunker.feed("네! ")).toEqual([]);
		expect(chunker.feed("오늘 일정 알려드릴게요.")).toEqual([
			"네! 오늘 일정 알려드릴게요.",
		]);
	});

	it("does not split on ellipsis or decimal numbers", () => {
		const chunker = new SentenceChunker();
		expect(chunker.feed("음... 버전 2.5가 맞는 것 같아요")).toEqual([]);
		expect(chunker.flush()).toBe("음... 버전 2.5가 맞는 것 같아요");
	});

	// #428: "[HAPPY] 아!" 는 raw 11자로 MIN_CHARS 를 넘지만 실제 발화는
	// "아!" 2자다. 태그가 길이를 부풀려 초단문이 단독 첫 청크로 방출되면
	// VoxCPM2 가 감탄사만 따로 합성하게 된다(첫 문장 째짐의 트리거).
	it("#428: an emotion tag must not push a tiny interjection past MIN_CHARS", () => {
		const chunker = new SentenceChunker({ speakableLength });
		expect(chunker.feed("[HAPPY] 아! ")).toEqual([]);
		expect(chunker.feed("오늘도 좋은 하루가 될 것 같아요! 그런데")).toEqual([
			"[HAPPY] 아! 오늘도 좋은 하루가 될 것 같아요!",
		]);
	});

	it("#428: emitted text keeps the emotion tag for downstream consumers", () => {
		const chunker = new SentenceChunker({ speakableLength });
		expect(chunker.feed("[SURPRISED] 어머! 정말 놀라운 소식이네요! 그리고")).toEqual([
			"[SURPRISED] 어머! 정말 놀라운 소식이네요!",
		]);
	});

	it("#428: a tag-only fragment at stream end still flushes", () => {
		const chunker = new SentenceChunker({ speakableLength });
		expect(chunker.feed("[HAPPY] 아하!")).toEqual([]);
		expect(chunker.flush()).toBe("[HAPPY] 아하!");
	});

	it("force-flushes at MAX_CHARS without punctuation", () => {
		const chunker = new SentenceChunker();
		const long = "가나다라마바사 ".repeat(20);
		const out = chunker.feed(long);
		expect(out.length).toBeGreaterThan(0);
		expect(out[0].length).toBeLessThanOrEqual(120);
	});
});
