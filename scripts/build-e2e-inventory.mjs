/**
 * 실기 e2e 스펙이 무엇을 요구하는지 목록으로 뽑는다.
 *
 * 등급 이름은 새로 짓지 않고 .agents/context/feature-test-coverage.yaml 의
 * 어휘를 그대로 쓴다. 같은 것을 두 이름으로 부르면 두 목록이 서로 다른 말을
 * 하게 된다.
 *
 * 왜 필요한가: 스펙은 129개인데 어느 것이 어디서 돌 수 있는지 아무 데도
 * 적혀 있지 않다. 그 사실이 스펙 안의 환경 변수 조건문과 전용 wdio 설정에
 * 흩어져 있어서, "무엇이 안 돌고 있는가" 를 물어도 셀 수가 없다. 셀 수 없는
 * 것은 나눌 수도 없고, 나눌 수 없으면 여러 기계로 회귀를 돌릴 수 없다.
 *
 * 무엇을 뽑는가: 스펙마다 (1) 어느 wdio 설정이 맡는지 (2) 어떤 환경 변수를
 * 요구하는지 (3) 그래서 어떤 등급인지. 등급은 요구 조건에서 기계로 정한다 —
 * 사람이 붙이는 꼬리표는 곧 낡는다.
 *
 * 등급(feature-test-coverage.yaml 과 같은 어휘):
 *   deterministic_ci   자격증명 없이 돈다
 *   credentialed_live  외부 자격증명이 필요하다(모델 키, 게이트웨이 토큰)
 *   native_local       그 기계의 장치가 필요하다(GPU, 오디오, 데스크톱 세션)
 *
 * 산출물: docs/e2e-inventory.json (기계가 읽는 것) 과 표준 출력 요약.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SPEC_DIR = "packages/shell/e2e-tauri/specs";
const CONF_DIR = "packages/shell/e2e-tauri";

// 장치를 요구한다고 보는 신호. 이름이 아니라 무엇을 켜는지로 고른다.
const DEVICE_ENV = /VOICE|AUDIO|VOXCPM2|NVA|SCREENSHOT|GPU|CASCADE/;
// 자격증명으로 보는 신호.
const KEY_ENV = /API_KEY|_KEY$|TOKEN|SECRET|USER_ID/;

const confOwners = new Map();
for (const name of readdirSync(CONF_DIR).filter((f) => /^wdio\.conf\..+\.ts$/.test(f))) {
	const source = readFileSync(join(CONF_DIR, name), "utf8");
	for (const match of source.matchAll(/"\.\/specs\/([^"]+)"/g)) {
		const list = confOwners.get(match[1]) ?? [];
		list.push(name);
		confOwners.set(match[1], list);
	}
}

// 스펙이 직접 부르지 않아도, 불러 쓰는 헬퍼가 자격증명을 요구하면 그 스펙은
// 자격증명 없이 돌지 않는다. 실측에서 드러났다 — 06-skill-memo 는 env 를 하나도
// 적지 않았는데 helpers/semantic 이 판정 모델 키를 요구해 실패했다. 직접 참조만
// 세면 목록이 "돌 수 있다" 고 거짓말한다.
/**
 * 그 소스가 실제로 **필요로 하는** 환경 변수만 뽑는다.
 *
 * 세 가지를 가린다.
 *
 *   1) 쓸 만한 기본값이 있는 노브는 요구가 아니다. `?? "15000"` 처럼 실제
 *      값을 뒤에 둔 것은 없어도 돈다. 빈 문자열 기본(`?? ""`)은 다르다 —
 *      그것은 "없으면 빈 값으로 죽는다" 는 뜻이므로 요구로 센다.
 *   2) 이름을 변수로 받아 `process.env[name]` 으로 읽는 자리는 직접 참조가
 *      없다. 대신 그 이름이 소스 안에 문자열로 적혀 있으므로(`keyEnv:
 *      "OPENAI_API_KEY"`) 자격증명처럼 생긴 문자열도 함께 본다.
 *   3) 실행 환경이 늘 갖는 것(PATH 계열)은 요구가 아니다.
 */
