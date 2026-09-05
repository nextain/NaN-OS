#!/usr/bin/env node
/**
 * 데이터 홈(`~/.naia`)에는 `adk-path` 하나만 둔다.
 *
 * 나머지는 모두 그 파일이 가리키는 ADK 아래에 있어야 하고, 그 위치는
 * `adk-path` 에서 파생돼야 한다. 코드가 홈을 직접 짚으면 ADK 를 옮겼을 때
 * 데이터가 따라가지 못한다 — 실측에서 홈에 17GB 가 쌓여 있었고, 그 대부분이
 * 음성 런타임이었다(docs/storage-locations.md).
 *
 * 이 검사는 옮기는 일을 대신하지 않는다. **새로 늘어나는 것을 막는다.**
 *
 * ## 어디서 재는가 (10회차 지적 6 이후)
 *
 * 예전에는 `naia_data_home*(…)` 뒤 200자 안의 `.join("리터럴")` 을 찾았다.
 * 그 창은 `dir.push("...")`, 이름을 담은 상수, 200자 넘는 패딩 세 가지로
 * 각각 뚫렸다. 형태를 하나씩 더 열거하는 대신 **측정 지점을 옮겼다.**
 *
 * 이제 데이터 홈 아래 경로를 만드는 코드는 `src-tauri/src/data_home.rs`
 * 한 파일에만 있다. 그 파일 밖에서는
 *
 *   - 데이터 홈을 돌려주는 함수(`naia_data_home*`)를 부를 수도 없고,
 *   - 사용자 홈을 직접 구할 수도 없으며(`home_dir`, `HOME`/`USERPROFILE`),
 *   - `.naia` 라는 경로 마디를 문자열로 적을 수도 없다.
 *
 * 그래서 `push` 든 상수든 패딩이든, 자리를 만들려면 **모듈 밖에서 홈을
 * 짚어야** 하고 그 사실 자체가 잡힌다. 자리를 정말 하나 늘리려면
 * `DataHomeChild` 에 변형을 더해야 하고, 그러면 이름표가 늘어나 아래 `KNOWN`
 * 과 `docs/storage-locations.md` 의 표와 어긋나 붉어진다.
 *
 * 판정은 정규식이 아니라 **Rust 토크나이저**가 한다. 주석과 문자열을 갈라
 * 내고, 식별자는 코드 쪽에서, 경로 마디는 문자열 쪽에서만 본다. 형태를 세는
 * 자리가 없으니 형태를 하나 더 만들어도 빠져나갈 곳이 없다.
 *
 * ## 이 검사가 보증하지 않는 것 (경계를 여기서 끊는다)
 *
 * 보증 범위는 "`~/.naia` **바로 아래** 새 자리가 이름표 없이 생기지 않는다"
 * 하나다. 아래 셋은 보지 않는다 — 무한히 단단해지지 않도록 여기서 끊는다.
 *
 *   1. 이미 알려진 자리 **안쪽**(`logs/` 밑의 파일 이름, `apps/<앱 id>/…`)은
 *      그 자리를 가진 모듈의 책임이다.
 *   2. 문자를 조립해 `.naia` 를 만드는 코드(`format!(".{}", "naia")`)는 우회가
 *      아니라 위조다. 리뷰가 볼 몫이다.
 *   3. 모듈이 돌려준 경로를 위로 거슬러(`parent`·`pop`) 형제 자리를 만드는 것.
 *      데이터 홈 디렉터리 자체를 돌려주는 함수는 모듈 밖에 없으므로(비공개)
 *      그러려면 눈에 띄는 경로 산술을 적어야 한다.
 *   4. Rust 밖(TypeScript·스크립트·wdio 설정)에서 홈을 짚는 것. e2e 실행 자리
 *      격리는 `src/test/e2e-runtime-isolation.contract.test.ts` 가 따로 든다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SHELL = "packages/shell";
const RUST_ROOT = `${SHELL}/src-tauri/src`;
/** 데이터 홈 아래 자리를 만드는 유일한 파일. 이 파일만 아래 규칙에서 면제된다. */
const FUNNEL = `${RUST_ROOT}/data_home.rs`;

