/**
 * 지난 기록에서 **다시 봐야 할 스펙**만 골라 낸다.
 *
 * 왜 필요한가: 지금 러너는 실패 하나를 다시 확인하려면 그 기계의 몫 전부를
 * 돌려야 한다 — 자격증명 등급이면 쉰다섯 개, 한 시간이다. 그래서 고치고 확인하는
 * 고리가 한 시간짜리가 되고, 사람은 확인을 미루거나 눈으로 때운다. 오너가 정한
 * 순서는 반대다: **실패가 나면 실패부터 잡고, 실패가 다 걷힌 뒤에 전체를 한 번
 * 돈다.**
 *
 * 무엇을 다시 보는가. 두 부류다.
 *
 *   - `executed` 에 있는데 `passedSpecs` 에 없는 것 — 돌았고 실패했다.
 *   - `planned` 에 있는데 `executed` 에 없는 것 — 아예 돌지 못했다. 묶음이
 *     중간에 죽었거나 전제가 무너져 차례가 오지 않은 자리다. 이것을 빼면
 *     "실패 0" 이 거짓이 된다 — 재지 않은 것이 통과처럼 보이는, 이 저장소가
 *     여러 번 겪은 바로 그 모양이다.
 *
 * 무엇을 빼는가. 요구 환경이 없어 애초에 wdio 에 넘기지 않은 스펙이다. 그것은
 * 실패가 아니라 준비 부족이라 다시 돌려도 같은 자리에서 같은 이유로 빠진다.
 * 다만 **보고에서는 지우지 않는다** — 사라지면 "이 기계는 왜 이것을 영영 안
 * 도는가" 를 아무도 묻지 않게 된다.
 */

import { basename } from "node:path";

/**
 * 이 기록에서 다시 볼 스펙.
 *
 * `legacy` 는 `passedSpecs` 칸이 없던 시절의 기록이라는 뜻이다. 그때는
 * `executed` 가 통과한 것만 담았으므로 "돌았는데 실패한 것" 을 알 길이 없다.
 * 그 경우 돌지 못한 것만 고르고, 부르는 쪽이 그 사실을 사람에게 말해야 한다 —
 * 조용히 적게 고르면 "실패 0" 이 다시 거짓이 된다.
 */
export function retestTargets(record) {
	const executed = new Set(record?.executed ?? []);
	const planned = record?.planned ?? record?.assigned ?? [];
	// 다시 돌려도 같은 이유로 빠지는 것들. 실패가 아니므로 재시험 대상이 아니다.
	const envMissing = new Set([
		...Object.keys(
			record?.envMissingBeforeRun ?? record?.skippedForMissingEnv ?? {},
		),
		// 능력이 아직 이어지지 않아 뺀 것(예: skill_cron — naia-agent#128).
		...Object.keys(record?.capabilityBlockedBeforeRun ?? {}),
	]);
	const legacy = !Array.isArray(record?.passedSpecs);
	const passed = new Set(record?.passedSpecs ?? []);

	const failed = legacy ? [] : [...executed].filter((s) => !passed.has(s));
	const neverRan = planned.filter((s) => !executed.has(s));
	const candidates = [...new Set([...failed, ...neverRan])].sort();

	return {
		specs: candidates.filter((s) => !envMissing.has(s)),
		// 실패가 아니므로 다시 돌리지 않되, 보고에는 남는다.
		envMissing: candidates.filter((s) => envMissing.has(s)),
		legacy,
	};
}

/**
 * 이 기계의 가장 최근 기록.
 *
 * 재시험 기록도 후보에 넣는다. 고리가 [전체 → 실패 → 재시험 → 고침 → 재시험]
 * 이므로, 두 번째 재시험은 첫 재시험이 남긴 실패를 겨눠야 한다. 전체 기록만
 * 보면 이미 고친 것을 계속 다시 돌게 된다.
 *
 * 입력은 `{ file, record }` 목록이다 — 파일을 읽는 일은 부르는 쪽에 둔다.
 */
export function pickLatestRecord(entries, machine) {
	let best = null;
	let bestAt = Number.NEGATIVE_INFINITY;
	for (const entry of entries) {
		const record = entry?.record;
		if (!record || record.machine !== machine) continue;
		const at = Date.parse(record.finished ?? record.started ?? "");
		if (Number.isNaN(at)) continue;
		if (at <= bestAt) continue;
		bestAt = at;
		best = entry;
	}
	return best;
}

/** 기록 파일 이름만. 기록의 `retestOf` 에 적히는 값이다. */
export function retestSourceName(file) {
	return basename(String(file ?? ""));
}

/**
 * 이 기록이 재시험인가.
 *
 * 완결성 게이트가 이것을 보고 판정에서 뺀다. 재시험은 그 기계의 몫 전체를 잰
 * 것이 아니므로, 전체 기록을 대신하게 두면 실패 우선 고리가 곧 거짓 초록이 된다
 * — 실패 셋만 다시 돌려 통과시키고 "다 덮였다" 가 되는 길이다.
 */
export function isRetestRecord(record) {
	return record?.kind === "retest";
}
