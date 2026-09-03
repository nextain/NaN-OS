import { describe, expect, it } from "vitest";
import { ttsTextFilter } from "../text-filter";

// #540 — 이모티콘·카오모지 전면 제거 + 한국어 숫자 읽기.
describe("ttsTextFilter speech cleanup (#540)", () => {
	it("removes kaomoji built from phonetic letters and halfwidth marks", () => {
		expect(ttsTextFilter.filter("좋아요 ｡•ᴗ•｡✨", "ko")).toBe("좋아요");
		expect(ttsTextFilter.filter("응원할게 ʕ•ᴥ•ʔ 화이팅!", "ko")).toBe(
			"응원할게 화이팅!",
		);
	});

	it("removes paren faces and stray jamo laughter", () => {
		expect(ttsTextFilter.filter("고마워요 (´▽`) ㅎㅎ", "ko")).toBe("고마워요");
		expect(ttsTextFilter.filter("슬퍼 T_T ㅠㅠ", "ko")).toBe("슬퍼");
	});

	it("normalizes Korean numbers on the ko locale", () => {
		expect(ttsTextFilter.filter("90년대 노래 틀어줘", "ko-KR")).toBe(
			"구십 년대 노래 틀어줘",
		);
		expect(ttsTextFilter.filter("3시에 알람 맞춰 줘", "ko")).toBe(
			"세 시에 알람 맞춰 줘",
		);
	});

	it("normalizes Korean numbers for non-BCP-47 voices when the text is Korean", () => {
		// 로컬 음성은 voice 이름이 locale 형식이 아니라 fallback 규칙으로 온다.
		expect(ttsTextFilter.filter("90년대 음악이 좋아", "naia-local")).toBe(
			"구십 년대 음악이 좋아",
		);
	});

	it("leaves numbers alone for non-Korean locales and non-Korean text", () => {
		expect(ttsTextFilter.filter("It came out in the 90s.", "en-US")).toBe(
			"It came out in the 90s.",
		);
		expect(ttsTextFilter.filter("42% 完了です", "ja-JP")).toBe("42% 完了です");
	});
});