/**
 * 오늘 데이터 홈 아래를 짚는 자리. 옮기고 나면 그 항목을 지운다.
 * 이름은 `data_home.rs` 의 `DataHomeChild::name()` 대응표와 정확히 같아야 한다.
 */
const KNOWN = new Map([
	["adk-path", "어느 ADK 를 볼지 가리키는 부트스트랩 포인터. 여기 남는 유일한 것"],
	["logs", "셸 로그. ADK 아래로 옮겨야 한다"],
	["run", "실행 중 PID 파일. ADK 아래로 옮겨야 한다"],
	["skills", "설치된 스킬. ADK 아래로 옮겨야 한다"],
	[
		"voxcpm2-runtime",
		"로컬 음성 런타임 17GB. 이 기계의 음성 서비스가 지금 쓰고 있어 옮기려면 사람이 중단 창을 잡아야 한다",
	],
	["apps", "설치된 앱. ADK 아래로 옮겨야 한다"],
	["panels", "#472 이전의 앱 자리. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.json", "에이전트 자식 리스. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.lock", "위 리스의 잠금 파일"],
	[
		"chrome-profile",
		"내장 브라우저 프로필. 사용자의 로그인 상태가 들어 있어 옮기면 다시 로그인해야 한다 — 옮길 때 그 사실을 알려야 한다",
	],
	["login-profile", "로그인 전용 브라우저 프로필. 위와 같다"],
	[
		"deep-link-pending.txt",
		"macOS·윈도우의 딥링크 대기 파일. 앱이 뜨기 전에 쓰이므로 ADK 위치를 아직 모를 수 있다 — 옮길 때 그 순서를 함께 풀어야 한다",
	],
	["dev-deeplink", "macOS 개발 인스턴스의 딥링크 자리. 위와 같다"],
	[
		"workspace",
		"게이트웨이 기본 설정이 적는 에이전트 워크스페이스. 경로가 아니라 `~/.naia/workspace` 문자열로 설정에 실려 나가 다른 프로세스가 푼다 — 옛 200자 창 검사가 못 보던 자리다",
	],
]);

/** 모듈 밖에서 부르면 데이터 홈을 다시 만들 수 있는 이름들. */
const BANNED_IDENTIFIERS = [
	// 데이터 홈을 돌려주는 함수
	/\bnaia_data_home\w*\b/,
	// 사용자 홈을 돌려주는 함수 (`dirs::home_dir`, `crate::home_dir`)
	/\bhome_dir\b/,
];

/** 모듈 밖에서 읽으면 홈을 다시 구할 수 있는 환경 변수 이름. */
const BANNED_LITERALS = new Set(["HOME", "USERPROFILE", "NAIA_HOME"]);

/** 문자열 안에서 `.naia` 가 경로 **마디**로 나오는가. */
const DATA_HOME_SEGMENT = /(^|[/\\])\.naia($|[/\\])/;

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

/**
 * Rust 소스를 코드와 문자열로 가른다. 주석은 버린다.
 *
 * 정규식으로 형태를 세지 않기 위한 최소 토크나이저다. 주석 안의 `~/.naia/logs`
 * 설명이 위반으로 잡히거나, 문자열 안의 `home_dir` 이라는 글자가 호출로 잡히는
 * 일이 없어야 판정이 뜻과 맞는다.
 */
