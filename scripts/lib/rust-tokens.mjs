/**
 * Rust 소스를 **토큰**으로 읽는 최소 도구. 게이트 둘이 함께 쓴다.
 *
 * 왜 이 모듈이 있는가: 데이터 홈 경계 검사(`check-data-home-boundary.mjs`)는
 * 이미 토크나이저로 판정하고 있었는데, 파괴 조작 검사
 * (`check-destructive-affordance.mjs`)는 같은 Rust 파일에서 명령 이름을
 * `#\[tauri::command[^\]]*\][\s\S]{0,200}?fn` 이라는 **글자 창**으로 뽑고
 * 있었다. 그래서 속성과 `fn` 사이에 200자가 넘는 문서 주석을 적으면 그
 * 명령이 목록에서 사라지고, 프런트의 `invoke("…")` 는 확인 검사에서 통째로
 * 건너뛰어졌다 — 확인 없는 삭제가 문서를 길게 적는 것만으로 통과했다
 * (11회차 지적 7).
 *
 * 글자 창을 하나 넓히는 대신 **측정 지점을 옮긴다.** 주석은 토큰이 아니므로
 * 길이와 무관하게 사라지고, 속성·가시성·`async`·`unsafe` 는 토큰으로
 * 건너뛴다. 형태를 세는 자리가 없으니 형태를 하나 더 만들어도 빠져나갈 곳이
 * 없다.
 *
 * ## 속성도 머리를 세지 않는다 (12회차 지적 4 이후)
 *
 * 명령 판정도 한때 `#[` 바로 다음 **네 토큰**이 `tauri::command` 인지만
 * 물었다. 그래서 `#[cfg_attr(all(), tauri::command)]` 는 머리가 `cfg_attr(all(`
 * 이라 명령이 아니었고 — 소스에 `tauri` `::` `command` 토큰이 멀쩡히 있는데도 —
 * 그 명령이 목록에서 사라져 프런트의 `invoke("…")` 가 확인 검사에서 통째로
 * 건너뛰어졌다. 창 길이 대신 속성 중첩으로 같은 사고가 났다.
 *
 * 그래서 여기서도 세는 자리를 없앴다. 속성 토큰 열(`#[` 부터 짝이 맞는 `]`
 * 까지) **어디든** `tauri :: command` 토큰 연쇄가 있으면 명령 속성이다. 중첩
 * (`cfg_attr` 안의 `cfg_attr`)도 같은 규칙으로 잡힌다. 문자열과 주석은
 * 토크나이저가 이미 갈라 두었으므로 `#[doc = "tauri::command"]` 처럼 글자만
 * 같은 것은 `string` 토큰 하나라서 연쇄를 이루지 않는다.
 *
 * 그물이 넓어진 쪽으로 틀린다 — 명령이 아닌 것을 명령으로 볼 수는 있어도
 * (`#[남의매크로(tauri::command)]`) 명령을 목록에서 빠뜨리지는 않는다. 이 게이트가
 * 지키려는 것은 "확인 없는 파괴 조작이 목록 밖으로 새지 않는다" 이므로,
 * 틀리는 방향은 이쪽이어야 한다.
 *
 * ## 수식어도 열거하지 않는다 (13회차 지적 5 이후)
 *
 * 속성과 `fn` 사이를 건너뛰는 자리에도 세는 숫자가 둘 남아 있었다 — 건너뛰기
 * **64회** 한계와, `async`·`unsafe`·`extern`·`default` 뿐인 수식어 **목록**이다.
 * 그래서 속성을 예순다섯 개 붙이거나 `const fn` 으로 적으면 그 명령이 목록에서
 * 사라졌고, 프런트의 `invoke("…")` 는 확인 검사에서 통째로 건너뛰어졌다.
 *
 * 이제 횟수를 세지 않는다(토큰 열은 유한하고, 건너뛰기는 언제나 앞으로만 간다).
 * 수식어도 목록으로 **허용**하는 대신 [`ITEM_STARTERS`] 로 **멈춘다** — 속성
 * 그룹과 가시성 괄호는 짝으로 건너뛰고, 그 밖의 낱말은 모두 수식어로 보되
 * `struct`·`enum`·`impl`·`mod`·`use`·`static`·`type`·`trait` 같은 다른 아이템의
 * 시작이나 `;`·`{`·`}` 가 먼저 나오면 함수 선언이 아니다. 언어가 수식어를 하나
 * 더 늘려도 명령이 사라지지 않고, `#[tauri::command] struct X;` 는 명령이 아니다.
 *
 * ## 이 모듈이 보증하지 않는 것
 *
 * 소스에 그 토큰이 **없는** 것은 보지 못한다. 둘이다.
 *
 *   1. 매크로가 **생성**하는 `#[tauri::command]` — `macro_rules!` 나 파생
 *      매크로(proc-macro)가 속성이나 이름을 조립해 내놓는 경우. 확장 결과에만
 *      토큰이 있고 소스에는 없다.
 *   2. `include!` 로 다른 파일에서 끌어오는 소스. 이 모듈은 넘겨받은 문자열
 *      하나만 읽고 파일을 따라가지 않는다.
 *   3. **현재 크레이트 안의 재수출 사슬.** 다른 파일에 `pub use tauri::command as
 *      mycmd;` 를 두고 이 파일에서 `use crate::macros::mycmd;` 로 받아 `#[mycmd]`
 *      로 적으면, 이 파일의 `use` 는 `crate::macros::mycmd` 까지만 말해 준다 —
 *      그 이름이 결국 `tauri::command` 라는 사실은 다른 파일에 있다. 이 모듈은
 *      파일 하나만 보므로 그 사슬을 따라가지 않는다. 크레이트 밖 경로
 *      (`tauri::…`, `tauri_macros::…`)와 그 별명은 경계 **안**이다.
 *
 * 둘 다 우회가 아니라 위조라서 리뷰가 볼 몫이다.
 */

