/**
 * 배포 전 회귀가 실제로 전부 돌았는지 본다.
 *
 * 왜 필요한가: 기계마다 자기 몫을 돌리면 각자는 "내 몫은 됐다" 고 말할 수
 * 있지만, 그것을 합쳐도 전체가 덮였는지는 아무도 모른다. 129개 중 무엇이
 * 한 번도 실행되지 않았는지 세는 자리가 없으면, 돌지 않은 것이 통과처럼
 * 보인다 — 리눅스 음성 결함이 넉 달 산 이유가 그것이었다.
 *
 * 무엇을 보는가: docs/regression-runs/ 의 기록을 모아
 *   1) 인벤토리의 모든 스펙이 어느 기계엔가 배정되었는가
 *   2) 배정되었지만 환경이 없어 건너뛴 것은 무엇인가
 *   3) 실패한 기계가 있는가
 * 를 판정한다. 건너뛴 것은 통과가 아니다.
 *
 * 쓰는 법: node scripts/check-regression-complete.mjs [--max-age-hours=24]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const maxAgeHours = Number(
	args.find((a) => a.startsWith("--max-age-hours="))?.split("=")[1] ?? 24,
);

const INVENTORY = "docs/e2e-inventory.json";
const RUNS = "docs/regression-runs";

if (!existsSync(INVENTORY)) {
	console.error(`[regression-complete] ❌ ${INVENTORY} 이 없다`);
	process.exit(1);
}
const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
const all = new Set(inventory.specs.map((s) => s.spec));

if (!existsSync(RUNS)) {
	console.error(`[regression-complete] ❌ ${RUNS} 이 없다 — 아직 아무 기계도 회귀를 돌리지 않았다`);
	console.error(`   스펙 ${all.size}개가 전부 미실행이다. 돌지 않은 것은 통과가 아니다.`);
	process.exit(1);
}

const cutoff = Date.now() - maxAgeHours * 3600_000;
const records = readdirSync(RUNS)
	.filter((f) => f.endsWith(".json"))
	.map((f) => JSON.parse(readFileSync(join(RUNS, f), "utf8")))
	.filter((r) => Date.parse(r.finished ?? r.started ?? 0) >= cutoff);

if (!records.length) {
	console.error(`[regression-complete] ❌ 최근 ${maxAgeHours}시간 안의 회귀 기록이 없다`);
	process.exit(1);
}

const covered = new Set();
const skipped = new Map();
const failedMachines = [];
for (const record of records) {
	for (const spec of record.assigned ?? []) covered.add(spec);
	for (const [spec, envs] of Object.entries(record.skippedForMissingEnv ?? {})) {
		skipped.set(spec, envs);
	}
	if (record.status !== "passed") failedMachines.push(`${record.machine}(${record.status})`);
}

const never = [...all].filter((s) => !covered.has(s));
const machines = [...new Set(records.map((r) => r.machine))];

console.log(`[regression-complete] 기계 ${machines.length}대(${machines.join(", ")}) / 최근 ${maxAgeHours}시간`);
console.log(`  스펙 ${all.size} 중 배정된 것 ${covered.size}, 아무도 맡지 않은 것 ${never.length}`);
console.log(`  배정되었으나 환경이 없어 건너뛴 것 ${skipped.size}`);

let failed = false;
if (failedMachines.length) {
	console.error(`  ❌ 실패한 기계: ${failedMachines.join(", ")}`);
	failed = true;
}
if (never.length) {
	console.error(`  ❌ 아무 기계도 맡지 않은 스펙 ${never.length}개:`);
	for (const spec of never.slice(0, 10)) console.error(`     ${spec}`);
	if (never.length > 10) console.error(`     … 그리고 ${never.length - 10}개 더`);
	console.error("     등급을 나눠 맡기거나, 왜 돌리지 않는지 적어라.");
	failed = true;
}
if (skipped.size) {
	console.error(`  ❌ 환경이 없어 건너뛴 스펙 ${skipped.size}개 — 이것은 통과가 아니다:`);
	for (const [spec, envs] of [...skipped].slice(0, 10)) {
		console.error(`     ${spec} ← ${envs.join(", ")}`);
	}
	failed = true;
}
if (!failed) console.log("  ✓ 모든 스펙이 어느 기계엔가 배정되었고 건너뛴 것이 없다");
process.exit(failed ? 1 : 0);
