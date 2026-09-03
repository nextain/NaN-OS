import { describe, expect, it } from "vitest";
import {
	decideMaskRelease,
	decideRevealGuard,
	type RevealGuardInput,
} from "../reveal-guard";

const base: RevealGuardInput = {
	active: true,
	armedGeneration: 3,
	currentGeneration: 3,
	warmingHold: false,
	canonicalLength: 120,
	alreadyRevealedLength: 0,
};

describe("정체 공개 판정", () => {
	it("홀드가 없고 새 텍스트가 있으면 재생을 앞질러 드러낸다 (#511)", () => {
		expect(decideRevealGuard(base)).toEqual({ action: "reveal" });
	});

	it("워밍업 홀드 중에는 드러내지 않고 기다린다 (#520)", () => {
		expect(decideRevealGuard({ ...base, warmingHold: true })).toEqual({
			action: "wait",
			reason: "warming-hold",
		});
	});

	it("홀드가 풀리면 그때부터 정체 판정이 다시 의미를 갖는다", () => {
		const held = decideRevealGuard({ ...base, warmingHold: true });
		expect(held.action).toBe("wait");
		expect(decideRevealGuard({ ...base, warmingHold: false }).action).toBe(
			"reveal",
		);
	});

	it("홀드 여부와 무관하게 새 텍스트가 없으면 드러내지 않는다", () => {
		for (const warmingHold of [false, true]) {
			const d = decideRevealGuard({
				...base,
				warmingHold,
				alreadyRevealedLength: 120,
			});
			expect(d.action).toBe("wait");
		}
	});

	it("이미 보여준 길이보다 되감지 않는다", () => {
		const d = decideRevealGuard({
			...base,
			canonicalLength: 80,
			alreadyRevealedLength: 120,
		});
		expect(d.action).toBe("wait");
	});

	it("턴이 바뀐 낡은 타이머는 멈춘다", () => {
		expect(decideRevealGuard({ ...base, currentGeneration: 4 })).toEqual({
			action: "stop",
		});
	});

	it("동기화가 끝났으면 멈춘다", () => {
		expect(decideRevealGuard({ ...base, active: false })).toEqual({
			action: "stop",
		});
	});

	it("홀드가 켜져 있어도 턴이 바뀌면 멈춘다 — 두 경로가 서로를 덮지 않는다", () => {
		expect(
			decideRevealGuard({ ...base, warmingHold: true, currentGeneration: 9 }),
		).toEqual({ action: "stop" });
	});
});

describe("decideMaskRelease", () => {
	const base = {
		active: true,
		armedGeneration: 3,
		currentGeneration: 3,
		llmFinished: true,
		warmingHold: false,
	};

	it("조건이 갖춰지면 마스크를 푼다", () => {
		expect(decideMaskRelease(base)).toEqual({ action: "release" });
	});

	it("홀드 중에는 풀지 않고 타이머를 다시 건다", () => {
		expect(decideMaskRelease({ ...base, warmingHold: true })).toEqual({
			action: "rearm",
		});
	});

	it("턴이 바뀌면 홀드 여부와 무관하게 멈춘다", () => {
		expect(
			decideMaskRelease({
				...base,
				currentGeneration: 4,
				warmingHold: true,
			}),
		).toEqual({ action: "stop" });
	});

	it("LLM 이 아직 안 끝났으면 풀 시점이 아니다", () => {
		expect(decideMaskRelease({ ...base, llmFinished: false })).toEqual({
			action: "stop",
		});
	});

	it("동기화가 죽었으면 멈춘다", () => {
		expect(decideMaskRelease({ ...base, active: false })).toEqual({
			action: "stop",
		});
	});
});
