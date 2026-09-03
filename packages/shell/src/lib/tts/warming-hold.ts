/**
 * 워밍업 홀드 상태 (#519, #520).
 *
 * 로컬 음성 엔진이 아직 기동 중이면 합성은 실패가 아니라 대기다. synthesize 가
 * `naia:voice-model-preparing` 로 그 사실을 알리고, 채팅 화면은 "음성 모델 준비
 * 중…" 을 띄운다.
 *
 * 이 상태를 알아야 하는 곳이 채팅 화면만이 아니다. 문장 파이프라인에도 텍스트를
 * 언제 드러낼지 정하는 시한이 있고, 그 시한이 홀드를 모르면 엔진이 올라오기도
 * 전에 텍스트가 음성을 앞지른다. 그래서 상태를 한곳에서 읽는다.
 */

let warming = false;

if (typeof window !== "undefined") {
	window.addEventListener("naia:voice-model-preparing", (event) => {
		warming = !!(event as CustomEvent<boolean>).detail;
	});
}

/** 로컬 음성 엔진이 기동 중이라 재생이 의도적으로 멈춰 있는가. */
export function isVoiceWarmingHold(): boolean {
	return warming;
}

/** 테스트용 — 이벤트 없이 상태를 세운다. */
export function setVoiceWarmingHoldForTest(value: boolean): void {
	warming = value;
}