/**
 * Rust 의 낱말 전부 — 엄격·예약·약한 키워드를 한자리에 둔다.
 *
 * 이 목록의 쓸모는 하나다: **키워드와 같은 이름의 생 식별자를 가르는 것.**
 * `r#use` 는 이름이 `use` 인 식별자이지 `use` 키워드가 아니다. 그 둘을 글자로만
 * 가르면 `fn r#use()` 가 선언의 시작으로 읽혀, 그 뒤에 오는 진짜 `use …;` 가
 * 통째로 목록에서 사라진다(16회차 지적 1).
 *
 * `self`·`crate`·`super`·`Self` 는 Rust 가 생 식별자로 쓰지 못하게 막으므로
 * 여기 있어도 `r#` 형태가 나올 수 없다.
 */
const RUST_KEYWORDS = new Set([
	"abstract", "as", "async", "await", "become", "box", "break", "const",
	"continue", "crate", "default", "do", "dyn", "else", "enum", "extern",
	"false", "final", "fn", "for", "if", "impl", "in", "let", "loop", "macro",
	"macro_rules", "match", "mod", "move", "mut", "override", "priv", "pub",
	"ref", "return", "Self", "self", "static", "struct", "super", "trait",
	"true", "try", "type", "typeof", "union", "unsafe", "unsized", "use",
	"virtual", "where", "while", "yield",
]);

/**
 * 이 토큰이 그 **키워드**인가. 생 식별자(`r#use`)는 결코 키워드가 아니다.
 *
 * 이 모듈과 이 모듈을 쓰는 게이트의 **모든** 낱말 비교는 이 함수(또는 아래
 * `keywordIn`)를 지나야 한다. `token.text === "use"` 같은 글자 비교가 하나라도
 * 남으면 그 자리로 생 식별자가 들어온다.
 */
export function isKeyword(token, word) {
	return !!token && token.kind === "ident" && token.keyword === true && token.text === word;
}

/** 이 토큰이 그 낱말 묶음 중 하나인가. 생 식별자는 아니다. */
export function keywordIn(token, words) {
	return !!token && token.kind === "ident" && token.keyword === true && words.has(token.text);
}

/** `\n` 처럼 한 글자로 끝나는 이스케이프. */
const SIMPLE_ESCAPES = new Map([
	["n", "\n"],
	["r", "\r"],
	["t", "\t"],
	["0", "\0"],
	["\\", "\\"],
	['"', '"'],
	["'", "'"],
]);

/**
 * Rust 문자열 리터럴의 **값**. 적는 법이 아니라 뜻이다.
 *
 * 왜 필요한가: 데이터 홈 검사는 문자열의 값을 `HOME` · `.naia` 와 대조한다. 그
 * 값이 이스케이프를 한 글자씩 삼키는 방식이던 동안 `"\x48OME"` 은 `x48OME` 로,
 * `"\x2enaia"` 는 `x2enaia` 로 읽혀 금지 집합에 들지 않았다 — 같은 글자를 다르게
 * 적는 것만으로 홈을 짚을 수 있었다(17회차 지적 3). 조각을 이어 붙이는 위조
 * (`format!(".{}", "naia")`)와 달리 이것은 **리터럴 하나**다.
 *
 * 푸는 것: `\xNN`, `\u{…}`, `\n \r \t \0 \\ \" \'`, 그리고 줄 끝 `\` 이어쓰기
 * (뒤따르는 공백을 함께 지운다).
 */
