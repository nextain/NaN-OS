/**
 * UC 가 추적되고 있는지 본다.
 *
 * 왜 필요한가: 옆에 있는 check-assembly-coverage.mjs 는 `**UC1**` 같은 옛
 * 숫자 이름만 찾는다(정규식 /\*\*(UC\d+[a-z-]*)/). 그 사이 문서는
 * `UC-<이름>` 체계로 옮겨갔고, 게이트는 그 표제 중
 * 하나도 보지 못한 채 "모든 UC 분류 ✓" 로 초록을 보고한다. 눈이 먼 게이트는
 * 없는 게이트보다 나쁘다 — 통과가 무언가를 보증한다고 믿게 만든다.
 *
 * 무엇을 재는가: UC 표제마다 다음 셋 중 하나에 걸려야 한다.
 *   1) user-scenarios.md 의 Test Coverage Map 표에 자기 행이 있다
 *   2) 벤치 하네스(agent-bench-scenarios.ts)의 계열 접두사에 걸린다 —
 *      그 계열이 요구 증거를 정의하므로 표가 따로 필요 없다
 *   3) 그 하네스가 에픽 밖으로 선언했다
 *
 * 셋 다 아니면 그 UC 는 어디서 검증되는지 아무 데도 적혀 있지 않다.
 *
 * 왜 baseline 인가: 지금 걸리는 것이 열 몇 개다. 한 번에 붉히면 CI 가 막히고
 * 게이트는 곧 꺼진다. 그래서 현재 미충족 목록을 고정해 두고 "이보다 늘면
 * 실패" 로 시작한다. 목록을 줄이는 것이 다음 일이며, 줄어들면 이 파일의
 * 목록도 함께 줄여야 한다(늘리기만 하면 baseline 이 알리바이가 된다).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

const scenarios = readFileSync("docs/user-scenarios.md", "utf8");
const harness = readFileSync("src/test/harness/agent-bench-scenarios.ts", "utf8");

const families = [...harness.matchAll(/prefix:\s*"([^"]+)"/g)].map((m) => m[1]);
const notOwnedBlock = harness.split("NOT_OWNED_BY_EPIC")[1]?.split("];")[0] ?? "";
const notOwned = [...notOwnedBlock.matchAll(/"(UC-[A-Z0-9-]*)"/g)].map((m) => m[1]);

if (!families.length) {
	console.error("[uc-trace] ❌ 벤치 계열 접두사를 읽지 못했다 — 하네스 형식이 바뀌었는지 보라");
	process.exit(1);
}

// 표제 깊이를 둘·셋으로 못박아 두면 `#### UC-...` 로 한 단 내리는 것만으로
// 게이트를 피할 수 있다. 실제로 리뷰가 그 우회를 실증했다. 깊이를 가리지
// 않는다.
const titles = [
	...new Set(
		[...scenarios.matchAll(/^#{2,6}\s+(UC-[A-Z0-9][A-Z0-9-]*)/gm)].map((m) => m[1]),
	),
];

const escaped = (uc) => uc.replace(/-/g, "\\-");
/**
 * 커버리지 표에 자기 행이 있고, **그 행이 무언가를 말하는지** 본다.
 *
 * 예전에는 행의 존재만 보았다. 그래서 `| UC-X | | |` 처럼 칸이 전부 빈 행을
 * 넣어도 추적된 것으로 인정됐다 — 무엇으로 검증하는지 한 글자도 적지 않고
 * 게이트를 지나는 길이다.
 */
const hasCoverageRow = (uc) => {
	const row = new RegExp(`^\\|\\s*${escaped(uc)}\\s*\\|(.*)$`, "m").exec(scenarios);
	if (!row) return false;
	const cells = row[1]
		.split("|")
		.map((cell) => cell.trim())
		.filter((cell) => cell.length > 0 && cell !== "—" && cell !== "-");
	return cells.length > 0;
};
const byBenchFamily = (uc) => families.some((prefix) => uc.startsWith(prefix));
const outsideEpic = (uc) => notOwned.some((prefix) => uc.startsWith(prefix));

const untracked = titles.filter(
	(uc) => !hasCoverageRow(uc) && !byBenchFamily(uc) && !outsideEpic(uc),
);