function splitCodeAndStrings(source) {
	let code = "";
	const strings = [];
	let line = 1;
	let i = 0;
	const n = source.length;

	const push = (text) => {
		code += text;
		for (const ch of text) if (ch === "\n") line += 1;
	};

	while (i < n) {
		const ch = source[i];

		// 줄 주석
		if (ch === "/" && source[i + 1] === "/") {
			while (i < n && source[i] !== "\n") i += 1;
			continue;
		}
		// 블록 주석 (Rust 는 중첩된다)
		if (ch === "/" && source[i + 1] === "*") {
			let depth = 1;
			i += 2;
			while (i < n && depth > 0) {
				if (source[i] === "/" && source[i + 1] === "*") {
					depth += 1;
					i += 2;
				} else if (source[i] === "*" && source[i + 1] === "/") {
					depth -= 1;
					i += 2;
				} else {
					if (source[i] === "\n") line += 1;
					i += 1;
				}
			}
			push(" ");
			continue;
		}
		// 로 문자열: r"…", r#"…"#, br##"…"##
		const raw = /^(b?r)(#*)"/.exec(source.slice(i, i + 40));
		if (raw && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
			const hashes = raw[2];
			const startLine = line;
			let j = i + raw[0].length;
			const terminator = `"${hashes}`;
			const end = source.indexOf(terminator, j);
			const stop = end === -1 ? n : end;
			const value = source.slice(j, stop);
			strings.push({ value, line: startLine });
			for (const c of source.slice(i, stop + terminator.length)) {
				if (c === "\n") line += 1;
			}
			i = stop + terminator.length;
			push(" ");
			continue;
		}
		// 보통 문자열: "…" (b"…" 포함)
		if (ch === '"' || (ch === "b" && source[i + 1] === '"')) {
			const startLine = line;
			let j = ch === '"' ? i + 1 : i + 2;
			let value = "";
			while (j < n) {
				if (source[j] === "\\") {
					value += source[j + 1] ?? "";
					if (source[j + 1] === "\n") line += 1;
					j += 2;
					continue;
				}
				if (source[j] === '"') break;
				if (source[j] === "\n") line += 1;
				value += source[j];
				j += 1;
			}
			strings.push({ value, line: startLine });
			i = j + 1;
			push(" ");
			continue;
		}
		// 문자 리터럴과 수명(lifetime) 을 가린다
		if (ch === "'") {
			const charLiteral = /^'(\\.|[^\\'])'/.exec(source.slice(i, i + 12));
			if (charLiteral) {
				i += charLiteral[0].length;
				push(" ");
				continue;
			}
			push(ch);
			i += 1;
			continue;
		}
		push(ch);
		i += 1;
	}
	return { code, strings };
}

/** 코드 텍스트에서 금지 식별자가 나오는 줄을 찾는다. */
function findIdentifierHits(code) {
	const hits = [];
	const lines = code.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		for (const pattern of BANNED_IDENTIFIERS) {
			const m = pattern.exec(lines[index]);
			if (m) hits.push({ line: index + 1, name: m[0] });
		}
	}
	return hits;
}

/** `data_home.rs` 의 `DataHomeChild::name()` 대응표에서 이름을 읽는다. */
function funnelNames() {
	if (!existsSync(FUNNEL)) return null;
	const source = readFileSync(FUNNEL, "utf8");
	const body = /const fn name\(self\) -> &'static str \{([\s\S]*?)\n    \}/.exec(source);
	if (!body) return null;
	const names = [];
	for (const m of body[1].matchAll(/DataHomeChild::\w+\s*=>\s*"([^"]+)"/g)) {
		names.push(m[1]);
	}
	return names;
}