function unescapeRust(raw) {
	let out = "";
	for (let i = 0; i < raw.length; i += 1) {
		if (raw[i] !== "\\") {
			out += raw[i];
			continue;
		}
		const next = raw[i + 1];
		if (next === undefined) break;
		if (next === "x") {
			const code = Number.parseInt(raw.slice(i + 2, i + 4), 16);
			if (Number.isFinite(code)) {
				out += String.fromCharCode(code);
				i += 3;
				continue;
			}
		}
		if (next === "u" && raw[i + 2] === "{") {
			const close = raw.indexOf("}", i + 3);
			if (close !== -1) {
				const code = Number.parseInt(raw.slice(i + 3, close), 16);
				if (Number.isFinite(code)) {
					out += String.fromCodePoint(code);
					i = close;
					continue;
				}
			}
		}
		// 줄 끝 백슬래시는 줄바꿈과 뒤따르는 공백을 지운다.
		if (next === "\n" || next === "\r") {
			let j = i + 1;
			while (j < raw.length && /\s/.test(raw[j])) j += 1;
			i = j - 1;
			continue;
		}
		out += SIMPLE_ESCAPES.get(next) ?? next;
		i += 1;
	}
	return out;
}

/** 식별자 첫 글자로 쓸 수 있는가. Rust 는 비ASCII 식별자를 허용한다. */
function isIdentStart(ch) {
	return /[A-Za-z_]/.test(ch) || ch.charCodeAt(0) > 127;
}

function isIdentPart(ch) {
	return /[A-Za-z0-9_]/.test(ch) || ch.charCodeAt(0) > 127;
}

/**
 * Rust 소스를 토큰 배열로 만든다. 주석은 버린다.
 *
 * 토큰: `{ kind, text, line, start, end }`.
 * `kind` 는 `ident` | `punct` | `string` | `char` | `lifetime` | `number`.
 * `start`/`end` 는 원본 소스의 문자 위치라 본문을 잘라 낼 때 그대로 쓴다.
 *
 * 생 식별자(`r#type`)는 `ident` 토큰 하나이고 `text` 는 `#` **뒤**다 — Rust 에서
 * `r#foo` 의 이름은 `foo` 이고, 프런트가 `invoke("foo")` 로 부르는 이름도 그것이다.
 * 그 토큰은 `raw: true` 를 함께 단다. 생 **문자열**(`r"…"`, `r#"…"#`)은 그보다
 * 먼저 갈려 `string` 토큰이 된다.
 *
 * `string` 과 `char` 토큰은 `value` 를 함께 단다 — **이스케이프를 푼 값**이다
 * (`"\x48OME"` 은 `HOME`). `text` 에도 같은 값을 넣는다. 값을 보는 자리가 어느
 * 필드를 읽든 답이 같아야, 다음에 붙는 검사가 적는 법과 뜻을 혼동하지 않는다
 * (17회차 지적 3).
 */
