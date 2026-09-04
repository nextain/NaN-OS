/**
 * 아무것도 재지 않으면서 통과를 보고하는 테스트를 잡는다.
 *
 * 왜 필요한가: `expect(true).toBe(true)` 는 리포터에 PASS 로 올라가고 통과
 * 수치에 더해진다. 그 수치를 보고 "덮여 있다" 고 판단하면 실제로는 아무도
 * 보지 않는 자리를 덮였다고 믿게 된다. 96-w5-sold-out-ux.spec.ts 가 그 예다
 * — 파일 머리에는 "UI 가 매진 안내를 보여준다" 는 시나리오가 적혀 있는데
 * 단정은 `expect(true).toBe(true)` 하나뿐이고, 화면 문구는 아무것도 보지
 * 않는다. 2026-06-10 이후 그대로다.
 *
 * 조건 없는 skip 도 같은 성격이다. 환경이 없어 건너뛰는 것
 * (`test.skip(!process.env.X, ...)`)은 정당하지만, 이유 없이 꺼 둔 것은
 * 죽은 테스트이면서 파일 수에는 남는다.
 *
 * 지금 있는 것은 baseline 으로 고정하고 늘어나는 것만 막는다. 한 번에
 * 붉히면 게이트가 꺼지기 때문이다. 줄이면 이 목록도 함께 줄여야 한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages/shell/e2e", "packages/shell/e2e-tauri/specs", "packages/shell/src"];

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const name of entries) {
		if (name === "node_modules" || name === "dist") continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(test|spec)\.[cm]?tsx?$/.test(name)) out.push(full);
	}
	return out;
}

const files = ROOTS.flatMap((root) => walk(root));
const vacuous = [];
const deadSkips = [];

for (const file of files) {
	const source = readFileSync(file, "utf8");
	source.split("\n").forEach((line, index) => {
		const where = `${file}:${index + 1}`;
		// 자기 자신만 확인하는 단정.
		if (/expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/.test(line)) vacuous.push(where);
		// 조건 없는 skip. 환경 변수로 거르는 형태는 정당하므로 뺀다.
		if (/^\s*(?:test|it|describe)(?:\.describe)?\.skip\(\s*["'`]/.test(line)) deadSkips.push(where);
	});
}

// 오늘의 상태.
const BASELINE_VACUOUS = 2;
const BASELINE_DEAD_SKIPS = 16;

console.log(`[vacuous-tests] 자명 단정 ${vacuous.length} (baseline ${BASELINE_VACUOUS}) / 조건 없는 skip ${deadSkips.length} (baseline ${BASELINE_DEAD_SKIPS})`);

let failed = false;
if (vacuous.length > BASELINE_VACUOUS) {
	console.error("  ❌ 아무것도 재지 않는 단정이 늘었다:");
	for (const where of vacuous) console.error(`     ${where}`);
	console.error("     그 자리가 무엇을 확인해야 하는지 적거나, 테스트를 지워라.");
	failed = true;
}
if (deadSkips.length > BASELINE_DEAD_SKIPS) {
	console.error("  ❌ 이유 없이 꺼 둔 테스트가 늘었다:");
	for (const where of deadSkips) console.error(`     ${where}`);
	console.error("     환경 조건으로 거르거나(test.skip(!process.env.X, ...)), 되살리거나, 지워라.");
	failed = true;
}
if (vacuous.length < BASELINE_VACUOUS || deadSkips.length < BASELINE_DEAD_SKIPS)
	console.log("  ✓ 줄었다 — 이 파일의 baseline 도 함께 줄여라");
if (!failed) console.log("  ✓ 늘지 않았다");
process.exit(failed ? 1 : 0);
