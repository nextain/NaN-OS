/**
 * 정체 공개 판정 (#511, #520).
 *
 * 로컬 엔진이 느릴 때 응답이 "생각 중" 으로 무기한 숨는 것을 막으려고, 일정
 * 시간이 지나면 재생을 기다리지 않고 텍스트를 드러낸다(#511). 그런데 워밍업
 * 홀드(#519) 는 엔진이 준비될 때까지 재생을 **일부러** 멈춘 상태다. 정체가
 * 아니다.
 *
 * 두 경로가 서로의 상태를 모르면 어긋난다. 콜드 엔진에서 홀드는 5초를 쉽게
 * 넘기고(실측 RTF 7.98), 그때마다 음성보다 텍스트가 먼저 나왔다. 반대로 홀드가
 * 풀린 뒤에도 공개를 계속 미루면 응답이 숨는 원래 문제로 돌아간다.
 *
 * 판정을 여기 한곳에 둬서 규칙이 이름을 갖게 한다.
 */

export interface RevealGuardInput {
	/** 이 턴의 텍스트 동기화가 살아 있는가. 죽었으면 판정할 것이 없다. */
	active: boolean;
	/** 가드를 걸 때의 세대. 턴이 바뀌면 낡은 타이머는 버린다. */
	armedGeneration: number;
	/** 지금 세대. */
	currentGeneration: number;
	/** 워밍업 홀드가 열려 있는가. 열려 있으면 재생 지연은 의도된 것이다. */
	warmingHold: boolean;
	/** 지금까지 모인 전체 길이. */
	canonicalLength: number;
	/** 정체 공개로 이미 보여준 길이. 되감지 않는다. */
	alreadyRevealedLength: number;
}

export type RevealGuardDecision =
	/** 낡은 타이머이거나 동기화가 끝났다. 아무것도 하지 않고 멈춘다. */
	| { action: "stop" }
	/** 지금은 공개하지 않고 다시 기다린다. */
	| { action: "wait"; reason: "warming-hold" | "nothing-new" }
	/** 재생을 앞질러 텍스트를 드러낸다. */
	| { action: "reveal" };

export function decideRevealGuard(
	input: RevealGuardInput,
): RevealGuardDecision {
	if (!input.active || input.armedGeneration !== input.currentGeneration) {
		return { action: "stop" };
	}
	// 홀드 중 지연은 정체가 아니다. 홀드가 풀린 뒤부터 정체 판정이 의미를 갖는다.
	if (input.warmingHold) return { action: "wait", reason: "warming-hold" };
	if (input.canonicalLength <= input.alreadyRevealedLength) {
		return { action: "wait", reason: "nothing-new" };
	}
	return { action: "reveal" };
}

export interface MaskReleaseInput {
	/** 이 턴의 텍스트 동기화가 살아 있는가. */
	active: boolean;
	/** 해제 타이머를 걸 때의 세대. */
	armedGeneration: number;
	/** 지금 세대. */
	currentGeneration: number;
	/** LLM 이 끝났는가. 아직이면 해제할 시점이 아니다. */
	llmFinished: boolean;
	/** 워밍업 홀드가 열려 있는가. */
	warmingHold: boolean;
}

export type MaskReleaseDecision =
	/** 조건이 깨졌다. 해제하지 않고 끝낸다. */
	| { action: "stop" }
	/** 홀드 중이다. 해제를 미루고 타이머를 다시 건다. */
	| { action: "rearm" }
	/** 마스크를 풀고 전체 본문을 확정한다. */
	| { action: "release" };

/**
 * 마스크 해제 판정 (#513, #520).
 *
 * 마스크 해제는 좌초 방어다. 재생이 영영 오지 않아도 대화가 화면에서 사라지지
 * 않게, LLM 이 끝나고 일정 시간이 지나면 본문을 확정한다. 그런데 그 타이머도
 * 워밍업 홀드를 몰랐다. 콜드 엔진에서는 홀드가 그 시간을 넘기므로, 재생이 한
 * 번도 시작되지 않은 채 전체 본문이 먼저 드러났다 — 정체 가드와 같은 결함이다.
 *
 * 홀드 중에는 타이머를 다시 건다. 무기한 미루는 것이 아니다. 엔진 기동 재시도는
 * 예산이 정해져 있고, 예산이 끝나면 합성이 실패하면서 실패 경로가 본문을
 * 드러낸다. 홀드는 그 예산만큼만 해제를 늦춘다.
 */
export function decideMaskRelease(
	input: MaskReleaseInput,
): MaskReleaseDecision {
	if (
		!input.active ||
		input.armedGeneration !== input.currentGeneration ||
		!input.llmFinished
	) {
		return { action: "stop" };
	}
	if (input.warmingHold) return { action: "rearm" };
	return { action: "release" };
}
