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
const HELPER_DIR = join(CONF_DIR, "helpers");

// 장치를 요구한다고 보는 신호. 이름이 아니라 무엇을 켜는지로 고른다.
const DEVICE_ENV = /VOICE|AUDIO|VOXCPM2|NVA|SCREENSHOT|GPU|CASCADE/;

/**
 * 장치를 실제로 여는 스펙이 부르는 것들.
 *
 * 마이크·스피커·GPU 는 환경 변수에 드러나지 않는다. 그 스펙이 무엇을 부르는지로
 * 본다 — PipeWire 로 가상 소스를 만들거나, espeak 로 소리를 내거나,
 * nvidia-smi 로 GPU 를 묻는 자리다.
 */
const DEVICE_TOOLS =
	/\bpw-play\b|\bpw-cat\b|\bpactl\b|\bespeak\b|\bnvidia-smi\b|getUserMedia|MediaRecorder/;
// 자격증명으로 보는 신호.
const KEY_ENV = /API_KEY|_KEY$|TOKEN|SECRET|USER_ID/;

/**
 * 실제로 모델과 대화하는 스펙이 쓰는 헬퍼.
 *
 * 왜 이름으로 보는가: 셸은 모델 키를 환경 변수가 아니라 앱 설정에서 읽는다.
 * 그래서 "이 스펙이 진짜 대화를 하는가" 는 환경 변수 참조로는 알 수 없다.
 * 실제로 07-cleanup 은 모델에게 메모 삭제를 시키는데 요구 목록에는
 * 산출물 디렉터리 하나뿐이라 결정론 칸에 들어가 있었고, 자격증명 없는
 * 기계가 맡았다가 실패했다.
 */
/**
 * 예전에는 이 넷을 손으로 적어 두었다. 같은 파일에 있는
 * `verifyWithSubAgent`(부심판 모델을 실제로 부른다)가 목록에 없어서, 그
 * 헬퍼만 쓰는 스펙이 `deterministic_ci` 로 분류됐다 — 자격증명 없는 기계가
 * 맡았다가 실패하는, 이미 두 번 겪은 그 오분류다.
 *
 * 이제 목록을 만들지 않는다. **모델과 말을 섞는 헬퍼 모듈을 통째로** 본다.
 * 그 모듈이 내보내는 이름은 전부 대화 신호다. 새 헬퍼가 늘어도 목록을
 * 고칠 일이 없고, 고치는 것을 잊어 생기는 오분류도 없다.
 */
