/**
 * 배포 전 회귀를 이 기계가 맡은 몫만큼 돌리고, 무엇을 돌렸는지 남긴다.
 *
 * 왜 이렇게 나누는가: 실기 스펙 123개는 한 기계에서 다 돌 수 없다. 자격증명이
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
 *   node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci --dry-run
 *
 * --dry-run 은 무엇을 돌릴지만 보여준다. 환경이 갖춰졌는지 먼저 볼 때 쓴다.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { e2eBinaryPath } from "../packages/shell/scripts/agent-pairing.mjs";

const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const machine = value("machine");
const tiers = (value("tier") ?? "deterministic_ci").split(",").map((t) => t.trim()).filter(Boolean);
const dryRun = args.includes("--dry-run");

// 채널에 그대로 붙일 한 줄. 성공/실패(prereq-missing) 경로 양쪽 DONE·BLOCKED 가
// 이 함수를 부르므로 모듈 최상위에 둔다 — 블록 안에 두면 성공 경로 최종 DONE 에서 ReferenceError.
function channelLine(state, rest) {
	return `[${machine}] ${state} ${rest}`;
}

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

/**
 * 함께 도는 기계들의 명단. `docs/regression-runs/machines.json` 이 한 곳이다.
 *
 * 왜 파일에 두는가: 기계마다 `--peers` 를 손으로 적으면 목록이 어긋난다.
 * 어긋나면 몫이 겹치거나 비는데, 그것은 기록만 보고는 알 수 없다 — 각자
 * "나는 내 몫을 다 돌았다" 고 말하기 때문이다.
 */
const ROSTER = "docs/regression-runs/machines.json";
const rosterFile = existsSync(ROSTER)
	? JSON.parse(readFileSync(ROSTER, "utf8"))
	: { machines: [] };
// 합류하지 않은 기계는 몫을 받지 않는다. 받으면 그 몫이 영영 비고, 완결성
// 판정은 그것을 "아무도 맡지 않았다" 로 붉힌다 — 옳은 판정이지만 사람은
// 그것을 회귀로 읽는다.
const roster = {
	...rosterFile,
	machines: (rosterFile.machines ?? []).filter((m) => m.active !== false),
};

const profile = roster.machines.find((m) => m.name === machine);
if (roster.machines.length > 0 && !profile) {
	const dormant = (rosterFile.machines ?? []).find((m) => m.name === machine);
	console.error(
		dormant
			? `${machine} 는 명단에 있지만 아직 합류하지 않았다(active: false).\n` +
					`${ROSTER} 에서 active 를 true 로 바꾸면 몫을 받는다.`
			: `${ROSTER} 에 이 기계(${machine})가 없다.\n` +
					`지금 도는 기계: ${roster.machines.map((m) => m.name).join(", ")}\n` +
			"먼저 명단에 이름과 능력을 적어라 — 명단에 없는 기계가 도는 것은 아무도 모르는 실행이다.",
	);
	process.exit(2);
}

// 명단이 있으면 그 기계가 맡기로 한 등급만 받는다. 능력에 없는 등급을
// 억지로 맡으면 실패가 쌓이는데, 그것은 회귀가 아니라 기계가 못 하는 일이다.
if (profile) {
	const notMine = tiers.filter((tier) => !profile.tiers.includes(tier));
	if (notMine.length > 0) {
		console.error(
			`${machine} 는 ${notMine.join(", ")} 을 맡지 않는다 (맡는 것: ${profile.tiers.join(", ")}).\n` +
				`이유: ${profile.note ?? "명단 참조"}`,
		);
		process.exit(2);
	}
}

/**
 * 등급마다 그 등급을 맡은 기계들끼리 나눈다.
 *
 * 등급을 합쳐서 나누면 균등하지 않다 — 다섯 대가 맡는 등급과 두 대가 맡는
 * 등급을 한 줄로 세우면, 두 대짜리 등급의 몫이 다섯 대에 흩어져 그중 셋은
 * 돌릴 수 없는 것을 받는다.
 */
