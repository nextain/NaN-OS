/**
 * 회귀 실행의 **전제가 성립했는지** 를 wdio 출력에서 센다.
 *
 * 왜 이 파일이 있는가. 2026-09-06 naia-os-3090 의 자격증명 등급 실행은 마흔 개를
 * 맡아 서른두 개가 안정 실패로 기록됐다. 그런데 그 실패의 대부분은 제품의 것이
 * 아니었다 — 서른여덟 개 스펙 중 **서른일곱이 에이전트 없이 돌았다.** 앞 세션이
 * 남긴 고아 agent 자식이 실행 자리의 리스를 쥐고 있어 다음 앱이 뇌를 띄우지
 * 못했고(`agent-core not available: agent_lease_live_blocked` 37회, 성사된 기동은
 * 3회), 앱은 멀쩡히 떠서 스펙은 계속 진행했다. 그래서 실패가 저마다 다른 자리에서
 * 났고, 사람은 그것을 win-rtx4060 의 실패와 가족별로 비교하는 헛일을 했다.
 * 자세한 것은 `docs/regression-runs/analysis-2026-09-06-credentialed.md` 에 있다.
 *
 * 문제는 결함 자체가 아니라 **기록이 그 사실을 담지 않았다는 것**이다. 기록에는
 * "서른두 개가 실패했다" 만 있었고, "그중 서른일곱 세션에 뇌가 없었다" 는 로그에만
 * 있었다. 로그는 다음 실행이 덮어쓴다. 그러면 남은 것은 제품 결함처럼 보이는
 * 숫자뿐이고, 그 숫자를 믿고 원인을 찾으면 없는 버그를 찾게 된다.
 *
 * 그래서 실행이 스스로 전제를 세어 기록에 적는다. 재는 것은 두 가지다.
 *
 *   - `agentStarts` — 에이전트가 **실제로 떴다**고 네이티브가 밝힌 줄의 수.
 *     시도(`Starting agent-core: …`)가 아니라 성사(`agent-core started`)를 센다.
 *     막힌 세션은 시도조차 찍지 않고 아래 줄만 남기므로, 성사를 세는 쪽이
 *     "뇌가 있었는가" 라는 질문에 곧장 답한다. 실측한 그 실행에서 두 문자열은
 *     똑같이 3회였다.
 *   - `leaseBlocked` — `agent_lease_live_blocked` 로 막힌 세션의 수. 0 이 아니면
 *     그 실행에는 뇌 없이 돈 스펙이 있다.
 *
 * 판정은 단순하다. 스펙 하나가 세션 하나이고 세션 하나가 앱 기동 하나이므로,
 * **돈 스펙 수만큼 에이전트가 떴어야** 한다. 4060 의 정상 실행이 그 모양이었다
 * (기동 57회 = 세션 57회, 막힘 0). 어긋나면 그 실행의 실패는 제품의 것이라고
 * 말할 수 없다.
 *
 * 경계: 이것은 **전제** 를 재는 것이지 결과를 재는 것이 아니다. 전제가 성립해도
 * 스펙은 실패할 수 있고, 그것이 진짜 신호다. 전제가 깨졌을 때 그 실행을 통과로도
 * 결함으로도 세지 않게 하는 것이 전부다.
 */

/** 에이전트가 실제로 떴다고 네이티브가 밝히는 줄. */
export const AGENT_START_MARKER = /agent-core started/;

/** 앞 세션의 고아가 쥔 리스에 막혀 뇌를 띄우지 못한 줄. */
export const LEASE_BLOCKED_MARKER = /agent_lease_live_blocked/;

/**
 * wdio 출력 한 덩어리에서 전제 지표를 센다.
 *
 * 순수 함수다 — 입력은 문자열뿐이고 파일도 프로세스도 건드리지 않으므로,
 * `src/test/run-premise.contract.test.ts` 가 실제 로그 발췌로 이 판단을 고정할
 * 수 있다. 십몇 분짜리 실행을 다시 돌리지 않고 재는 자리가 그것이다.
 */
export function countPremiseSignals(output) {
	let agentStarts = 0;
	let leaseBlocked = 0;
	for (const line of String(output ?? "").split("\n")) {
		if (AGENT_START_MARKER.test(line)) agentStarts += 1;
		if (LEASE_BLOCKED_MARKER.test(line)) leaseBlocked += 1;
	}
	return { agentStarts, leaseBlocked };
}

/** 여러 묶음의 지표를 더한다. 묶음마다 wdio 를 따로 부르기 때문이다. */
export function addPremiseSignals(left, right) {
	return {
		agentStarts: left.agentStarts + right.agentStarts,
		leaseBlocked: left.leaseBlocked + right.leaseBlocked,
	};
}

/**
 * 이 실행의 전제가 성립했는가.
 *
 * `executed` 는 리포터가 판정을 읽은 스펙의 수다. 그만큼 세션이 있었고, 세션마다
 * 에이전트가 한 번 떴어야 한다.
 */
export function judgePremise({ agentStarts, leaseBlocked, executed }) {
	const reasons = [];
	if (leaseBlocked > 0) {
		reasons.push(
			`앞 세션이 남긴 리스에 막힌 세션 ${leaseBlocked}회 — 그 스펙들은 뇌 없이 돌았다`,
		);
	}
	if (agentStarts !== executed) {
		reasons.push(
			`에이전트 기동 ${agentStarts}회가 돈 스펙 ${executed}개와 다르다`,
		);
	}
	if (reasons.length === 0) return { premise: "ok", reason: "" };
	return { premise: "invalid", reason: reasons.join(" · ") };
}
