/**
 * wdio 출력에서 **스펙 하나가 시작·끝났다는 사실**만 뽑아 즉시 흘린다.
 *
 * 왜 필요한가: 러너는 자식 wdio 를 붙들어(`stdio: pipe`) 끝날 때까지 아무것도
 * 보여 주지 않았다. 자격증명 등급 한 묶음이 마흔한 개, 한 시간이다. 그동안
 * 사람은 몇 번째가 도는지 알 수 없어서, 실제로 앱이 남긴 흔적 파일의 수정 시각을
 * 뒤져 진행을 추정했다. 그것은 관측이 아니라 점술이다.
 *
 * 여기서 재는 것은 wdio 스펙 리포터의 세 줄이다. 워커 접두(`[0-3]`)와 세션
 * 이름(`tauri` 또는 아직 정해지지 않은 `undefined`)은 실행마다 다르므로 무시하고,
 * 판정과 스펙 파일 이름만 본다.
 *
 *   [0-0] RUNNING in undefined - file:///e2e-tauri/specs/01-app-launch.spec.ts
 *   [0-0] PASSED  in tauri     - file:///e2e-tauri/specs/01-app-launch.spec.ts
 *   [0-10] FAILED in undefined - file:///e2e-tauri/specs/21-cron-recurring.spec.ts
 *
 * 경계: 이것은 **진행 표시**이지 판정이 아니다. 무엇이 통과했는지는 실행이 끝난
 * 뒤 같은 출력을 다시 파싱해 정한다(`parseSpecOutcomes`). 진행 줄을 판정으로
 * 쓰면 중간에 끊긴 출력이 곧 결과가 된다.
 */

/** `RUNNING|PASSED|FAILED in <세션> - …/<이름>.spec.ts` 한 줄. */
const EVENT = /\b(RUNNING|PASSED|FAILED)\s+in\s+\S+\s+-\s+.*?([\w.-]+\.spec\.ts)/;

/**
 * 한 줄에서 진행 사건을 읽는다. 사건이 아니면 null.
 *
 * `kind` 는 `start` / `pass` / `fail` 셋이다. 리포터의 낱말을 그대로 쓰지 않는
 * 이유는, 부르는 쪽이 리포터 형식을 알 필요가 없어야 하기 때문이다.
 */
export function progressEvent(rawLine) {
	const match = EVENT.exec(String(rawLine ?? ""));
	if (!match) return null;
	const kind =
		match[1] === "RUNNING" ? "start" : match[1] === "PASSED" ? "pass" : "fail";
	return { kind, spec: match[2] };
}

/**
 * 화면에 흘릴 한 줄.
 *
 * 초를 붙이는 이유: 어느 스펙이 오래 끄는지가 한 시간짜리 실행에서 가장 알고
 * 싶은 것이다. 시작 줄을 못 본 스펙은 초를 모르므로 아예 적지 않는다 — 0초라고
 * 적으면 잰 것처럼 보인다.
 */
export function formatProgress({ done, total, kind, spec, seconds }) {
	const mark = kind === "pass" ? "✓" : "✗";
	const time = Number.isFinite(seconds) ? ` (${Math.round(seconds)}s)` : "";
	return `[regression] ${done}/${total} ${mark} ${spec}${time}`;
}

/**
 * 줄 단위로 먹여 주면 진행을 세어 주는 작은 상태.
 *
 * 스트림은 줄 경계로 오지 않으므로 부르는 쪽이 조각을 이어 붙여야 한다. 그
 * 이음매를 여기 두면 부르는 쪽이 실수할 자리가 하나 줄고, 이 계약이 그 이음매도
 * 함께 잰다.
 */
export function createProgressTracker(total, now = () => Date.now()) {
	const startedAt = new Map();
	let done = 0;
	return {
		/** 한 줄을 먹인다. 화면에 적을 것이 생기면 그 문자열을, 아니면 null. */
		feed(rawLine) {
			const event = progressEvent(rawLine);
			if (!event) return null;
			if (event.kind === "start") {
				startedAt.set(event.spec, now());
				return null;
			}
			done += 1;
			const began = startedAt.get(event.spec);
			startedAt.delete(event.spec);
			return formatProgress({
				done,
				total,
				kind: event.kind,
				spec: event.spec,
				seconds: began === undefined ? Number.NaN : (now() - began) / 1000,
			});
		},
		get done() {
			return done;
		},
	};
}
