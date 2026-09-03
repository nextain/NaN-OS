import { describe, expect, it } from "vitest";
import {
	digitWiseKorean,
	nativeKoreanCounting,
	normalizeKoreanNumbers,
	sinoKoreanNumber,
} from "../ko-number-reading";

describe("sinoKoreanNumber", () => {
	it("reads basic sino-Korean numbers", () => {
		expect(sinoKoreanNumber(0)).toBe("영");
		expect(sinoKoreanNumber(5)).toBe("오");
		expect(sinoKoreanNumber(10)).toBe("십");
		expect(sinoKoreanNumber(42)).toBe("사십이");
		expect(sinoKoreanNumber(90)).toBe("구십");
		expect(sinoKoreanNumber(1990)).toBe("천구백구십");
	});

	it("drops the leading 일 for 만 but keeps it for 억", () => {
		expect(sinoKoreanNumber(10000)).toBe("만");
		expect(sinoKoreanNumber(123456)).toBe("십이만 삼천사백오십육");
		expect(sinoKoreanNumber(100000000)).toBe("일억");
	});
});

describe("nativeKoreanCounting", () => {
	it("reads determiner-form native numerals", () => {
		expect(nativeKoreanCounting(1)).toBe("한");
		expect(nativeKoreanCounting(3)).toBe("세");
		expect(nativeKoreanCounting(4)).toBe("네");
		expect(nativeKoreanCounting(20)).toBe("스무");
		expect(nativeKoreanCounting(21)).toBe("스물한");
		expect(nativeKoreanCounting(99)).toBe("아흔아홉");
	});
});

describe("digitWiseKorean", () => {
	it("reads digit strings one digit at a time", () => {
		expect(digitWiseKorean("010")).toBe("공일공");
		expect(digitWiseKorean("1234")).toBe("일이삼사");
	});
});

describe("normalizeKoreanNumbers", () => {
	it("reads decades and years with sino-Korean numerals — never digit-wise", () => {
		expect(normalizeKoreanNumbers("90년대 음악 틀어줘")).toBe(
			"구십 년대 음악 틀어줘",
		);
		expect(normalizeKoreanNumbers("1990년대")).toBe("천구백구십 년대");
		expect(normalizeKoreanNumbers("2026년 9월 3일")).toBe(
			"이천이십육 년 구 월 삼 일",
		);
	});

	it("splits native and sino counters by the unit table", () => {
		expect(normalizeKoreanNumbers("3시 30분에 만나")).toBe(
			"세 시 삼십 분에 만나",
		);
		expect(normalizeKoreanNumbers("사과 21개")).toBe("사과 스물한 개");
		expect(normalizeKoreanNumbers("3개월 걸려")).toBe("삼 개월 걸려");
		expect(normalizeKoreanNumbers("2시간 기다렸어")).toBe(
			"두 시간 기다렸어",
		);
	});

	it("reads decimals, comma groups, and symbol units", () => {
		expect(normalizeKoreanNumbers("진행률 42%")).toBe("진행률 사십이 퍼센트");
		expect(normalizeKoreanNumbers("기온 25℃")).toBe("기온 이십오 도");
		expect(normalizeKoreanNumbers("평점 3.5점")).toBe("평점 삼 점 오 점");
		expect(normalizeKoreanNumbers("1,200원")).toBe("천이백 원");
	});

	it("reads separator digit groups digit-wise", () => {
		expect(normalizeKoreanNumbers("010-1234")).toBe("공일공 일이삼사");
	});

	it("reads a bare number with sino-Korean numerals", () => {
		expect(normalizeKoreanNumbers("답은 7이야")).toBe("답은 칠이야");
	});
});
