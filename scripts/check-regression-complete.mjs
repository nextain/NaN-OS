/**
 * 배포 전 회귀가 실제로 전부 돌았는지 본다.
 *
 * 왜 필요한가: 기계마다 자기 몫을 돌리면 각자는 "내 몫은 됐다" 고 말할 수
 * 있지만, 그것을 합쳐도 전체가 덮였는지는 아무도 모른다. 123개 중 무엇이
 * 한 번도 실행되지 않았는지 세는 자리가 없으면, 돌지 않은 것이 통과처럼
 * 보인다 — 리눅스 음성 결함이 넉 달 산 이유가 그것이었다.
 *
 * 무엇을 보는가: docs/regression-runs/ 의 기록을 모아
 *   1) 인벤토리의 모든 스펙이 어느 기계엔가 배정되었는가
 *   2) 배정되었지만 요구 환경이 없던 것은 무엇인가(실행 전 예측이다)
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
const inWindow = readdirSync(RUNS)
	.filter((f) => f.endsWith(".json"))
	.map((f) => JSON.parse(readFileSync(join(RUNS, f), "utf8")))
	.filter((r) => Date.parse(r.finished ?? r.started ?? 0) >= cutoff);

/**
 * 기계마다 **가장 최근 실행 하나**만 본다.
 *
 * 왜: 예전에는 창 안의 기록을 전부 보았다. 그래서 오전에 실패하고, 원인을
 * 고치고, 오후에 다시 돌려 전부 통과시켜도 오전의 실패 기록이 창에 남아
 * 게이트가 계속 붉었다. CI 창이 72시간이므로 사흘간 그랬다. 고친 것이
 * 반영되지 않는 게이트는 사람이 곧 무시하게 된다.
 *
 * 옛 기록을 지우는 것으로 풀면 안 된다 — 그러면 실패를 지워서 초록을 만드는
 * 길이 열리고, 그것은 이 프로세스가 없애려는 바로 그 형태다. 기록은 남기되
 * 판정은 최신으로 한다.
 */
const latestByMachine = new Map();
for (const record of inWindow) {
	const when = Date.parse(record.finished ?? record.started ?? 0);
	const previous = latestByMachine.get(record.machine);
	if (!previous || when > previous.when) latestByMachine.set(record.machine, { when, record });
}
const records = [...latestByMachine.values()].map((entry) => entry.record);
const superseded = inWindow.length - records.length;

if (!records.length) {
	console.error(`[regression-complete] ❌ 최근 ${maxAgeHours}시간 안의 회귀 기록이 없다`);
	process.exit(1);
}

const covered = new Set();
const planned = new Set();
const skipped = new Map();
const failedMachines = [];
const notRun = [];
for (const record of records) {
	// 덮였다고 셀 수 있는 것은 실제로 끝까지 돈 것뿐이다. planned 는 무엇을
	// 돌리려 했는지일 뿐이고, 그것을 커버로 세면 wdio 가 죽어도 전수 커버로
	// 보고된다. 옛 기록의 assigned 는 계획이었으므로 planned 로 읽는다.
	for (const spec of record.executed ?? []) covered.add(spec);
	for (const spec of record.planned ?? record.assigned ?? []) planned.add(spec);
	for (const [spec, envs] of Object.entries(record.envMissingBeforeRun ?? record.skippedForMissingEnv ?? {})) {
		skipped.set(spec, envs);
	}
	// prerequisites-missing 은 "돌렸는데 깨졌다" 가 아니라 "돌리지 못했다" 다.
	// 둘 다 통과가 아니지만 사람이 볼 때 구별돼야 한다 — 하나는 코드를 고칠
	// 일이고 하나는 기계를 준비할 일이다.
	if (record.status === "prerequisites-missing") {
		notRun.push(`${record.machine}: ${(record.missingPrerequisites ?? []).join(", ")}`);
	} else if (record.status !== "passed") {
		failedMachines.push(`${record.machine}(${record.status})`);
	}
}

const never = [...all].filter((s) => !covered.has(s));
const machines = [...new Set(records.map((r) => r.machine))];

console.log(
	`[regression-complete] 기계 ${machines.length}대(${machines.join(", ")}) / 최근 ${maxAgeHours}시간` +
		(superseded > 0 ? ` — 기계별 최신 실행만 본다(더 오래된 기록 ${superseded}개는 판정에서 뺐다)` : ""),
);
console.log(`  스펙 ${all.size} 중 실제로 돈 것 ${covered.size}, 돌리려 했던 것 ${planned.size}, 아무도 맡지 않은 것 ${never.length}`);
console.log(`  배정되었으나 요구 환경이 없던 것 ${skipped.size}`);

let failed = false;
if (notRun.length) {
	console.error(`  ❌ 전제가 없어 돌리지 못한 기계 ${notRun.length}대:`);
	for (const line of notRun) console.error(`     ${line}`);
	console.error("     기계를 준비해야 한다. 돌리지 못한 것은 통과가 아니다.");
	failed = true;
}
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
	console.error(`  ❌ 요구 환경이 없던 스펙 ${skipped.size}개 — 이것은 통과가 아니다:`);
	for (const [spec, envs] of [...skipped].slice(0, 10)) {
		console.error(`     ${spec} ← ${envs.join(", ")}`);
	}
	failed = true;
}
if (!failed) console.log("  ✓ 모든 스펙이 어느 기계엔가 배정되었고 건너뛴 것이 없다");

// 채널에 그대로 붙일 수 있는 한 줄. 형식은 docs/regression-runs/CHANNEL.md.
// 마스터가 각 기계의 DONE 을 모아 전체가 얼마나 덮였는지 알리는 자리다.
console.log(
	`\n[master] STATE ${all.size}개 중 덮인 것 ${covered.size}` +
		` · 아무도 맡지 않은 것 ${never.length}` +
		(failedMachines.length
			? ` · 실패한 기계 ${failedMachines.join(", ")}`
			: " · 실패한 기계 없음") +
		(notRun.length ? ` · 전제 미비 ${notRun.length}대` : "") +
		`\n`,
);

process.exit(failed ? 1 : 0);
