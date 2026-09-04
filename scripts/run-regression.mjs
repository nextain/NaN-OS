/**
 * 배포 전 회귀를 이 기계가 맡은 몫만큼 돌리고, 무엇을 돌렸는지 남긴다.
 *
 * 왜 이렇게 나누는가: 실기 스펙 130개는 한 기계에서 다 돌 수 없다. 자격증명이
 * 필요한 것, 그 기계의 장치(GPU·오디오·데스크톱 세션)가 필요한 것, 아무것도
 * 필요 없는 것이 섞여 있다. 나누려면 무엇이 무엇을 요구하는지 알아야 하고,
 * 그 목록은 build-e2e-inventory.mjs 가 만든다.
 *
 * 왜 결과를 파일로 남기는가: 기계마다 따로 돌면 전체가 통과했는지 아무도
 * 모른다. 각자 "내 몫은 됐다" 고 말하는 것으로는 배포 판단을 할 수 없다.
 * 남긴 기록을 check-regression-complete.mjs 가 모아 빈 곳을 찾는다.
 *
 * 쓰는 법:
 *   node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci[,credentialed_live,native_local]
 *   node scripts/run-regression.mjs --machine=<이름> --tier=ci --dry-run
 *
 * --dry-run 은 무엇을 돌릴지만 보여준다. 환경이 갖춰졌는지 먼저 볼 때 쓴다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const machine = value("machine");
const tiers = (value("tier") ?? "deterministic_ci").split(",").map((t) => t.trim()).filter(Boolean);
const dryRun = args.includes("--dry-run");

if (!machine) {
	console.error("사용법: node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci[,credentialed_live,native_local] [--dry-run]");
	process.exit(2);
}

const INVENTORY = "docs/e2e-inventory.json";
if (!existsSync(INVENTORY)) {
	console.error(`${INVENTORY} 이 없다 — node scripts/build-e2e-inventory.mjs 를 먼저 돌려라`);
	process.exit(2);
}
const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));

const known = new Set(["deterministic_ci", "credentialed_live", "native_local"]);
const unknown = tiers.filter((t) => !known.has(t));
if (unknown.length) {
	console.error(`알 수 없는 등급: ${unknown.join(", ")} (쓸 수 있는 것: deterministic_ci, credentialed_live, native_local)`);
	process.exit(2);
}

const mine = inventory.specs.filter((s) => tiers.includes(s.tier));
console.log(`[regression] ${machine} 이 맡은 몫: ${mine.length} / 전체 ${inventory.total}`);
for (const tier of tiers) {
	console.log(`  ${tier.padEnd(7)} ${mine.filter((s) => s.tier === tier).length}`);
}

// 등급이 요구하는 환경 변수가 실제로 있는지 먼저 본다. 없으면 스펙은 조용히
// 건너뛰고, 건너뛴 것이 통과로 세어지는 것이 지금까지의 문제였다.
const missingEnv = new Map();
for (const spec of mine) {
	const absent = spec.env.filter((name) => !process.env[name]);
	if (absent.length) missingEnv.set(spec.spec, absent);
}
if (missingEnv.size) {
	console.log(`  ⚠ 환경이 없어 건너뛸 스펙 ${missingEnv.size}개 — 이것은 통과가 아니다`);
	for (const [spec, absent] of [...missingEnv].slice(0, 5)) {
		console.log(`      ${spec}: ${absent.join(", ")}`);
	}
	if (missingEnv.size > 5) console.log(`      … 그리고 ${missingEnv.size - 5}개 더`);
}

if (dryRun) {
	console.log("  (--dry-run: 실행하지 않는다)");
	process.exit(0);
}

const started = new Date().toISOString();
let status = "passed";
let detail = "";
try {
	// 메인 harness 가 specs/**/*.spec.ts 를 맡는다. 등급별로 나눠 넘길 수단이
	// wdio 설정에 없으므로, 여기서는 그 harness 를 부르고 결과만 기록한다.
	// 등급별 선택은 harness 가 --spec 을 받는 형태로 넓힌 뒤에 붙인다.
	execFileSync("pnpm", ["-C", "packages/shell", "exec", "wdio", "run", "e2e-tauri/wdio.conf.ts"], {
		stdio: "inherit",
	});
} catch (error) {
	status = "failed";
	detail = String(error?.message ?? error).slice(0, 400);
}

const record = {
	machine,
	tiers,
	started,
	finished: new Date().toISOString(),
	status,
	assigned: mine.map((s) => s.spec),
	skippedForMissingEnv: Object.fromEntries(missingEnv),
	detail,
};

const dir = "docs/regression-runs";
mkdirSync(dir, { recursive: true });
const out = join(dir, `${machine}-${started.replace(/[:.]/g, "-")}.json`);
writeFileSync(out, `${JSON.stringify(record, null, "\t")}\n`);
console.log(`[regression] 기록: ${out} (${status})`);
process.exit(status === "passed" ? 0 : 1);