export function tokenizeRust(source) {
	const tokens = [];
	let line = 1;
	let i = 0;
	const n = source.length;

	const bump = (from, to) => {
		for (let k = from; k < to; k += 1) if (source[k] === "\n") line += 1;
	};

	while (i < n) {
		const ch = source[i];

		if (ch === "\n") {
			line += 1;
			i += 1;
			continue;
		}
		if (ch === " " || ch === "\t" || ch === "\r") {
			i += 1;
			continue;
		}
		// 줄 주석 — 문서 주석(`///`, `//!`)도 여기서 사라진다. 길이는 상관없다.
		if (ch === "/" && source[i + 1] === "/") {
			while (i < n && source[i] !== "\n") i += 1;
			continue;
		}
		// 블록 주석 (Rust 는 중첩된다)
		if (ch === "/" && source[i + 1] === "*") {
			let depth = 1;
			const from = i;
			i += 2;
			while (i < n && depth > 0) {
				if (source[i] === "/" && source[i + 1] === "*") {
					depth += 1;
					i += 2;
				} else if (source[i] === "*" && source[i + 1] === "/") {
					depth -= 1;
					i += 2;
				} else {
					i += 1;
				}
			}
			bump(from, i);
			continue;
		}
		// 로 문자열: r"…", r#"…"#, br##"…"##
		const raw = /^(b?r)(#*)"/.exec(source.slice(i, i + 40));
		if (raw && (i === 0 || !isIdentPart(source[i - 1]))) {
			const start = i;
			const terminator = `"${raw[2]}`;
			const bodyFrom = i + raw[0].length;
			const end = source.indexOf(terminator, bodyFrom);
			const stop = end === -1 ? n : end;
			const value = source.slice(bodyFrom, stop);
			const startLine = line;
			const after = end === -1 ? n : stop + terminator.length;
			bump(start, after);
			// 생 문자열에는 이스케이프가 없다 — 적힌 그대로가 값이다.
			tokens.push({
				kind: "string",
				text: value,
				value,
				line: startLine,
				start,
				end: after,
			});
			i = after;
			continue;
		}
		// 생 식별자 `r#type` — 이름은 `#` 뒤다. 위의 생 문자열(`r"…"`, `r#"…"#`)이
		// 먼저 갈리므로 여기 오는 `r#` 는 반드시 식별자다(15회차 지적 3).
		//
		// `keyword` 는 **언제나 거짓**이다. `r#use` 는 이름이 `use` 인 식별자일 뿐
		// `use` 키워드가 아니다 — 그 둘을 글자로만 가르면 `fn r#use()` 가 선언의
		// 시작으로 읽힌다(16회차 지적 1).
		if (ch === "r" && source[i + 1] === "#" && isIdentStart(source[i + 2] ?? "")) {
			const start = i;
			let j = i + 2;
			while (j < n && isIdentPart(source[j])) j += 1;
			tokens.push({
				kind: "ident",
				text: source.slice(i + 2, j),
				line,
				start,
				end: j,
				raw: true,
				keyword: false,
			});
			i = j;
			continue;
		}
		// 보통 문자열: "…" (바이트 문자열 b"…" 포함)
		if (ch === '"' || (ch === "b" && source[i + 1] === '"')) {
			const start = i;
			const startLine = line;
			let j = ch === '"' ? i + 1 : i + 2;
			// 원문을 그대로 모은 뒤 **한 번에** 푼다. 한 글자씩 삼키면 `\xNN` 과
			// `\u{…}` 가 글자 `x`·`u` 로 남는다(17회차 지적 3).
			let literal = "";
			while (j < n) {
				if (source[j] === "\\") {
					literal += source.slice(j, j + 2);
					j += 2;
					continue;
				}
				if (source[j] === '"') break;
				literal += source[j];
				j += 1;
			}
			const after = Math.min(j + 1, n);
			bump(start, after);
			const value = unescapeRust(literal);
			tokens.push({
				kind: "string",
				text: value,
				value,
				line: startLine,
				start,
				end: after,
			});
			i = after;
			continue;
		}
		// 문자 리터럴과 수명(lifetime)
		if (ch === "'") {
			const charLiteral = /^'(\\.|[^\\'])'/.exec(source.slice(i, i + 12));
			if (charLiteral) {
				const value = unescapeRust(charLiteral[1]);
				tokens.push({
					kind: "char",
					text: value,
					value,
					line,
					start: i,
					end: i + charLiteral[0].length,
				});
				i += charLiteral[0].length;
				continue;
			}
			const lifetime = /^'([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(i, i + 64));
			if (lifetime) {
				tokens.push({
					kind: "lifetime",
					text: lifetime[1],
					line,
					start: i,
					end: i + lifetime[0].length,
				});
				i += lifetime[0].length;
				continue;
			}
			tokens.push({ kind: "punct", text: "'", line, start: i, end: i + 1 });
			i += 1;
			continue;
		}
		if (isIdentStart(ch)) {
			const start = i;
			while (i < n && isIdentPart(source[i])) i += 1;
			const text = source.slice(start, i);
			tokens.push({
				kind: "ident",
				text,
				line,
				start,
				end: i,
				raw: false,
				keyword: RUST_KEYWORDS.has(text),
			});
			continue;
		}
		if (/[0-9]/.test(ch)) {
			const start = i;
			while (i < n && /[0-9A-Za-z_.]/.test(source[i])) i += 1;
			tokens.push({
				kind: "number",
				text: source.slice(start, i),
				line,
				start,
				end: i,
			});
			continue;
		}
		tokens.push({ kind: "punct", text: ch, line, start: i, end: i + 1 });
		i += 1;
	}
	return tokens;
}

/** `tokens[at]` 부터 짝이 맞는 닫는 괄호까지 건너뛴 **다음** 위치. */
export function skipBalanced(tokens, at, open, close) {
	if (!tokens[at] || tokens[at].kind !== "punct" || tokens[at].text !== open)
		return at;
	let depth = 0;
	for (let i = at; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind !== "punct") continue;
		if (t.text === open) depth += 1;
		else if (t.text === close) {
			depth -= 1;
			if (depth === 0) return i + 1;
		}
	}
	return tokens.length;
}

/**
 * 다른 **아이템**의 시작. 이 낱말이 먼저 나오면 그 속성은 함수에 붙은 것이 아니다.
 *
 * 함수 앞에 올 수 있는 낱말(`pub`, `const`, `async`, `unsafe`, `extern`, `default`)과
 * 겹치지 않는다. 그래서 수식어를 **열거**하는 대신 이 목록으로 **멈춘다** — 언어가
 * 수식어를 하나 더 늘려도 명령이 목록에서 사라지지 않는다(13회차 지적 5).
 */
const ITEM_STARTERS = new Set([
	"struct",
	"enum",
	"impl",
	"mod",
	"use",
	"static",
	"type",
	"trait",
	"union",
	"macro_rules",
	"let",
]);

/**
 * `#[…]`(또는 `#![…]`) 속성 하나를 건너뛴다. 속성이 아니면 `at` 을 그대로
 * 돌려준다.
 */
function skipAttribute(tokens, at) {
	const t = tokens[at];
	if (!t || t.kind !== "punct" || t.text !== "#") return at;
	let j = at + 1;
	if (tokens[j]?.kind === "punct" && tokens[j].text === "!") j += 1;
	if (!(tokens[j]?.kind === "punct" && tokens[j].text === "[")) return at;
	return skipBalanced(tokens, j, "[", "]");
}

