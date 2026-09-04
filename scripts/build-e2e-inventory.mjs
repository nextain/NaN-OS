/**
 * 실기 e2e 스펙이 무엇을 요구하는지 목록으로 뽑는다.
 *
 * 왜 필요한가: 스펙은 130개인데 어느 것이 어디서 돌 수 있는지 아무 데도
 * 적혀 있지 않다. 그 사실이 스펙 안의 환경 변수 조건문과 전용 wdio 설정에
 * 흩어져 있어서, "무엇이 안 돌고 있는가" 를 물어도 셀 수가 없다. 셀 수 없는
 * 것은 나눌 수도 없고, 나눌 수 없으면 여러 기계로 회귀를 돌릴 수 없다.
 *
 * 무엇을 뽑는가: 스펙마다 (1) 어느 wdio 설정이 맡는지 (2) 어떤 환경 변수를
 * 요구하는지 (3) 그래서 어떤 등급인지. 등급은 요구 조건에서 기계로 정한다 —
 * 사람이 붙이는 꼬리표는 곧 낡는다.
 *
 * 등급:
 *   ci       요구 조건 없음. 러너에서 돌 수 있다
 *   keyed    외부 자격증명이 필요하다(모델 키, 게이트웨이 토큰)
 *   device   그 기계의 장치가 필요하다(GPU, 오디오, 실제 데스크톱 세션)
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

const rows = [];
for (const name of readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts")).sort()) {
	const source = readFileSync(join(SPEC_DIR, name), "utf8");
	const envs = [
		...new Set([...source.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map((m) => m[1])),
	].sort();
	const device = envs.some((e) => DEVICE_ENV.test(e));
	const keyed = envs.some((e) => KEY_ENV.test(e));
	rows.push({
		spec: name,
		conf: confOwners.get(name) ?? [],
		env: envs,
		tier: device ? "device" : keyed ? "keyed" : "ci",
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
