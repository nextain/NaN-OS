// `harness-provided-env.mjs` 의 타입 표면.
//
// 값의 정본은 `.mjs` 한 곳이다 — 이 파일에는 값이 없고 이름과 모양만 있다.
// 정본이 `.mjs` 인 이유는 방향 때문이다: 회귀 러너의 선별 모듈이 맨 노드로 도는
// `.mjs` 라 `.ts` 를 읽을 수 없어, 정본을 `.mjs` 에 두고 `.ts` 가 읽게 뒤집었다.
// 그러면 `credentialed-adk-seed.ts` 에서 그 import 가 암묵적 any 가 되어,
// `wdio.conf.ts` 의 `credentialedSeedAvailable()` 호출까지 조용히 타입을 잃는다.
// 이름이 어긋나면 import 자리에서 바로 붉어지므로 이 선언은 갈라질 수 없다.
type HarnessEnv = Record<string, string | undefined>;

export declare const CREDENTIALED_KEY_ENV: string;
export declare const HARNESS_PROVIDED_ENV: readonly string[];
export declare const HARNESS_PROVIDED_ENV_CONFS: readonly string[];
export declare function credentialedSeedAvailable(env?: HarnessEnv): boolean;
export declare function credentialedSeedActive(env?: HarnessEnv): boolean;
export declare function harnessProvidedEnv(
	conf: string,
	env?: HarnessEnv,
): string[];
