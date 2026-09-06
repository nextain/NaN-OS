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
 *
 * 두 번째 경계는 **하네스가 스스로 채우는 변수** 다. 실행 전 환경과 대조하는
 * 방식은 wdio 설정이 자기 손으로 넣어 주는 값을 "없다" 로 읽는다. 자격증명
 * 시딩(#547)이 들어온 뒤 기본 설정은 `NAIA_E2E_ADK_PATH` 와
 * `NAIA_E2E_ADK_FIXTURE` 를 실행 자리 아래 격리 ADK 로 잡는데, 사람이 그 둘을
 * 밖에서 채우면 화면과 네이티브가 서로 다른 워크스페이스를 보는 사고가 다시
 * 나므로 일부러 비워 두어야 한다. 그래서 이 선별이 자격증명 등급 마흔여섯 개
 * 중 서른여덟 개를 빼 버렸다. 그 사실의 출처는 설정 자신이므로 목록을 여기
 * 적지 않고 `packages/shell/e2e-tauri/harness-provided-env.mjs` 에서 읽는다 —
 * 시딩 모듈도 같은 곳을 읽는다.
 */
import { harnessProvidedEnv } from "../../packages/shell/e2e-tauri/harness-provided-env.mjs";

/** 이 스펙을 돌릴 wdio 설정. 인벤토리가 비워 두면 기본 설정이다. */
export function confOf(spec) {
	return (spec.conf ?? [])[0] ?? "wdio.conf.ts";
}

/**
 * 요구 환경이 갖춰진 스펙과 그렇지 않은 스펙을 가른다.
 *
 * `env` 는 `process.env` 를 그대로 받아도 되지만, 테스트가 자기 사전을 넘길 수
 * 있게 인자로 둔다. 빈 문자열은 없는 것으로 본다 — 셸에서 `FOO=` 로 지운 키가
 * 있는 것으로 읽히면 그 스펙이 자격증명 없이 돌아 죽는다.
 *
 * `harnessProvided` 는 **환경에는 없지만 그 스펙의 설정이 채워 줄** 변수다.
 * 부재로 세지 않되 사라지게 두지도 않는다 — 러너가 그 수를 찍어, 무엇이 왜
 * 부재가 아닌지 사람이 볼 수 있게 한다.
 */
export function partitionByEnv(specs, env) {
	const runnable = [];
	const envMissing = new Map();
	const harnessProvided = new Map();
	const capabilityBlocked = new Map();
	for (const spec of specs) {
		// 아직 이어지지 않은 능력을 요구하는 스펙은 돌리지 않는다.
		//
		// 요구 환경이 없는 것과 같은 성격이다 — 제품이 틀려서 실패하는 것이
		// 아니라, 그 능력이 아직 배선되지 않아 실패한다. 지우면 배선되는 날
		// 아무도 되살리지 않고, 그대로 두면 매 실행마다 사람이 제품 결함이
		// 아닌 것을 들여다본다. 그래서 빼되 이유와 추적처를 남긴다.
		const requires = spec.requires ?? [];
		if (requires.length > 0) {
			capabilityBlocked.set(spec.spec, requires);
			continue;
		}
		const filled = new Set(harnessProvidedEnv(confOf(spec), env ?? {}));
		const required = spec.env ?? [];
		const absent = [];
		const provided = [];
		for (const name of required) {
			if (env?.[name]) continue;
			// 환경에 없다. 설정이 채워 주는 이름이면 부재가 아니다.
			if (filled.has(name)) provided.push(name);
			else absent.push(name);
		}
		if (provided.length > 0) harnessProvided.set(spec.spec, provided);
		if (absent.length > 0) envMissing.set(spec.spec, absent);
		else runnable.push(spec);
	}
	return { runnable, envMissing, harnessProvided, capabilityBlocked };
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
		const conf = confOf(spec);
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
	const { runnable, envMissing, harnessProvided, capabilityBlocked } =
		partitionByEnv(specs, env);
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
	return {
		groups,
		runnable,
		envMissing,
		harnessProvided,
		capabilityBlocked,
		skippedGroups,
	};
}

/**
 * wdio 에 넘길 `--spec` 인자. 러너가 손으로 조립하면 선별과 인자가 갈라질 수
 * 있어(고른 것과 넘긴 것이 다르면 아무도 모른다) 여기서 함께 만든다.
 */
export function wdioSpecArgs(specNames) {
	return specNames.flatMap((spec) => ["--spec", `e2e-tauri/specs/${spec}`]);
}