/**
 * 이 파일의 `use` 선언이 만드는 지역 이름 전부.
 *
 * `{ local, path, glob, line, at, pub }` — `path` 는 마디 배열(`["tauri",
 * "command"]`), `glob` 은 `use tauri::*` 처럼 별로 끝난 것이다(그때 `local` 은
 * `null`), `at` 은 그 선언의 `use` 토큰 자리, `pub` 은 그 선언이 **재수출**인가다
 * (`pub use`, `pub(crate) use`, `pub(in …) use`). 별명(`use tauri::command as
 * cmd`)은 `local` 이 `cmd`, `path` 는 원래 경로다.
 *
 * 왜 필요한가: Rust 에서 `#[tauri::command]` 와 `use tauri::command; #[command]`
 * 는 같은 proc-macro 다. 속성에 **적힌 경로**만 보면 뒤쪽이 명령에서 빠진다
 * (14회차 지적 5). 이 저장소의 STT 플러그인이 이미 그 형태로 명령을 연다.
 * 공개 항목을 세는 쪽(`check-data-home-boundary.mjs`)도 `pub use` 재수출의
 * 이름을 여기서 읽는다(14회차 지적 8).
 */
export function useDeclarations(tokens) {
	const found = [];
	for (let i = 0; i < tokens.length; i += 1) {
		if (!isKeyword(tokens[i], "use")) continue;
		// 이 선언은 `;` 까지다. 중괄호 묶음 안의 `;` 는 없지만 짝으로 건너뛴다.
		let end = i + 1;
		while (end < tokens.length) {
			const t = tokens[end];
			if (t.kind === "punct" && t.text === "{") {
				end = skipBalanced(tokens, end, "{", "}");
				continue;
			}
			if (t.kind === "punct" && t.text === ";") break;
			end += 1;
		}
		const before = found.length;
		const exported = useIsPublic(tokens, i);
		readUseTree(tokens, i + 1, end, [], found);
		for (let k = before; k < found.length; k += 1) {
			found[k].at = i;
			found[k].pub = exported;
		}
		i = end;
	}
	return found;
}

/**
 * 그 `use` 가 재수출인가 — 앞에 `pub`(과 `pub(crate)`·`pub(in …)`의 괄호)이 있는가.
 *
 * 재수출은 이름을 **다시 내주는** 일이라, 쓰는 것과 뜻이 다르다. 데이터 홈 경계
 * 검사가 그 둘을 가른다.
 */
function useIsPublic(tokens, at) {
	let k = at - 1;
	if (tokens[k]?.kind === "punct" && tokens[k].text === ")") {
		let depth = 0;
		while (k >= 0) {
			const t = tokens[k];
			if (t.kind === "punct" && t.text === ")") depth += 1;
			else if (t.kind === "punct" && t.text === "(") {
				depth -= 1;
				if (depth === 0) break;
			}
			k -= 1;
		}
		k -= 1;
	}
	return isKeyword(tokens[k], "pub");
}

/** `from`(포함)부터 `to`(제외)까지가 `use` 나무 하나. 잎마다 `out` 에 담는다. */
function readUseTree(tokens, from, to, prefix, out) {
	const path = [...prefix];
	let j = from;
	while (j < to) {
		const t = tokens[j];
		if (t.kind === "punct") {
			// `::` 의 두 토큰과 앞머리 `::` 는 마디가 아니다.
			if (t.text === ":") {
				j += 1;
				continue;
			}
			if (t.text === "*") {
				out.push({ local: null, path, glob: true, line: t.line });
				return;
			}
			if (t.text === "{") {
				const close = skipBalanced(tokens, j, "{", "}") - 1;
				let start = j + 1;
				let depth = 0;
				for (let k = j + 1; k < close; k += 1) {
					const u = tokens[k];
					if (u.kind !== "punct") continue;
					if (u.text === "{") depth += 1;
					else if (u.text === "}") depth -= 1;
					else if (u.text === "," && depth === 0) {
						readUseTree(tokens, start, k, path, out);
						start = k + 1;
					}
				}
				if (start < close) readUseTree(tokens, start, close, path, out);
				return;
			}
			j += 1;
			continue;
		}
		if (t.kind !== "ident") {
			j += 1;
			continue;
		}
		if (isKeyword(t, "as")) {
			const alias = tokens[j + 1];
			out.push({
				local: alias?.kind === "ident" ? alias.text : null,
				path,
				glob: false,
				line: t.line,
			});
			return;
		}
		path.push(t.text);
		j += 1;
	}
	if (path.length > prefix.length) {
		out.push({ local: path[path.length - 1], path, glob: false, line: tokens[from]?.line ?? 0 });
	}
}

/**
 * 이 proc-macro 의 정본 경로.
 *
 * `tauri::command` 는 `tauri_macros::command` 의 **재수출**이라 둘은 같은 매크로다.
 * 크레이트를 직접 적어도 명령이 열린다(15회차 지적 2).
 */
