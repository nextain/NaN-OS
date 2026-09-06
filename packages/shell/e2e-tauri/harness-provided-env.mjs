/**
 * **하네스가 스스로 채우는 환경 변수** 의 정본.
 *
 * 왜 이 파일이 따로 있는가. 회귀 러너는 스펙이 요구하는 환경 변수를 실행 **전**
 * 프로세스 환경과 대조해, 없으면 그 스펙을 wdio 에 넘기지 않는다. 그 판단이
 * 옳으려면 "없다" 가 정말 없다는 뜻이어야 하는데, `wdio.conf.ts` 는 자격증명
 * 시딩(#547)을 하면서 `NAIA_E2E_ADK_PATH` 와 `NAIA_E2E_ADK_FIXTURE` 를 **자기가**
 * 채운다. 밖에서 미리 넣어 두면 안 되는 값이기도 하다 — 실제 ADK 경로를 넣으면
 * 화면은 실제 ADK, 네이티브는 격리 ADK 를 보는 분리가 다시 난다(#547 댓글).
 * 그래서 사람이 일부러 비워 둔 두 변수를 러너가 "부재" 로 읽고, 자격증명 등급
 * 마흔여섯 개 중 서른여덟 개를 빼 버렸다. 시딩이 들어오기 전까지는 사람이 두
 * 변수를 늘 손으로 넘겼기 때문에 드러나지 않았다.
 *
 * 고치는 방법이 목록을 러너에 한 번 더 적는 것이면, 다음에 시딩이 변수를 하나
 * 더 채우거나 하나를 그만 채울 때 두 곳이 갈라진다. 갈라진 쪽은 아무도 보지
 * 않는다 — 실행에서만 드러나고, 실행은 십몇 분짜리다. 그래서 값을 여기 한 곳에
 * 두고, 시딩 모듈(`credentialed-adk-seed.ts`)과 선별 모듈
 * (`scripts/lib/regression-selection.mjs`)이 **둘 다 여기서 읽는다.**
 *
 * `.mjs` 인 이유는 방향 때문이다. 선별 모듈은 러너가 맨 노드로 부르는 `.mjs`
 * 라 `.ts` 를 import 할 수 없다. 그래서 정본을 `.mjs` 에 두고 `.ts` 가 읽는
 * 쪽으로 뒤집었다. `credentialed-adk-seed.ts` 는 여기서 읽은 것을 그대로 다시
 * 내보내므로, 그 모듈을 쓰던 자리(`wdio.conf.ts`, 계약 테스트)는 그대로다.
 *
 * 경계: 여기 적는 것은 **하네스가 채운다는 사실** 이지 값이 아니다. 자격증명
 * 자체는 여전히 사람이 환경에 올려야 하고, 그것이 없으면 시딩도 돌지 않는다.
 */

/**
 * 게이트웨이 키가 실린 환경 변수 **이름**. 값이 아니라 이름만 시딩이 만드는
 * config.json 에 들어간다. 러너가 자격증명 등급의 전제로 검사하는 변수와 같은
 * 이름이어야 한다 — 다르면 "전제는 있다" 고 말해 놓고 시딩만 조용히 비게 된다.
 */
export const CREDENTIALED_KEY_ENV = "NAIA_API_KEY";

/**
 * 자격증명 시딩이 켜졌을 때 기본 설정이 **자기 손으로 채우는** 환경 변수.
 *
 * `wdio.conf.ts` 의 시딩 대목과 같은 짝이다. 그 대목에서 하나를 지우거나 더하면
 * 여기도 같이 바뀌어야 하고, `src/test/regression-selection.contract.test.ts` 가
 * 설정 소스를 파서로 읽어 그 짝이 실제로 맞는지 못 박는다.
 */
export const HARNESS_PROVIDED_ENV = Object.freeze([
	"NAIA_E2E_ADK_PATH",
	"NAIA_E2E_ADK_FIXTURE",
	// 아래 넷은 **조건부로만 합성되는 에이전트 도구**의 전제다 (#567 재조준).
	// 어댑터는 배선돼 있는데 전제가 없으면 그 도구가 목록에 아예 오르지 않아,
	// 모델이 "그런 도구가 없다" 고 답한다 — 배선 부재와 구별되지 않는 모습이라
	// 실제로 한 번 미배선으로 잘못 읽혔다. 전제를 하네스가 세워 주고, 그 사실을
	// 여기 한 곳에 적어 러너·설정·문서가 같은 목록을 본다.
	"NAIA_SHELL_TOOL", // shell_exec 합성 조건
	"NAIA_NOTIFY_SLACK_WEBHOOK", // notify 합성 조건(slack)
	"NAIA_NOTIFY_DISCORD_WEBHOOK", // notify 합성 조건(discord)
	"NAIA_E2E_NOTIFY_LOG", // 스텁이 받은 것을 스펙이 읽는 자리
]);

/**
 * 위 규칙이 적용되는 wdio 설정.
 *
 * `wdio.conf.ts` 가 시딩의 주인이고, `wdio.conf.chat.ts` 는 `./wdio.conf.js` 를
 * 그대로 import 해 기반 설정으로 삼으므로 그 모듈 최상위의 시딩이 함께 돈다.
 *
 * 다른 전용 설정(codex, radio-queue, voice-*)은 여기 없다. 그쪽은 자기 환경
 * 모듈이 따로 있어 **다른 조건으로 다른 변수**를 채운다 — 예컨대
 * `wdio.conf.codex.ts` 는 `configureCodexE2eEnvironment()` 로 키와 무관하게
 * `NAIA_E2E_ADK_PATH` 를 채운다. 그것을 여기 규칙으로 뭉뚱그리면 조건이 다른
 * 것을 같은 것으로 말하게 되므로, 필요해지면 그 설정의 사실을 따로 선언한다.
 */
export const HARNESS_PROVIDED_ENV_CONFS = Object.freeze([
	"wdio.conf.ts",
	"wdio.conf.chat.ts",
]);

/** 이 환경에서 살아 있는 기본 공급자를 심을 수 있는가(= 게이트웨이 키가 있는가). */
export function credentialedSeedAvailable(env = process.env) {
	return (env?.[CREDENTIALED_KEY_ENV] ?? "").trim().length > 0;
}

/**
 * 이 환경에서 기본 설정이 실제로 시딩을 하는가.
 *
 * 두 조건이다. 게이트웨이 키가 있어야 하고(없으면 결정론 등급은 예전 그대로
 * 돈다), 밖에서 `NAIA_E2E_ADK_PATH` 를 이미 준 자리가 아니어야 한다 — 그 경우
 * 워크스페이스의 주인은 밖이고 설정은 손대지 않는다. 두 번째 조건이 참일 때는
 * 그 변수가 이미 환경에 있으므로, 여기서 거짓을 내도 선별이 손해 보지 않는다.
 */
export function credentialedSeedActive(env = process.env) {
	if ((env?.NAIA_E2E_ADK_PATH ?? "").trim()) return false;
	return credentialedSeedAvailable(env);
}

/**
 * 이 설정이 이 환경에서 채워 줄 변수 이름들.
 *
 * 선별 모듈은 이 목록에 있는 이름을 "부재" 로 세지 않는다. 목록이 비면 예전과
 * 똑같이 판단한다 — 규칙이 없는 설정에는 아무 영향이 없다는 뜻이다.
 */
export function harnessProvidedEnv(conf, env = process.env) {
	if (!HARNESS_PROVIDED_ENV_CONFS.includes(conf)) return [];
	return credentialedSeedActive(env) ? [...HARNESS_PROVIDED_ENV] : [];
}
