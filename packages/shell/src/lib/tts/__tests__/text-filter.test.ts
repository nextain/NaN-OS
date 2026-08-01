import { describe, expect, it } from "vitest";
import { ttsTextFilter } from "../text-filter";

describe("ttsTextFilter", () => {
	it("removes Markdown emphasis before speech without changing the words", () => {
		expect(ttsTextFilter.filter("이건 **중요한** 내용이고 __확인__해 주세요."))
			.toBe("이건 중요한 내용이고 확인해 주세요.");
	});

	it("keeps link labels but removes URLs, code fences, emotion tags, and emoji", () => {
		expect(
			ttsTextFilter.filter(
				"[HAPPY] [문서](https://example.com)를 보세요 😊\n```ts\nconst x = 1;\n```",
			),
		).toBe("문서를 보세요");
	});

	it("removes Markdown list markers while preserving natural punctuation", () => {
		expect(ttsTextFilter.filter("- 첫 번째\n- 두 번째, 맞죠?"))
			.toBe("첫 번째 두 번째, 맞죠?");
	});
});