const COMMAND_PATHS = [
	["tauri", "command"],
	["tauri_macros", "command"],
];

/**
 * 이 파일의 `extern crate` 선언.
 *
 * `{ crate, local, line, at }` — `local` 은 `as` 별명이고, 별명이 없으면 크레이트
 * 이름과 같다. 2018 edition 이후로 잘 쓰이지 않지만 여전히 유효하고, 별명은
 * `use tauri as t;` 와 똑같이 그 이름을 만든다. 이 선언이 표에 없던 동안
 * `extern crate tauri as t; #[t::command]` 는 명령이 아니었다(17회차 지적 4).
 *
 * `extern "C" fn` 의 `extern` 은 뒤가 문자열이라 여기 걸리지 않는다.
 */
export function externCrateDeclarations(tokens) {
	const found = [];
	for (let i = 0; i < tokens.length; i += 1) {
		if (!isKeyword(tokens[i], "extern")) continue;
		if (!isKeyword(tokens[i + 1], "crate")) continue;
		const name = tokens[i + 2];
		if (!name || name.kind !== "ident") continue;
		let local = name.text;
		if (isKeyword(tokens[i + 3], "as") && tokens[i + 4]?.kind === "ident") {
			local = tokens[i + 4].text;
		}
		found.push({ crate: name.text, local, line: tokens[i].line, at: i });
		i += 2;
	}
	return found;
}

/**
 * 이 파일의 `use` 가 만든 지역 이름 → 그 이름이 가리키는 **전체 경로**.
 *
 * 크레이트 별명(`use tauri as t`)도, 잎 별명(`use tauri::command as cmd`)도 같은
 * 표에 들어간다 — 둘 다 "이 지역 이름은 어느 경로인가" 하나의 물음이다. glob
 * (`use tauri::*`)은 이름을 정하지 않으므로 접두만 따로 모은다.
 */
export function useResolution(tokens) {
	const alias = new Map();
	const globs = [];
	// `extern crate tauri as t;` 도 크레이트 별명이다 — `use tauri as t;` 와 같은
	// 이름을 만든다(17회차 지적 4).
	for (const declared of externCrateDeclarations(tokens)) {
		if (declared.local) alias.set(declared.local, [declared.crate]);
	}
	for (const leaf of useDeclarations(tokens)) {
		// `use tauri::{self as t}` 의 `self` 는 모듈 자신이라 마디가 아니다.
		const path = leaf.path[leaf.path.length - 1] === "self" ? leaf.path.slice(0, -1) : leaf.path;
		if (!path.length) continue;
		if (leaf.glob) {
			globs.push(path);
			continue;
		}
		if (leaf.local) alias.set(leaf.local, path);
	}
	return { alias, globs };
}

/**
 * `tokens[at]` 부터 이어지는 경로 마디(`a::b::c`). 경로의 **첫** 마디가 아니면
 * `null` — `clap::command` 의 `command` 를 한 마디 이름으로 읽으면 안 된다.
 *
 * 앞머리 `::`(`::tauri::command`)는 첫 마디로 본다.
 */
export function pathAt(tokens, at) {
	const t = tokens[at];
	if (!t || t.kind !== "ident") return null;
	if (
		tokens[at - 1]?.kind === "punct" &&
		tokens[at - 1].text === ":" &&
		tokens[at - 2]?.kind === "punct" &&
		tokens[at - 2].text === ":" &&
		tokens[at - 3]?.kind === "ident"
	)
		return null;
	const segments = [t.text];
	let j = at + 1;
	while (
		tokens[j]?.kind === "punct" &&
		tokens[j].text === ":" &&
		tokens[j + 1]?.kind === "punct" &&
		tokens[j + 1].text === ":" &&
		tokens[j + 2]?.kind === "ident"
	) {
		segments.push(tokens[j + 2].text);
		j += 3;
	}
	return segments;
}

/**
 * 이 경로가 가리킬 수 있는 **전체 경로** 후보.
 *
 * 첫 마디가 `use` 로 들어온 이름이면 그 경로로 갈아 끼운다. 그런 이름이 없고 한
 * 마디뿐이면 glob 접두를 붙인 것도 후보다 — Rust 도 명시 import 를 glob 보다 먼저
 * 고르므로, 명시 이름이 있으면 glob 후보는 만들지 않는다.
 */
export function candidatePaths(segments, resolution) {
	const head = resolution.alias.get(segments[0]);
	if (head) return [[...head, ...segments.slice(1)]];
	const out = [segments];
	if (segments.length === 1) {
		for (const prefix of resolution.globs) out.push([...prefix, segments[0]]);
	}
	return out;
}

function isCommandPath(path) {
	return COMMAND_PATHS.some(
		(known) => path.length === known.length && known.every((seg, i) => seg === path[i]),
	);
}