function shareOf(tier) {
	const inTier = inventory.specs
		.filter((s) => s.tier === tier)
		.sort((a, b) => a.spec.localeCompare(b.spec));
	const owners = roster.machines
		.filter((m) => m.tiers.includes(tier))
		.map((m) => m.name)
		.sort();
	if (owners.length === 0) return inTier;
	const index = owners.indexOf(machine);
	if (index < 0) return [];
	return inTier.filter((_, i) => i % owners.length === index);
}

const mine = tiers.flatMap((tier) => shareOf(tier));
const ownersByTier = new Map(
	tiers.map((tier) => [
		tier,
		roster.machines.filter((m) => m.tiers.includes(tier)).length,
	]),
);

console.log(
	`[regression] ${machine} 이 맡은 몫: ${mine.length} / 전체 ${inventory.total}` +
		(roster.machines.length > 0 ? ` (명단 ${roster.machines.length}대)` : ""),
);
for (const tier of tiers) {
	const owners = ownersByTier.get(tier) ?? 1;
	const total = inventory.specs.filter((s) => s.tier === tier).length;
	console.log(
		`  ${tier.padEnd(18)} ${String(mine.filter((s) => s.tier === tier).length).padStart(3)} / ${total} (${owners}대가 나눔)`,
	);
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
// 게이트웨이를 실제로 쓰는 스펙. 소스에서 포트를 직접 적은 것들이다.
const GATEWAY_SPECS = new Set([
	"13-lab-login.spec.ts",
	"72-naia-discord-skill.spec.ts",
	"99-screenshots.spec.ts",
]);

function missingPrerequisites() {
	const missing = [];
	// PATH 를 직접 뒤진다. `sh -c "command -v"` 는 윈도우에 sh 가 없으면
	// 언제나 실패해, 있는 도구를 없다고 말한다. 이 프로세스는 여러 기계가
	// 나눠 도는 것이 목적이므로 한 플랫폼에서만 도는 검사를 두면 안 된다.
	const has = (command) => {
		const exts =
			process.platform === "win32"
				? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
				: [""];
		for (const dir of (process.env.PATH ?? "").split(delimiter)) {
			if (!dir) continue;
			for (const ext of exts) {
				if (existsSync(join(dir, command + ext))) return true;
			}
		}
		return false;
	};
	// 짝 naia-agent 체크아웃은 **모든** 스펙의 전제다. 전용 설정만 요구한다고
	// 오래 믿었는데, 기본 설정(wdio.conf.ts)이 모듈 최상위에서 그것을 부르고
	// 전용 설정들은 전부 그것을 상속한다. 그래서 짝이 없으면 스펙 전부가
	// 설정을 읽는 단계에서 죽는다 — 그 죽음을 "회귀가 깨졌다" 로 적으면
	// 다음 사람이 없는 버그를 찾는다.
	if (!pairedAgentAvailable())
		missing.push(
			"짝 naia-agent 체크아웃 (핀 커밋과 같고 작업 트리가 깨끗한 것). NAIA_AGENT_WORKTREES_DIR 로 자리를 알려 주어라",
		);
	if (!has("WebKitWebDriver") && process.platform === "linux")
		missing.push("WebKitWebDriver (리눅스 웹뷰 드라이버)");
	if (!has("tauri-driver")) missing.push("tauri-driver");
	// 자리 계산은 agent-pairing 이 하나로 갖는다. 여기에 다시 적으면 빌드가
	// 두는 자리와 갈라진다 — 실제로 그랬다. Windows 빌드는 MSVC 경로 길이
	// 때문에 `C:/tmp/...` 에 짓는데 러너는 리눅스 자리만 보고 있었고, 그래서
	// 그 기계는 빌드에 성공하고도 "바이너리 없음" 으로 거부당했다.
	const binary = e2eBinaryPath(resolve("packages/shell"));
	if (!existsSync(binary))
		missing.push(
			`빌드된 e2e 바이너리 — ${binary} (pnpm -C packages/shell run build:e2e:tauri)`,
		);
	// 게이트웨이(:18789)는 그것을 쓰는 스펙이 배정됐을 때만 전제다. 실측에서
	// 전체 전제로 두었다가 진단을 그르쳤다 — 서른한 개 실패의 실제 사유는
	// 게이트웨이가 아니라 WebDriver 세션이 중간에 끊긴 것이었다
	// (invalid session id + ECONNREFUSED to the driver socket).
	const needsGateway = mine.some((spec) => GATEWAY_SPECS.has(spec.spec));
	if (needsGateway) {
		const gatewayPort = process.env.NAIA_E2E_GATEWAY_PORT ?? "18789";
		// 포트가 열려 있는지는 실제로 붙어 본다. `ss` 는 리눅스 전용이고,
		// 없는 기계에서는 "게이트웨이가 없다" 는 거짓 진단이 된다.
		if (!portIsOpen(Number(gatewayPort))) {
			missing.push(`게이트웨이 (:${gatewayPort} 응답 없음 — 이 등급에 그것을 쓰는 스펙이 있다)`);
		}
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
console.log(
	`\n${channelLine(
		"START",
		`${tiers.join(",")} ${mine.length}개` +
			(missingEnv.size ? ` · 환경 없어 건너뛸 것 ${missingEnv.size}` : ""),
	)}\n`,
);
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
				// 관측이 아니라 사전 예측이다 — 이 스펙들도 wdio 에 넘어가고, 그 안에서
	// 스스로 건너뛸지 실패할지는 스펙이 정한다. 이름을 그대로 두면 "건너뛰었다"
	// 는 관측으로 읽히므로 무엇인지 밝힌다.
	envMissingBeforeRun: Object.fromEntries(missingEnv),
				missingPrerequisites: absentPrereqs,
				detail: "공통 전제가 없어 실행하지 않았다",
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`[regression] 실행하지 않았다 — 기록: ${out}`);
	console.log(
		`\n[${machine}] BLOCKED ${absentPrereqs.map((p) => p.split("(")[0].trim()).join(", ")}\n`,
	);
	process.exit(2);
}

const started = new Date().toISOString();
let status = "passed";
let detail = "";
// 무엇을 돌리려 했는지(planned)와 실제로 끝까지 돈 것(executed)은 다르다.
// 예전에는 계획을 그대로 "배정" 으로 적었고, 완결성 게이트가 그것을 덮인
// 것으로 셌다. 그러면 wdio 가 시작하자마자 죽어도 기록에는 전부 덮였다고
// 남는다.
const executed = [];
const groupResults = [];

/**
 * 스펙을 wdio 설정별로 묶는다.
 *
 * 예전에는 무엇이든 `wdio.conf.ts` 로 넘겼는데, 열일곱 개 스펙은 전용 설정이
 * 준비하는 환경(격리된 프로필, 자체 사이드카, 다른 바이너리) 없이는 반드시
 * 실패한다. 예컨대 라디오 큐 스펙은 전용 설정의 onPrepare 가 띄우는 BGM
 * 사이드카의 /health 를 단정한다. 기본 설정으로 부르면 그 자리에서 죽는다.
 */
function groupByConf(specs) {
	const groups = new Map();
	for (const spec of specs) {
		const conf = (spec.conf ?? [])[0] ?? "wdio.conf.ts";
		if (!groups.has(conf)) groups.set(conf, []);
		groups.get(conf).push(spec.spec);
	}
	return groups;
}

/**
 * 전용 설정 중 짝 naia-agent 체크아웃을 요구하는 것들. 그 체크아웃이 없으면
 * 설정 파일을 읽는 단계에서 죽는데, 그것은 회귀가 깨진 것이 아니라 환경이
 * 없는 것이다. 둘을 섞으면 배포 판단이 흐려진다.
 */
function pairedAgentAvailable() {
	const root =
		process.env.NAIA_AGENT_WORKTREES_DIR ?? resolve("..", "naia-agent-worktrees");
	if (!existsSync(root)) return false;

	// 디렉터리가 있다고 되는 것이 아니다. 설정은 **검증된 커밋과 같고 작업
	// 트리가 깨끗한** 체크아웃만 받는다. 짝이 조금이라도 다르면 결과를
	// 믿을 수 없기 때문이다. 여기서 같은 판정을 하지 않으면, 있는데 못 쓰는
	// 상태를 "있다" 로 보고 그룹을 돌렸다가 설정 로딩에서 죽는다.
	// Rust 선언은 `const REQUIRED_AGENT_COMMIT: &str = "..."` 이다. 타입
	// 표기를 빼먹으면 매치되지 않고, 그러면 이 검사가 조용히 "짝이 없다" 로
	// 답한다 — 있는데 없다고 말하는 쪽도 판단을 망친다.
	const required = /REQUIRED_AGENT_COMMIT\s*(?::\s*&str\s*)?=\s*"([0-9a-f]{40})"/.exec(
		readFileSync("packages/shell/src-tauri/build.rs", "utf8"),
	)?.[1];
	if (!required) return false;

	let entries = [];
	try {
		entries = readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(root, entry.name));
	} catch {
		return false;
	}

	for (const candidate of entries) {
		if (!existsSync(join(candidate, "scripts/builds/agent-stdio-entry.mjs")))
			continue;
		try {
			const head = execFileSync("git", ["-C", candidate, "rev-parse", "HEAD"], {
				encoding: "utf8",
			}).trim();
			if (head !== required) continue;
			const dirty = execFileSync(
				"git",
				["-C", candidate, "status", "--porcelain"],
				{ encoding: "utf8" },
			)
				.split("\n")
				.filter((line) => line.trim() !== "")
				// 크래시 복구 lease 는 실행 중에 생기는 것이라 소스가 아니다.
				.filter((line) => !/\.agents[\\/]session-contracts[\\/]\.recovery[\\/]/.test(line));
			if (dirty.length === 0) return true;
		} catch {
			// 후보가 아니다. 계속 찾는다.
		}
	}
	return false;
}