// 예전에는 모듈 이름 둘을 손으로 적었다. 그래서 다른 헬퍼 모듈에 모델을
// 부르는 함수를 두면 결정론 칸에 들어갔다 — 손 목록을 함수에서 모듈로 옮긴
// 것뿐이었다.
//
// 이제 모듈 목록도 만들지 않는다. 헬퍼 디렉터리를 전부 읽고, **모델과 말을
// 섞는 자국**이 있는 모듈을 대화 모듈로 본다. 자국은 판정 모델 호출, 모델
// 제공자 주소, 자격증명 이름이다.
// 자국은 두 갈래다. 하나는 모델을 직접 부르는 것(주소·자격증명·판정 호출),
// 다른 하나는 **앱의 대화 화면을 통해** 모델과 말하는 것이다. chat.ts 는
// 뒤쪽이라 HTTP 자국이 하나도 없다 — 앞쪽만 보면 그 모듈이 통째로 빠진다.
// 주소 목록을 손으로 적으면 목록에 없는 제공자로 빠져나간다 — 이 저장소가
// 기본으로 쓰는 xAI(`api.x.ai`)가 빠져 있었다. 제공자 주소는 셸의 registry 가
// 이미 알고 있으므로 거기서 뽑는다.
// 셸이 아는 제공자 식별자를 그대로 쓴다. 주소를 손으로 적으면 목록에 없는
// 제공자로 빠져나간다 — 이 저장소가 쓰는 xAI 가 그렇게 빠져 있었다.
// 식별자는 `api.x.ai`, `api.openai.com` 같은 주소 안에 그대로 나타난다.
const registrySource = readFileSync(
	"packages/shell/src/lib/llm/registry.ts",
	"utf8",
);
const providerIds = [
	...new Set(
		[...registrySource.matchAll(/^\t\t?id:\s*["']([a-z0-9-]+)["']/gm)].map(
			(m) => m[1],
		),
	),
].filter((id) => id.length >= 2);
const providerHosts = [
	...new Set([
		// 주소는 식별자를 그대로 쓰지 않는다 — `xai` 가 `api.x.ai` 다. 글자
		// 사이에 점이 끼어도 같은 제공자로 본다. `api.` 로 시작하고 점으로
		// 끝나는 자리에만 쓰므로 넓지 않다.
		...providerIds.map(
			// 뒤는 점이거나 경로 구분자다. 점만 요구하면 `api.x.ai/v1` 처럼
			// 도메인이 거기서 끝나는 주소를 놓친다.
			(id) => `api\\.${id.replace(/-/g, "").split("").join("\\.?")}[./]`,
		),
		...[...registrySource.matchAll(/https?:\/\/([a-z0-9.-]+)/g)]
			.map((m) => m[1])
			.filter((host) => /^api\./.test(host)),
	]),
];
if (providerIds.length < 5) {
	console.error(
		`[e2e-inventory] 제공자를 ${providerIds.length}개밖에 못 찾았다 — registry 경로가 바뀌었는지 보라`,
	);
	process.exit(2);
}
const TALKS_TO_MODEL = new RegExp(
	[
		...providerHosts,
		String.raw`\bjudge\w*\s*\(`,
		"API_KEY",
		String.raw`_KEY\b`,
		"GATEWAY",
		String.raw`\.chat-message`,
		String.raw`\bassistant\w*\b`,
		"chat-input",
	].join("|"),
);
const chatHelperNames = new Set(["judge"]);
for (const entry of readdirSync(HELPER_DIR).filter((f) => f.endsWith(".ts"))) {
	let source;
	try {
		source = readFileSync(join(HELPER_DIR, entry), "utf8");
	} catch {
		continue;
	}
	if (!TALKS_TO_MODEL.test(source)) continue;
	for (const m of source.matchAll(
		/^export\s+(?:async\s+)?function\s+(\w+)/gm,
	))
		chatHelperNames.add(m[1]);
	for (const m of source.matchAll(/^export\s+const\s+(\w+)\s*=/gm))
		chatHelperNames.add(m[1]);
}
if (chatHelperNames.size < 5) {
	console.error(
		`[e2e-inventory] 대화 헬퍼를 ${chatHelperNames.size}개밖에 못 찾았다 — helpers 경로가 바뀌었는지 보라`,
	);
	process.exit(2);
}
const CHAT_HELPERS = new RegExp(
	`\\b(?:${[...chatHelperNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*\\(`,
);

/**
 * 전용 설정이 요구하는 환경도 그 스펙의 요구다.
 *
 * 설정은 모듈 최상위에서 그것을 확인하고 없으면 던진다. 그러면 스펙은 한 줄도
 * 돌지 못하는데, 요구 목록에는 그 사실이 없어 "환경이 갖춰졌다" 로 보인다 —
 * 실제로 전용 설정 넷이 그렇게 실패했다.
 */
const confEnv = new Map();

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
const AMBIENT =
	/^(?:PATH|HOME|LD_LIBRARY_PATH|RUST_LOG|CI|NODE_ENV|TMPDIR|TAURI_BINARY|NAIA_E2E_TARGET_DIR|NAIA_AGENT_WORKTREES_DIR|NAIA_E2E_AGENT_ROOT)$/;

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

// 전용 설정의 요구는 requiredEnv 가 정의된 뒤에 채운다. 위에서 부르면
// 초기화 전 접근이 된다.
for (const name of readdirSync(CONF_DIR).filter((f) => /^wdio\.conf\..+\.ts$/.test(f))) {
	confEnv.set(name, requiredEnv(readFileSync(join(CONF_DIR, name), "utf8")));
}

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
	// 이 스펙을 맡는 전용 설정의 요구도 함께 센다.
	const fromConf = (confOwners.get(name) ?? []).flatMap(
		(conf) => confEnv.get(conf) ?? [],
	);
	const envs = [...new Set([...direct, ...viaHelpers, ...fromConf])].sort();
	const device = envs.some((e) => DEVICE_ENV.test(e));
	// 대화 헬퍼를 부르면 모델이 필요하다 — 환경 변수에 드러나지 않아도.
	const talks = CHAT_HELPERS.test(source);
	// 장치도 환경 변수로 드러나지 않는다. 마이크를 여는 스펙은 오디오 장치와
	// 그것을 먹이는 도구를 요구하는데, 그 사실이 env 목록에는 없다 — 실제로
	// 마이크 스펙 하나가 결정론 칸에 있다가 장치 없는 기계에서 실패했다.
	const usesDevice = DEVICE_TOOLS.test(source);
	const keyed = envs.some((e) => KEY_ENV.test(e));
	rows.push({
		spec: name,
		conf: confOwners.get(name) ?? [],
		env: envs,
		tier: device || usesDevice
			? "native_local"
			: keyed || talks
				? "credentialed_live"
				: "deterministic_ci",
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
