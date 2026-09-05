/**
 * 회귀 러너가 **무엇을 wdio 에 넘길지** 정하는 자리.
 *
 * 왜 따로 두는가: 러너는 실기 스펙 수십 개를 십몇 분 동안 돌리는 프로그램이라,
 * 그 선별이 옳은지 확인하려면 매번 그 십몇 분을 다시 써야 했다. 그래서 아무도
 * 확인하지 않았고, 확인하지 않은 자리에서 실제로 어긋났다 —
 * `docs/regression-runs/naia-os-3090-2026-09-05T18-02-15-115Z.json` 을 보면
 * 러너가 "환경이 없어 건너뛸 스펙 3개" 라고 찍어 놓고 그 셋을 그대로 wdio 에
 * 넘겼다. `96-voice-linux-app-start.spec.ts` 는 `before all` 훅에서 키가 없다며
 * 죽어 `stableFailures` 에 올랐고, `88-stt-tts-combo-verification.spec.ts` 는
 * `executed` 에 올라 **돌지 않은 것이 통과로** 세어졌다.
 *
 * 기록이 두 갈래로 거짓이 된다. 환경 부재가 결함처럼 보이고(사람이 없는 버그를
 * 찾는다), 동시에 재지 않은 것이 덮인 것으로 보인다. 게다가 러너는 실패한
 * 스펙을 한 번 더 돌리므로, 없는 환경을 두 번 확인하는 데 시간을 쓴다.
 *
 * 그래서 선별을 순수 함수로 떼어 낸다. 입력은 스펙 목록과 환경 변수 사전뿐이고
 * 프로세스도 파일도 건드리지 않으므로, `src/test/regression-selection.contract.test.ts`
 * 가 그날의 기계 상태와 무관하게 이 판단을 고정할 수 있다.
 *
 * 경계: 여기서 뺀 스펙은 **사라지지 않는다.** 러너가 `envMissingBeforeRun` 에
 * 그대로 적고, `scripts/check-regression-complete.mjs` 가 그것을 "요구 환경이
 * 없던 스펙 — 이것은 통과가 아니다" 로 세어 게이트를 붉힌다. 빼는 것은
 * 실행에서일 뿐이고, 판정에서 빼는 것이 아니다.
 */

/**
 * 요구 환경이 갖춰진 스펙과 그렇지 않은 스펙을 가른다.
 *
 * `env` 는 `process.env` 를 그대로 받아도 되지만, 테스트가 자기 사전을 넘길 수
 * 있게 인자로 둔다. 빈 문자열은 없는 것으로 본다 — 셸에서 `FOO=` 로 지운 키가
 * 있는 것으로 읽히면 그 스펙이 자격증명 없이 돌아 죽는다.
 */
export function partitionByEnv(specs, env) {
	const runnable = [];
	const envMissing = new Map();
	for (const spec of specs) {
		const absent = (spec.env ?? []).filter((name) => !(env?.[name] ?? ""));
		if (absent.length > 0) envMissing.set(spec.spec, absent);
		else runnable.push(spec);
	}
	return { runnable, envMissing };
}

/**
 * 스펙을 wdio 설정별로 묶는다.
 *
 * 예전에는 무엇이든 `wdio.conf.ts` 로 넘겼는데, 열일곱 개 스펙은 전용 설정이
 * 준비하는 환경(격리된 프로필, 자체 사이드카, 다른 바이너리) 없이는 반드시
 * 실패한다. 예컨대 라디오 큐 스펙은 전용 설정의 onPrepare 가 띄우는 BGM
 * 사이드카의 /health 를 단정한다. 기본 설정으로 부르면 그 자리에서 죽는다.
 */
export function groupByConf(specs) {
	const groups = new Map();
	for (const spec of specs) {
		const conf = (spec.conf ?? [])[0] ?? "wdio.conf.ts";
		if (!groups.has(conf)) groups.set(conf, []);
		groups.get(conf).push(spec.spec);
	}
	return groups;
}

/**
 * 이 실행이 실제로 돌릴 묶음과, 돌리지 않고 기록에만 남길 것을 함께 낸다.
 *
 * `skippedGroups` 는 **그 설정의 스펙이 전부 환경 부재**인 묶음이다. 이런
 * 묶음은 아예 띄우지 않는다. 전용 설정은 onPrepare 에서 사이드카를 띄우고
 * 바이너리를 준비하므로, 돌릴 스펙이 하나도 없는데 부르면 준비 비용만 쓰고
 * 죽는다 — 위 기록의 `wdio.conf.voice-6g.ts` 가 정확히 그 모양이다(스펙 1개,
 * 통과 0, status failed, 그런데 그 하나는 환경이 없어 건너뛰기로 한 것이었다).
 */
export function planGroups(specs, env) {
	const { runnable, envMissing } = partitionByEnv(specs, env);
	const groups = groupByConf(runnable);
	const skippedGroups = [];
	for (const [conf, names] of groupByConf(specs)) {
		if (groups.has(conf)) continue;
		skippedGroups.push({
			conf,
			specs: names,
			// 왜 안 돌렸는지 기록이 스스로 말하게 한다. 이름만 남기면 다음 사람이
			// "왜 이 설정이 빠졌지" 를 소스에서 되짚어야 한다.
			reason: "이 설정의 스펙이 전부 요구 환경 없음",
		});
	}
	return { groups, runnable, envMissing, skippedGroups };
}

/**
 * wdio 에 넘길 `--spec` 인자. 러너가 손으로 조립하면 선별과 인자가 갈라질 수
 * 있어(고른 것과 넘긴 것이 다르면 아무도 모른다) 여기서 함께 만든다.
 */
export function wdioSpecArgs(specNames) {
	return specNames.flatMap((spec) => ["--spec", `e2e-tauri/specs/${spec}`]);
}