const groups = groupByConf(mine);
console.log(`[regression] wdio 설정 ${groups.size}개로 나눠 돈다`);

/**
 * wdio 의 spec 리포터 출력에서 스펙별 결과를 읽는다.
 *
 * 왜 필요한가: 묶음 하나가 실패해도 그 안에서 실제로 통과한 스펙이 있다.
 * 실측에서 스물두 개 묶음이 9 통과 13 실패로 끝났는데, 묶음 단위로만 세면
 * 그 아홉 개가 "돌지 않았다" 로 기록된다. 돌았는데 안 돌았다고 적는 것도
 * 안 돌았는데 돌았다고 적는 것만큼 판단을 망친다.
 *
 * 리포터는 `» e2e-tauri/specs/<이름>` 뒤에 그 스펙의 `N passing` / `N failing`
 * 을 낸다. 그 사이를 읽는다.
 */
function parseSpecOutcomes(output) {
	// 한 스펙 블록은 `» ...spec.ts` 로 시작해 다음 `»` 까지다. mocha 는 그
	// 안에서 `N passing` 을 먼저 내고 실패가 있으면 그 **뒤에** `N failing`
	// 을 낸다. 줄 단위로 먼저 만난 것을 판정으로 삼으면 실패한 스펙을 통과로
	// 읽는다 — 실제로 그 버그가 있었다.
	const blocks = [];
	let current = null;
	for (const raw of output.split("\n")) {
		const line = raw.replace(/^\[[^\]]*\]\s*/, "");
		const started = /»\s+(?:e2e-tauri\/specs\/)?([\w.-]+\.spec\.ts)/.exec(line);
		if (started) {
			current = { spec: started[1], passing: 0, failing: 0 };
			blocks.push(current);
			continue;
		}
		if (!current) continue;
		const failing = /^(\d+)\s+failing/.exec(line);
		if (failing) current.failing += Number(failing[1]);
		const passing = /^(\d+)\s+passing/.exec(line);
		if (passing) current.passing += Number(passing[1]);
	}

	// wdio 9.x 스펙 리포터는 `» ... N passing` 대신 워커별로 한 줄로
	// `[0-3] PASSED in tauri - file:///.../specs/<이름>.spec.ts` 를 낸다. 이
	// 형식을 못 읽어 통과한 스펙을 안 돌았다로 세던 것이 win-rtx4060 첫
	// 실행의 과소계상이었다(6/9 통과가 executed 0 으로 남았다).
	for (const raw of output.split("\n")) {
		const line = raw.replace(/^\[[^\]]*\]\s*/, "");
		const m = /\b(PASSED|FAILED) in [\w-]+ - .*?([\w.-]+\.spec\.ts)/.exec(line);
		if (!m) continue;
		blocks.push({ spec: m[2], passing: m[1] === "PASSED" ? 1 : 0, failing: m[1] === "FAILED" ? 1 : 0 });
	}
	const failed = new Set();
	const passed = new Set();
	for (const block of blocks) {
		if (block.failing > 0) failed.add(block.spec);
		else if (block.passing > 0) passed.add(block.spec);
	}
	// 같은 스펙이 여러 번 돌았고 한 번이라도 실패했으면 실패로 본다.
	for (const spec of failed) passed.delete(spec);
	return { passed: [...passed], failed: [...failed] };
}