/** 문서의 자리 표에서 이름을 읽는다. */
function docNames() {
	const path = "docs/storage-locations.md";
	if (!existsSync(path)) return null;
	const source = readFileSync(path, "utf8");
	const section = /### 코드가 홈 아래에 만드는 자리[^\n]*\n([\s\S]*?)(?:\n### |\n## |$)/.exec(
		source,
	);
	if (!section) return null;
	const names = [];
	for (const row of section[1].split("\n")) {
		const m = /^\|\s*`([^`]+)`\s*\|/.exec(row);
		if (m) names.push(m[1]);
	}
	return names;
}

let failed = false;
function fail(message, details = []) {
	failed = true;
	console.error(`  ❌ ${message}`);
	for (const d of details) console.error(`     ${d}`);
}

// --- 1. 모듈 밖에서 홈을 짚었는가 ---------------------------------------

const escapes = [];
const files = tracked(RUST_ROOT, ".rs");
for (const file of files) {
	if (file === FUNNEL) continue;
	const { code, strings } = splitCodeAndStrings(readFileSync(file, "utf8"));
	for (const hit of findIdentifierHits(code)) {
		escapes.push(`${file}:${hit.line} — \`${hit.name}\` (data_home 모듈 밖에서 홈을 구한다)`);
	}
	for (const s of strings) {
		if (BANNED_LITERALS.has(s.value)) {
			escapes.push(
				`${file}:${s.line} — 환경 변수 "${s.value}" 를 직접 읽는다 (data_home 이 든다)`,
			);
		}
		if (DATA_HOME_SEGMENT.test(s.value)) {
			escapes.push(
				`${file}:${s.line} — 문자열에 \`.naia\` 마디가 있다 (${JSON.stringify(s.value.slice(0, 60))})`,
			);
		}
	}
}

if (!existsSync(FUNNEL)) {
	fail(`깔때기 모듈이 없다: ${FUNNEL}`, [
		"데이터 홈 아래 자리는 그 파일 하나에서만 만든다.",
	]);
}

console.log(
	`[data-home] Rust 파일 ${files.length}개를 토큰으로 갈라 홈 접근을 본다 (깔때기: ${FUNNEL})`,
);

if (escapes.length) {
	fail(`데이터 홈을 모듈 밖에서 짚었다(${escapes.length}) — 거기에는 adk-path 하나만 둔다:`, [
		...escapes,
		"자리를 늘리려면 data_home::DataHomeChild 에 변형을 더하고, 그 자리를 ADK 아래로 두라.",
		"docs/storage-locations.md 를 보라.",
	]);
}

// --- 2. 이름표·검사기 목록·문서가 같은가 --------------------------------

const names = funnelNames();
if (!names) {
	fail("깔때기 모듈에서 자리 이름표를 읽지 못했다", [
		"`DataHomeChild::name()` 의 대응표 모양이 바뀌었다면 이 검사도 함께 고쳐라.",
	]);
} else {
	console.log(`[data-home] 이름표 ${names.length}개 (사유 적어 둔 것 ${KNOWN.size})`);
	const duplicated = names.filter((n, i) => names.indexOf(n) !== i);
	if (duplicated.length) {
		fail("이름표가 겹친다 — 자리 하나에 이름 하나다:", duplicated);
	}
	const unexpected = names.filter((n) => !KNOWN.has(n));
	if (unexpected.length) {
		fail(`이름표에는 있고 사유가 없다(${unexpected.length}):`, unexpected);
	}
	const stale = [...KNOWN.keys()].filter((n) => !names.includes(n));
	if (stale.length) {
		fail(`옮겼는데 목록에 남아 있다(${stale.length}) — 지워라. 남겨 두면 다음 자리를 덮는다:`, stale);
	}
	const documented = docNames();
	if (!documented) {
		fail("docs/storage-locations.md 의 자리 표를 읽지 못했다");
	} else {
		const missing = names.filter((n) => !documented.includes(n));
		const extra = documented.filter((n) => !names.includes(n));
		if (missing.length || extra.length) {
			fail("문서의 자리 표가 이름표와 다르다:", [
				...missing.map((n) => `문서에 없다: ${n}`),
				...extra.map((n) => `코드에 없다: ${n}`),
			]);
		}
	}
}

if (failed) process.exit(1);
console.log("  ✓ 모듈 밖에서 홈을 짚는 자리 없음 · 이름표·목록·문서가 같다");
