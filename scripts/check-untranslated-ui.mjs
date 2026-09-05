/**
 * 화면에 그대로 박힌 한국어가 늘지 못하게 막는다.
 *
 * 왜 필요한가: 로케일이 열넷인데 화면 문자열 일부가 t() 를 거치지 않고 .tsx 에
 * 직접 박혀 있다. 그래서 사용성을 문구로 재려는 시도가 두 갈래로 망가져 있다 —
 * getByText("다시 시도") 같은 취약한 단정과, /다시 시도|try again/i 처럼 어느
 * 쪽이 나와도 통과해 나머지 열두 언어를 전혀 보증하지 않는 단정이다.
 *
 * 같은 문구가 한쪽은 번역 대상이고 한쪽은 아닌 경우도 있다. 예컨대 "다시 시도"
 * 는 locales/ko.ts 에 workspace.herdrRetry 로 키가 있는데, IssuesArea.tsx 는
 * 그 키를 쓰지 않고 글자를 그대로 쓴다.
 *
 * 그래서 품질 프로세스의 사용성 축은 문구가 아니라 i18n 키로 재기로 했고,
 * 그 선행 작업이 이 숫자를 줄이는 것이다. 줄이는 일은 시간이 걸리므로 지금
 * 상태를 baseline 으로 고정하고 늘어나는 것만 막는다.
 *
 * 무엇을 세는가: 테스트가 아닌 .tsx 와 .ts 에서 주석을 뺀 줄 중 한글이 든 줄.
 * 로그 문구나 개발용 문자열도 함께 세어지지만, 목적이 "정확한 분류" 가 아니라
 * "늘지 않게" 이므로 넓게 센다. 좁게 세면 놓친 자리로 다시 는다.
 *
 * 처음에는 `.tsx` 만 봤다. 그 탓에 화면 문자열을 `.ts` 로 옮기기만 하면
 * 게이트를 피할 수 있었고, 실제로 `.ts` 에 한국어가 이백 줄 넘게 더 있었다.
 * 그 안에는 열넷 로케일 체계를 통째로 우회하는 자체 ko/en 표가 둘 있었다
 * (`getLocale() === "ko" ? ko : en`). 그런 표를 쓰는 화면은 나머지 열두
 * 언어에서 무조건 영어가 나온다. 표는 로케일로 옮겨 없앴고, 다시 생기지
 * 못하게 아래에서 따로 막는다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep as SEP } from "node:path";

const ROOT = "packages/shell/src";
/**
 * 한글. 이스케이프로 적은 것도 같은 한글이다 — `\u{5}c5b...` 처럼 써서
 * 눈에 보이지 않게 한 문자열이 검사를 그대로 지나갔다. 두 형태를 함께 본다.
 */
const HANGUL = /[가-힣]/;
/**
 * 한글이 실제로 들어 있는지 — 이스케이프를 풀어서 본다.
 *
 * 문구를 `\uc5c5\ub370\uc774\ud2b8` 처럼 적으면 눈에도 검사에도 보이지
 * 않는다. 다만 정규식의 유니코드 **범위**(`[\uAC00-\uD7AF]`)는 화면
 * 문자열이 아니므로 먼저 걷어내고, 낱자 하나가 아니라 **두 자 이상
 * 이어진** 것만 문구로 본다.
 */
function hasHangul(text) {
	if (/[가-힣]/.test(text)) return true;
	const withoutRanges = text.replace(
		/\\u[0-9a-fA-F]{4}\s*-\s*\\u[0-9a-fA-F]{4}/g,
		"",
	);
	const decoded = withoutRanges
		// ES6 코드포인트 형태 `\u{c5c5}`. 네 자리 형태만 풀던 동안 이 형태로
		// 적은 한글이 그대로 지나갔다.
		.replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);
	return /[가-힣]{2,}/.test(decoded);
}
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "__tests__") continue;
		// 저장소 안에 놓인 다른 저장소의 체크아웃은 이 저장소의 사실이
		// 아니다. UC 게이트가 그것을 훑는 바람에 없는 파일을 있다고
		// 판정한 적이 있다.
		if (name.endsWith("-worktrees") || name === "worktrees") continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (
			(full.endsWith(".tsx") || full.endsWith(".ts")) &&
			!/\.test\.tsx?$/.test(full) &&
			!full.includes(`${SEP}locales${SEP}`)
		)
			out.push(full);
	}
	return out;
}

const perFile = [];
let total = 0;
for (const file of walk(ROOT)) {
	const lines = readFileSync(file, "utf8")
		.split("\n")
		.filter((line) => !COMMENT.test(line) && hasHangul(line));
	if (lines.length) {
		perFile.push({ file, lines: lines.length });
		total += lines.length;
	}
}
perFile.sort((a, b) => b.lines - a.lines);

