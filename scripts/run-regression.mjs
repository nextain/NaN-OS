/**
 * 배포 전 회귀를 이 기계가 맡은 몫만큼 돌리고, 무엇을 돌렸는지 남긴다.
 *
 * 왜 이렇게 나누는가: 실기 스펙 129개는 한 기계에서 다 돌 수 없다. 자격증명이
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

// 실기 스펙은 환경 변수 말고도 공통 전제를 요구한다 — 브라우저 드라이버,
// tauri-driver, 빌드된 디버그 바이너리, 그리고 살아 있는 게이트웨이다.
// 전제가 없으면 스펙은 ECONNREFUSED 같은 모양으로 죽는데, 그것은 결함이
// 아니라 준비 부족이다. 둘을 같은 칸에 넣으면 기록이 "서른한 개가 깨졌다" 고
// 말하게 되고, 다음 사람이 없는 버그를 찾는다.
function missingPrerequisites() {
	const missing = [];
	const has = (command) => {
		try {
			execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
			return true;
		} catch {
			return false;
		}
	};
	if (!has("WebKitWebDriver")) missing.push("WebKitWebDriver (브라우저 드라이버)");
	if (!has("tauri-driver")) missing.push("tauri-driver");
	if (!existsSync("packages/shell/src-tauri/target-e2e/debug/naia-shell"))
		missing.push("빌드된 e2e 바이너리 (pnpm -C packages/shell run build:e2e:tauri)");
	const gatewayPort = process.env.NAIA_E2E_GATEWAY_PORT ?? "18789";
	try {
		execFileSync("sh", ["-c", `ss -ltn | grep -q ':${gatewayPort} '`], { stdio: "ignore" });
	} catch {
		missing.push(`게이트웨이 (:${gatewayPort} 응답 없음)`);
	}
	return missing;
}

const absentPrereqs = missingPrerequisites();
if (absentPrereqs.length) {
	console.log(`  ⚠ 공통 전제 ${absentPrereqs.length}개가 없다:`);
	for (const item of absentPrereqs) console.log(`      ${item}`);
	console.log("     이 상태로 돌리면 스펙이 결함처럼 죽는다 — 준비 부족과 결함은 다르다.");
}

if (dryRun) {
	console.log("  (--dry-run: 실행하지 않는다)");
	process.exit(0);
}

if (absentPrereqs.length) {
	// 준비가 안 된 것을 "돌렸는데 실패했다" 로 기록하지 않는다. 기록은 남기되
	// 상태를 따로 둔다 — 완결성 게이트가 이것을 통과로 세지 않는다.
	const started = new Date().toISOString();
	const dir = "docs/regression-runs";
	mkdirSync(dir, { recursive: true });
	const out = join(dir, `${machine}-${started.replace(/[:.]/g, "-")}.json`);
	writeFileSync(
		out,
		`${JSON.stringify(
			{
				machine,
				tiers,
				started,
				finished: new Date().toISOString(),
				status: "prerequisites-missing",
				assigned: [],
				skippedForMissingEnv: Object.fromEntries(missingEnv),
				missingPrerequisites: absentPrereqs,
				detail: "공통 전제가 없어 실행하지 않았다",
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`[regression] 실행하지 않았다 — 기록: ${out}`);
	process.exit(2);
}

const started = new Date().toISOString();
let status = "passed";
let detail = "";
try {
	// 맡은 스펙만 넘긴다. 예전에는 전체 스위트를 돌리면서 기록에는 맡은 것만
	// 적었는데, 그러면 --tier=native_local 로 부른 기계가 실제로는 전부 돌리고
	// 기록은 셋만 남긴다 — 나눈다는 장치가 나누지 않고 기록이 실행과 어긋난다.
	// wdio 는 --spec 을 여러 번 받는다(package.json 의 test:e2e:tauri:nva 가 이미
	// 같은 설정에 그렇게 넘긴다).
	const specArgs = mine.flatMap((s) => ["--spec", `e2e-tauri/specs/${s.spec}`]);
	execFileSync(
		"pnpm",
		["-C", "packages/shell", "exec", "wdio", "run", "e2e-tauri/wdio.conf.ts", ...specArgs],
		{ stdio: "inherit" },
	);
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