const AMBIENT = /^(?:PATH|HOME|LD_LIBRARY_PATH|RUST_LOG|CI|NODE_ENV|TMPDIR)$/;

function requiredEnv(source) {
	const found = new Set();
	for (const m of source.matchAll(
		/process\.env\.([A-Z_0-9]+)\s*(?:(\|\||\?\?)\s*("(?:[^"\\]|\\.)*"|`[^`]*`|'[^']*'))?/g,
	)) {
		const [, name, , fallback] = m;
		if (AMBIENT.test(name)) continue;
		// 뒤에 실제 값이 붙어 있으면 없어도 돈다. 빈 문자열은 값이 아니다.
		if (fallback && fallback.replace(/^["'`]|["'`]$/g, "").length > 0) continue;
		found.add(name);
	}
	// 이름을 문자열로 들고 다니다 `process.env[name]` 으로 읽는 자리.
	if (/process\.env\[/.test(source)) {
		for (const m of source.matchAll(/["'`]([A-Z][A-Z_0-9]{3,})["'`]/g)) {
			if (!AMBIENT.test(m[1]) && KEY_ENV.test(m[1])) found.add(m[1]);
		}
	}
	return [...found];
}

const HELPER_DIR = join(CONF_DIR, "helpers");
const helperEnv = new Map();
for (const name of readdirSync(HELPER_DIR).filter((f) => f.endsWith(".ts"))) {
	const source = readFileSync(join(HELPER_DIR, name), "utf8");
	helperEnv.set(name.replace(/\.ts$/, ""), requiredEnv(source));
}

const rows = [];
for (const name of readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts")).sort()) {
	const source = readFileSync(join(SPEC_DIR, name), "utf8");
	const direct = requiredEnv(source);
	// import 는 확장자를 붙여 쓴다(NodeNext). 빼고 잡으면 하나도 못 만난다.
	const viaHelpers = [...source.matchAll(/from\s+"\.\.\/helpers\/([a-z-]+)(?:\.js)?"/g)]
		.flatMap((m) => helperEnv.get(m[1]) ?? []);
	const envs = [...new Set([...direct, ...viaHelpers])].sort();
	const device = envs.some((e) => DEVICE_ENV.test(e));
	const keyed = envs.some((e) => KEY_ENV.test(e));
	rows.push({
		spec: name,
		conf: confOwners.get(name) ?? [],
		env: envs,
		tier: device ? "native_local" : keyed ? "credentialed_live" : "deterministic_ci",
	});
}

const summary = rows.reduce((acc, row) => {
	acc[row.tier] = (acc[row.tier] ?? 0) + 1;
	return acc;
}, {});

const rendered = `${JSON.stringify({ generatedFrom: SPEC_DIR, total: rows.length, summary, specs: rows }, null, "\t")}\n`;
const OUT = "docs/e2e-inventory.json";

// --check 는 CI 몫이다. 스펙이 늘거나 요구 조건이 바뀌었는데 목록이 그대로면,
// 그 목록을 보고 기계를 나누는 사람이 없는 스펙을 나누게 된다.
if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(OUT, "utf8");
	} catch {
		console.error(`[e2e-inventory] ❌ ${OUT} 이 없다 — node scripts/build-e2e-inventory.mjs 로 만들어라`);
		process.exit(1);
	}
	if (current !== rendered) {
		console.error(`[e2e-inventory] ❌ ${OUT} 이 지금 스펙과 어긋난다 — 다시 생성해 커밋하라`);
		process.exit(1);
	}
	console.log(`[e2e-inventory] ✓ ${OUT} 이 지금 스펙과 일치한다 (${rows.length}개)`);
	process.exit(0);
}

writeFileSync(OUT, rendered);

console.log(`[e2e-inventory] 스펙 ${rows.length}개 → docs/e2e-inventory.json`);
for (const [tier, count] of Object.entries(summary).sort()) console.log(`  ${tier.padEnd(7)} ${count}`);
const owned = rows.filter((r) => r.conf.length).length;
console.log(`  전용 wdio 설정이 맡는 것 ${owned} / 메인 harness 만 맡는 것 ${rows.length - owned}`);