/**
 * 앞 묶음이 남긴 상태가 뒤 묶음을 막지 못하게 쉰다.
 *
 * 셸은 에이전트를 너무 자주 다시 띄우지 못하도록 5초를 막는다(재시작 폭풍
 * 방지). 묶음을 연달아 돌리면 앞 묶음이 끝나며 남긴 그 억제가 뒤 묶음의
 * 시작을 거절한다 — 실제로 전용 설정 셋이 "restart debounced" 로 한 줄도
 * 못 돌았다. 그 실패는 회귀가 아니라 앞 실행의 잔여다.
 */
const COOLDOWN_MS = 6_000;

let first = true;
for (const [conf, specs] of groups) {
	if (!first) {
		console.log(`[regression] 앞 묶음의 재시작 억제가 풀리기를 기다린다 (${COOLDOWN_MS}ms)`);
		Atomics.wait(
			new Int32Array(new SharedArrayBuffer(4)),
			0,
			0,
			COOLDOWN_MS,
		);
	}
	first = false;

	const specArgs = specs.flatMap((spec) => ["--spec", `e2e-tauri/specs/${spec}`]);
	console.log(`[regression] ${conf} — 스펙 ${specs.length}개`);
	// 출력을 화면에 그대로 내면서 동시에 모은다. 십몇 분 도는 동안 아무
	// 소리가 없으면 사람이 멈춘 줄 알고 취소한다. 예전에는 `sh -c "... | tee"`
	// 로 했는데 윈도우에는 sh 가 없어 그 기계에서는 아예 돌지 않았다.
	let ok = true;
	const chunks = [];
	const child = spawnSync(
		process.platform === "win32" ? "pnpm.cmd" : "pnpm",
		[
			"-C",
			"packages/shell",
			"exec",
			"wdio",
			"run",
			`e2e-tauri/${conf}`,
			...specArgs,
		],
		{
			encoding: "utf8",
			stdio: ["inherit", "pipe", "pipe"],
			maxBuffer: 512 * 1024 * 1024,
			// 윈도우에서 pnpm 은 pnpm.cmd 다. Node 는 .cmd/.bat 를 shell 없이 spawn
			// 하면 EINVAL 로 죽어(스폰 자체 실패) wdio 가 한 번도 뜨지 않는다.
			// build-e2e-tauri.mjs 도 같은 이유로 win32 에서 shell 을 켠다.
			shell: process.platform === "win32",
		},
	);
	if (child.stdout) {
		process.stdout.write(child.stdout);
		chunks.push(child.stdout);
	}
	if (child.stderr) {
		process.stderr.write(child.stderr);
		chunks.push(child.stderr);
	}
	if (child.error || child.status !== 0) {
		ok = false;
		status = "failed";
		const message = String(
			child.error?.message ?? `종료 코드 ${child.status}`,
		).slice(0, 200);
		detail = detail ? `${detail}; ${conf}: ${message}` : `${conf}: ${message}`;
	}
	const output = chunks.join("\n");

	const outcome = parseSpecOutcomes(output);
	// 묶음이 통과하면 맡은 것을 다 돈 것이다. 실패했으면 리포터가 통과라고
	// 밝힌 스펙만 센다 — 판정을 못 읽은 스펙은 돌지 않은 것으로 둔다.
	const ran = ok ? specs : outcome.passed.filter((spec) => specs.includes(spec));
	executed.push(...ran);
	groupResults.push({
		conf,
		specs: specs.length,
		status: ok ? "passed" : "failed",
		passed: ran.length,
		failedSpecs: outcome.failed.filter((spec) => specs.includes(spec)),
	});
}