/**
 * 그 속성이 명령 속성인가 — 속성 토큰 열 **어디든** 이 매크로를 가리키는 경로가
 * 있는가.
 *
 * 머리 네 토큰만 보면 `#[cfg_attr(all(), tauri::command)]` 가 빠져나가고(12회차
 * 지적 4), 적힌 글자만 보면 `use tauri::command; #[command]`(14회차 지적 5)와
 * `use tauri as t; #[t::command]` · `#[tauri_macros::command]`(15회차 지적 2)가
 * 빠져나간다. 그래서 속성 안의 경로를 이 파일의 `use` 표로 **정규화한 뒤** 정본
 * 경로와 대조한다. 짝이 맞는 `]` 까지 전부 보므로 중첩된 `cfg_attr` 도 같다.
 *
 * 문자열은 토큰 하나(`kind: "string"`)라서 글자만 같은 것은 경로가 아니다.
 */
function matchCommandAttribute(tokens, at, resolution) {
	let j = at + 1;
	if (tokens[j]?.kind === "punct" && tokens[j].text === "!") j += 1;
	if (!(tokens[j]?.kind === "punct" && tokens[j].text === "[")) return null;
	const end = skipBalanced(tokens, j, "[", "]");
	for (let k = j + 1; k < end; k += 1) {
		const segments = pathAt(tokens, k);
		if (!segments) continue;
		let matched = false;
		for (const candidate of candidatePaths(segments, resolution)) {
			if (isCommandPath(candidate)) {
				matched = true;
				break;
			}
		}
		if (!matched) continue;
		// 경로 끝 바로 다음이 인자 묶음이다 — `#[tauri::command(rename = "…")]`.
		// 마디 하나에 토큰 하나, 이어지는 마디마다 `::` 둘을 더해 셋이다.
		const after = k + 1 + 3 * (segments.length - 1);
		const args =
			tokens[after]?.kind === "punct" && tokens[after].text === "(" ? after : -1;
		return { rename: args === -1 ? null : renameArgument(tokens, args) };
	}
	return null;
}

/**
 * 명령 속성 인자에서 `rename = "…"` 의 값. 없으면 `null`.
 *
 * `rename_all` 은 **이름이 아니라 인자 키**의 표기를 바꾼다 — 여기서 읽지 않는다.
 * 자세한 이유는 [`tauriCommandDeclarations`] 머리말에 적었다.
 */
function renameArgument(tokens, openParen) {
	const end = skipBalanced(tokens, openParen, "(", ")");
	for (let i = openParen + 1; i < end - 1; i += 1) {
		const t = tokens[i];
		if (t.kind !== "ident" || t.text !== "rename") continue;
		// 더 긴 경로의 마디는 인자 이름이 아니다.
		if (tokens[i - 1]?.kind === "punct" && tokens[i - 1].text === ":") continue;
		if (!(tokens[i + 1]?.kind === "punct" && tokens[i + 1].text === "=")) continue;
		const value = tokens[i + 2];
		if (value?.kind === "string") return value.value;
	}
	return null;
}

/**
 * `#[tauri::command]` 로 프런트에 열린 명령 이름과 그 본문.
 *
 * 속성과 `fn` 사이의 거리를 재지 않는다. 속성이 몇 개든, 문서 주석이 몇 자든,
 * `pub(crate) async unsafe fn` 이든 토큰으로 건너뛴 뒤 `fn <이름>` 을 읽는다.
 *
 * 본문은 중괄호 균형으로 잘라 낸다. 균형도 토큰에서 세므로 문자열 안의 `}` 가
 * 본문을 일찍 끊지 않는다.
 */
export function tauriCommandBodies(source) {
	const commands = new Map();
	for (const declared of tauriCommandDeclarations(source)) {
		commands.set(declared.fnName, declared.body);
	}
	return commands;
}

/**
 * 프런트가 부르는 **IPC 이름** 전부. 호출부 대조는 이 이름으로 해야 한다.
 *
 * `tauriCommandBodies` 의 열쇠는 Rust 함수 이름이라 `rename` 이 붙은 명령에서
 * 프런트가 부르는 이름과 어긋난다(18회차 지적 7).
 */
export function tauriCommandNames(source) {
	return tauriCommandDeclarations(source).map((declared) => declared.ipcName);
}

