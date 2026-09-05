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
const HANGUL = /[가-힣]/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "__tests__") continue;
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
		.filter((line) => !COMMENT.test(line) && HANGUL.test(line));
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
const SHADOW_TABLE = /getLocale\(\)\s*===\s*["'`]\w+["'`]\s*\?/;

const shadows = [];
for (const file of walk(ROOT)) {
	if (SHADOW_TABLE.test(readFileSync(file, "utf8"))) shadows.push(file);
}

// 오늘의 상태. 줄이는 것이 목표이고 늘리는 것을 막는다.
// `.ts` 를 함께 보기 시작하면서 분모가 커졌다. 이전 값(435줄/38파일)은
// `.tsx` 만 센 것이라 문자열을 `.ts` 로 옮기기만 해도 게이트를 피할 수
// 있었다. 그 범위로 다시 세면 658줄이었고, 로케일 밖 번역표 다섯을
// 옮기면서 592줄이 되었다.
const BASELINE_LINES = 588;
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