/**
 * 이 실행이 어느 코드·어느 목록에서 나왔는지 남긴다.
 *
 * 기록은 저장소에 커밋되는 JSON 일 뿐이라, 손으로 써도 게이트가 받아들인다.
 * 그것을 완전히 막을 수는 없다 — 같은 저장소에 커밋할 수 있는 사람이면
 * 파일도 쓸 수 있다. 다만 **실수로 낡거나 어긋난 기록이 통과하는 것**은 막을
 * 수 있다. 인벤토리가 다르면 다른 스펙 목록으로 돈 것이고, 커밋이 다르면
 * 다른 코드에서 돈 것이다. 그 사실을 게이트가 보게 한다.
 */
function fingerprint() {
	const inventoryRaw = readFileSync(INVENTORY);
	const digest = createHash("sha256").update(inventoryRaw).digest("hex");
	let commit = "unknown";
	try {
		commit = execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch {
		// git 이 없는 자리에서도 기록은 남긴다. 다만 추적이 약해진다.
	}
	return {
		inventorySha256: digest,
		commit,
		platform: `${process.platform}-${process.arch}`,
		node: process.version,
	};
}

const record = {
	machine,
	tiers,
	ranOn: fingerprint(),
	started,
	finished: new Date().toISOString(),
	status,
	planned: mine.map((s) => s.spec),
	executed,
	// 어느 wdio 설정이 어디까지 갔는지. 한 설정이 실패해도 다른 설정의
	// 결과는 남는다.
	groups: groupResults,
	// 관측이 아니라 사전 예측이다 — 이 스펙들도 wdio 에 넘어가고, 그 안에서
	// 스스로 건너뛸지 실패할지는 스펙이 정한다. 이름을 그대로 두면 "건너뛰었다"
	// 는 관측으로 읽히므로 무엇인지 밝힌다.
	envMissingBeforeRun: Object.fromEntries(missingEnv),
	detail,
};

const dir = "docs/regression-runs";
mkdirSync(dir, { recursive: true });
const out = join(dir, `${machine}-${started.replace(/[:.]/g, "-")}.json`);
writeFileSync(out, `${JSON.stringify(record, null, "\t")}\n`);
console.log(`[regression] 기록: ${out} (${status})`);

const failedSpecs = [
	...new Set(groupResults.flatMap((g) => g.failedSpecs ?? [])),
];
console.log(
	`\n${channelLine(
		"DONE",
		`${executed.length}/${mine.length} 통과` +
			(failedSpecs.length
				? ` · 실패 ${failedSpecs.slice(0, 4).join(", ")}${failedSpecs.length > 4 ? ` 외 ${failedSpecs.length - 4}` : ""}`
				: ""),
	)}\n`,
);
process.exit(status === "passed" ? 0 : 1);