// 커버리지 맵만 채우고 벤치 하네스에 등록하지 않으면, 이 게이트는 통과하고
// agent-bench-scenario-source 계약 테스트가 대신 붉어진다. 두 곳을 봐야 하는
// 사실이 한쪽에만 적혀 있으면 사람은 반드시 한쪽을 빠뜨린다 — 실제로 #540 이
// 그랬고, 그것을 고친 사람이 UC-QUALITY 를 더하면서 똑같이 빠뜨렸다.
// 여기서 함께 본다.
// 벤치 하네스는 `### UC-` 만 자기 소관으로 본다(agent-bench-scenarios.ts 의
// HEADING). 여기서 `## UC-` 까지 세면 하네스가 애초에 다루지 않는 것을 잡아
// 과탐지가 된다. 같은 기준으로 맞춘다.
const benchTitles = [
	...new Set([...scenarios.matchAll(/^###\s+(UC-[A-Z0-9-]+)/gm)].map((m) => m[1])),
];
const benchOrphans = benchTitles.filter((uc) => !byBenchFamily(uc) && !outsideEpic(uc));

// 오늘의 상태. 줄이는 것이 목표이고, 늘리는 것은 이 게이트가 막는다.
const BASELINE = [
	"UC-DISCORD",
	"UC-GROK-SUBSCRIPTION",
	"UC-KB-MANAGE",
	"UC-LLM-THREE-TIER",
	"UC-NAIA-MODEL-ORDER",
	"UC-ONBOARDING-APPEARANCE-VOICE",
	"UC-PROACTIVE-COST-CONTROL",
	"UC-RADIO-DJ-DURABLE",
	"UC-WIRE-V1",
];

const added = untracked.filter((uc) => !BASELINE.includes(uc));
const fixed = BASELINE.filter((uc) => !untracked.includes(uc));

// 표에 적힌 테스트 경로가 실제로 있는지 본다. 적기만 하면 통과하는 게이트는
// 표면 게이트다 — 파일이 옮겨가거나 지워져도 표는 그대로 남아, 추적이 살아
// 있는 것처럼 보인다.
const referenced = new Set();
for (const match of scenarios.matchAll(/`([^`]*\.(?:ts|tsx|rs|mjs))(?::\d+)?`/g)) {
	referenced.add(match[1]);
}
// 표는 어떤 줄은 경로로, 어떤 줄은 파일 이름만으로 적혀 있다. 이름만 적힌
// 것은 저장소 어디엔가 그 이름의 파일이 있으면 산 참조로 본다 — 이름조차
// 없으면 그 줄은 없는 것을 가리킨다.
const searchRoots = ["packages/shell", "src", "scripts", "."];
const namesOnDisk = new Set();
function collectNames(dir, depth = 0) {
	if (depth > 8) return;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "target" || entry.name === "dist") continue;
		if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
		if (entry.isDirectory()) collectNames(`${dir}/${entry.name}`, depth + 1);
		else namesOnDisk.add(entry.name);
	}
}
collectNames(".");

const brokenRefs = [...referenced].filter((ref) => {
	// 표에는 와일드카드로 묶어 적은 줄도 있다(registry*.test.ts). 그것은 파일이
	// 아니라 패턴이므로 실재 검사의 대상이 아니다.
	if (ref.includes("*")) return false;
	const candidates = [ref, ...searchRoots.map((root) => `${root}/${ref}`)];
	if (candidates.some((candidate) => existsSync(candidate))) return false;
	// 경로까지 적은 줄은 그 경로로 판정한다. 이름만 남기고 넘어가면 파일이
	// 다른 곳으로 옮겨가도 표가 낡은 채 통과한다.
	if (ref.includes("/")) return true;
	// 이름만 적힌 줄은 저장소 어디엔가 그 이름이 있으면 산 참조로 본다.
	return !namesOnDisk.has(ref);
});

console.log(`[uc-trace] UC 표제 ${titles.length} / 추적 안 되는 것 ${untracked.length} (baseline ${BASELINE.length}) / 표가 가리키는 파일 ${referenced.size}`);
if (fixed.length) console.log(`  ✓ 해소됨 ${fixed.length}: ${fixed.join(", ")}  ← BASELINE 에서 빼라`);
if (added.length) {
	console.error(`  ❌ 새로 추적이 끊긴 UC ${added.length}: ${added.join(", ")}`);
	console.error("     Test Coverage Map 에 행을 더하거나, 벤치 계열/에픽 밖으로 선언하라.");
	process.exit(1);
}
// 지금 깨져 있는 참조를 baseline 으로 둔다. 표가 오래되어 옛 경로를 가리키는
// 것이 이미 여럿이라, 한 번에 붉히면 게이트가 꺼진다. 늘어나는 것만 막는다.
const BASELINE_BROKEN_REFS = 29;
if (brokenRefs.length > BASELINE_BROKEN_REFS) {
	console.error(`  ❌ 표가 가리키는데 없는 파일이 늘었다(${brokenRefs.length} > ${BASELINE_BROKEN_REFS}):`);
	for (const ref of brokenRefs.slice(0, 10)) console.error(`     ${ref}`);
	console.error("     경로를 고치거나, 그 줄을 표에서 빼라.");
	process.exit(1);
}
if (brokenRefs.length < BASELINE_BROKEN_REFS)
	console.log(`  ✓ 깨진 참조가 줄었다(${brokenRefs.length}) — BASELINE_BROKEN_REFS 도 줄여라`);
if (benchOrphans.length) {
	console.error(`  ❌ 벤치 하네스가 모르는 UC ${benchOrphans.length}개:`);
	for (const uc of benchOrphans) console.error(`     ${uc}`);
	console.error("     src/test/harness/agent-bench-scenarios.ts 의 계열에 더하거나,");
	console.error("     에이전트 능력 축이 아니면 NOT_OWNED_BY_EPIC 에 접두사를 적어라.");
	process.exit(1);
}
console.log("  ✓ 새로 끊긴 UC 없음");