/**
 * 열넷 로케일을 우회하는 자체 번역표. 로케일 파일 밖에서 언어를 보고
 * 문자열을 고르는 코드는 그 자리에 적힌 언어만 지원한다 — 나머지는 조용히
 * 영어(또는 한국어)가 나오고, 어느 게이트도 그것을 보지 못한다.
 */
/**
 * 로케일을 보고 문자열을 고르는 코드.
 *
 * 처음에는 `getLocale() === "ko" ?` 한 꼴만 봤다. 그래서 변수 하나만 거치면
 * (`const lang = getLocale(); lang === "ko" ? …`) 빠져나갔고, `switch` 나
 * `startsWith` 도 마찬가지였다. 가장 흔한 형태가 그 밖에 있었던 셈이다.
 *
 * 이제는 `getLocale()` 이 나오는 파일에서 언어 코드와 견주는 자리를 찾는다.
 * 언어 코드는 두 글자 소문자다.
 */
/**
 * 로케일을 읽는 자리. 예전에는 `getLocale()` 한 꼴만 봤다. 그래서 같은 표를
 * `navigator.language.slice(0, 2)` 로 바꾸는 것만으로 보이지 않게 됐다 —
 * 하필 이 저장소의 `detectLocale` 이 쓰는 바로 그 값이라 가장 그럴듯한
 * 형태였다. 언어를 알아내는 길을 모두 적는다.
 */
const USES_LOCALE =
	/\bgetLocale\s*\(\)|\bnavigator\.language|\bnavigator\.languages|\bdetectLocale\s*\(|\bi18n\.locale\b|\bcurrentLocale\b|localStorage[^;\n]{0,40}locale|\bloadConfig\s*\([^)]*\)\s*\.\s*locale|\bconfig\.locale\b|["'](?:naia-)?locale["']|documentElement\.lang|\bIntl\.[A-Za-z]+|\bnavigator\.userLanguage|\bdocument\.lang\b/i;
const COMPARES_LANGUAGE = [
	// getLocale() === "ko" / lang === "ko" / locale.startsWith("ko")
	/[\w.()]+\s*===?\s*["'`][a-z]{2}["'`]/,
	/\.startsWith\(\s*["'`][a-z]{2}["'`]/,
	// switch (getLocale()) { case "ko": }
	/case\s+["'`][a-z]{2}["'`]\s*:/,
];

const shadows = [];
for (const file of walk(ROOT)) {
	// 주석은 지운다. "예전에는 getLocale() === \"ko\" 로 골랐다" 같은 설명을
	// 잡으면, 고친 사람이 그 사실을 적을 수 없게 된다.
	const source = readFileSync(file, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
	if (!USES_LOCALE.test(source)) continue;
	// 로케일을 읽기만 하고 언어로 갈라 문자열을 고르지 않는 자리(예: 날짜
	// 형식, HTML lang 속성)는 우회가 아니다. 언어와 견주는 자리가 있어야
	// 표로 본다.
	if (COMPARES_LANGUAGE.some((pattern) => pattern.test(source))) shadows.push(file);
}

// 오늘의 상태. 줄이는 것이 목표이고 늘리는 것을 막는다.
// `.ts` 를 함께 보기 시작하면서 분모가 커졌다. 이전 값(435줄/38파일)은
// `.tsx` 만 센 것이라 문자열을 `.ts` 로 옮기기만 해도 게이트를 피할 수
// 있었다. 그 범위로 다시 세면 658줄이었고, 로케일 밖 번역표 다섯을
// 옮기면서 592줄이 되었다.
const BASELINE_LINES = 585;
const BASELINE_FILES = 66;

console.log(`[untranslated-ui] 화면에 박힌 한국어 ${total}줄 / ${perFile.length}파일 (baseline ${BASELINE_LINES}줄 / ${BASELINE_FILES}파일)`);
for (const row of perFile.slice(0, 5)) console.log(`  ${String(row.lines).padStart(4)} ${row.file}`);

if (shadows.length > 0) {
	console.error(
		`  ❌ 로케일 밖에서 언어로 분기하는 번역표 ${shadows.length}개 — 나머지 열두 언어가 조용히 빠진다:`,
	);
	for (const file of shadows) console.error(`     ${file}`);
	console.error("     locales/ 로 옮기고 t() 로 부르라.");
	process.exit(1);
}

if (total > BASELINE_LINES || perFile.length > BASELINE_FILES) {
	console.error("  ❌ 늘었다. 새 화면 문자열은 t() 와 locales 를 거치게 하라.");
	console.error("     사용성 축은 문구가 아니라 i18n 키로 재기로 했고, 이 숫자가 그 선행 작업이다.");
	process.exit(1);
}
if (total < BASELINE_LINES || perFile.length < BASELINE_FILES)
	console.log("  ✓ 줄었다 — 이 파일의 baseline 도 함께 줄여라");
else console.log("  ✓ 늘지 않았다");