/**
 * `#[tauri::command(…)]` 로 열린 명령 선언 전부 —
 * `{ fnName, ipcName, body, line }`.
 *
 * ## 왜 이름이 둘인가 (18회차 지적 7)
 *
 * Rust 함수 이름과 프런트가 부르는 IPC 이름은 같지 않을 수 있다.
 * `#[tauri::command(rename = "ghost_wipe_everything")]` 를 붙이면 함수가
 * `innocent_placeholder` 여도 프런트는 `invoke("ghost_wipe_everything")` 로
 * 부른다. 목록이 함수 이름만 담으면 그 호출은 `commands.includes` 에서 통째로
 * 건너뛰어지고, 확인 없는 파괴 조작이 **이름을 바꿔 적는 것만으로** 통과한다.
 *
 * 근거는 이 기계에 받아 둔 매크로 소스다 —
 * `tauri-macros-2.6.2/src/command/wrapper.rs:300` 이 `RenamePolicy::Rename` 일
 * 때 외부에서 부르는 이름을 그 리터럴로 두고, 아니면 함수 식별자를 쓴다.
 *
 * ## `rename_all` 은 이름을 바꾸지 않는다
 *
 * 같은 파일 `62~78` 줄에서 `rename_all` 은 `"camelCase"` 와 `"snake_case"` 둘만
 * 받아 `argument_case` 를 정한다. 그것이 바꾸는 것은 **인자 키**의 표기이지
 * 명령 이름이 아니다(같은 파일 `510~520` 줄의 `key`). 그래서 이 함수는
 * `rename_all` 로 이름을 바꾸지 않는다 — 바꾸면 Tauri 가 등록하지도 않는 이름을
 * 목록에 넣고, 진짜 이름(함수 이름)을 잃는다.
 */
export function tauriCommandDeclarations(source) {
	const tokens = tokenizeRust(source);
	const declarations = [];
	// 속성에 적힌 경로를 이 파일의 `use` 로 풀어 정본 경로와 대조한다.
	const resolution = useResolution(tokens);

	for (let i = 0; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind !== "punct" || t.text !== "#") continue;
		const attribute = matchCommandAttribute(tokens, i, resolution);
		if (!attribute) continue;

		// 속성과 수식어를 건너뛰어 `fn` 에 닿는다. 횟수를 세지 않는다 — 토큰 열은
		// 유한하고, 아래 갈래는 모두 `j` 를 앞으로만 옮기므로 반드시 끝난다.
		let j = skipAttribute(tokens, i);
		let reachedFn = false;
		while (j < tokens.length) {
			const next = tokens[j];
			if (next.kind === "punct") {
				// 뒤따르는 속성 그룹은 통째로 건너뛴다.
				if (next.text === "#") {
					const after = skipAttribute(tokens, j);
					if (after === j) break;
					j = after;
					continue;
				}
				// `pub(crate)` · `pub(in crate::a)` 의 가시성 괄호.
				if (next.text === "(") {
					const after = skipBalanced(tokens, j, "(", ")");
					if (after === j) break;
					j = after;
					continue;
				}
				// `;` · `{` · `}` 를 비롯한 나머지 구두점은 함수 선언이 아니다.
				break;
			}
			// `extern "C"` 의 ABI 문자열.
			if (next.kind === "string") {
				j += 1;
				continue;
			}
			if (next.kind !== "ident") break;
			if (isKeyword(next, "fn")) {
				reachedFn = true;
				break;
			}
			// 다른 아이템의 시작이면 이 속성은 함수에 붙은 것이 아니다.
			if (keywordIn(next, ITEM_STARTERS)) break;
			// 그 밖의 낱말은 수식어다 — `pub`, `const`, `async`, `unsafe`, `extern`,
			// `default`, 그리고 언어가 앞으로 더할 것들.
			j += 1;
		}

		if (!reachedFn) continue;
		const name = tokens[j + 1];
		if (!name || name.kind !== "ident") continue;

		declarations.push({
			fnName: name.text,
			ipcName: attribute.rename ?? name.text,
			body: functionBodyAfter(tokens, j + 2, source),
			line: name.line,
		});
		i = j + 1;
	}
	return declarations;
}

/**
 * `at` 이후 처음 열리는 중괄호 블록의 원문. `;` 를 먼저 만나면(본문 없는
 * 선언) 빈 문자열이다.
 */
function functionBodyAfter(tokens, at, source) {
	for (let i = at; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind !== "punct") continue;
		if (t.text === ";") return "";
		if (t.text === "{") {
			const after = skipBalanced(tokens, i, "{", "}");
			const close = tokens[after - 1];
			return source.slice(t.start, close ? close.end : source.length);
		}
	}
	return "";
}

/**
 * Rust 소스를 코드와 문자열로 가른다. 주석은 버린다.
 *
 * 데이터 홈 경계 검사가 쓰는 형태다. 식별자는 코드 쪽에서, 경로 마디는 문자열
 * 쪽에서만 봐야 판정이 뜻과 맞는다 — 주석 안의 `~/.naia/logs` 설명이 위반으로
 * 잡히거나, 문자열 안의 `home_dir` 이라는 글자가 호출로 잡히면 안 된다.
 *
 * 줄 번호를 지키려고 코드 쪽은 원본의 개행을 그대로 옮긴다.
 */
export function splitCodeAndStrings(source) {
	const tokens = tokenizeRust(source);
	const strings = [];
	let code = "";
	let line = 1;
	for (const token of tokens) {
		while (line < token.line) {
			code += "\n";
			line += 1;
		}
		if (token.kind === "string") {
			strings.push({ value: token.value, line: token.line });
			code += " ";
			continue;
		}
		code += `${token.text} `;
	}
	return { code, strings };
}
