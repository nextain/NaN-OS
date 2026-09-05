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
 *
 * 둘 다 우회가 아니라 위조라서 리뷰가 볼 몫이다.
 */

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
			tokens.push({
				kind: "string",
				text: value,
				line: startLine,
				start,
				end: after,
			});
			i = after;
			continue;
		}
		// 보통 문자열: "…" (b"…" 포함)
		if (ch === '"' || (ch === "b" && source[i + 1] === '"')) {
			const start = i;
			const startLine = line;
			let j = ch === '"' ? i + 1 : i + 2;
			let value = "";
			while (j < n) {
				if (source[j] === "\\") {
					value += source[j + 1] ?? "";
					j += 2;
					continue;
				}
				if (source[j] === '"') break;
				value += source[j];
				j += 1;
			}
			const after = Math.min(j + 1, n);
			bump(start, after);
			tokens.push({
				kind: "string",
				text: value,
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
				tokens.push({
					kind: "char",
					text: charLiteral[1],
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
			tokens.push({
				kind: "ident",
				text: source.slice(start, i),
				line,
				start,
				end: i,
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

/** `tokens[at]` 부터 `tauri` `::` `command` 세 마디가 이어지는가. */
function isTauriCommandPath(tokens, at) {
	return (
		tokens[at]?.kind === "ident" &&
		tokens[at].text === "tauri" &&
		tokens[at + 1]?.kind === "punct" &&
		tokens[at + 1].text === ":" &&
		tokens[at + 2]?.kind === "punct" &&
		tokens[at + 2].text === ":" &&
		tokens[at + 3]?.kind === "ident" &&
		tokens[at + 3].text === "command"
	);
}

/**
 * 그 속성이 명령 속성인가 — 속성 토큰 열 **어디든** `tauri::command` 가 있는가.
 *
 * 머리 네 토큰만 보면 `#[cfg_attr(all(), tauri::command)]` 가 빠져나간다
 * (12회차 지적 4). 짝이 맞는 `]` 까지 전부 보므로 중첩된 `cfg_attr` 도 같다.
 * 문자열은 토큰 하나(`kind: "string"`)라서 글자만 같은 것은 연쇄가 아니다.
 */
function isTauriCommandAttribute(tokens, at) {
	let j = at + 1;
	if (tokens[j]?.kind === "punct" && tokens[j].text === "!") j += 1;
	if (!(tokens[j]?.kind === "punct" && tokens[j].text === "[")) return false;
	const end = skipBalanced(tokens, j, "[", "]");
	for (let k = j + 1; k < end; k += 1) {
		if (isTauriCommandPath(tokens, k)) return true;
	}
	return false;
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
	const tokens = tokenizeRust(source);
	const commands = new Map();

	for (let i = 0; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind !== "punct" || t.text !== "#") continue;
		if (!isTauriCommandAttribute(tokens, i)) continue;

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
			if (next.text === "fn") {
				reachedFn = true;
				break;
			}
			// 다른 아이템의 시작이면 이 속성은 함수에 붙은 것이 아니다.
			if (ITEM_STARTERS.has(next.text)) break;
			// 그 밖의 낱말은 수식어다 — `pub`, `const`, `async`, `unsafe`, `extern`,
			// `default`, 그리고 언어가 앞으로 더할 것들.
			j += 1;
		}

		if (!reachedFn) continue;
		const name = tokens[j + 1];
		if (!name || name.kind !== "ident") continue;

		commands.set(name.text, functionBodyAfter(tokens, j + 2, source));
		i = j + 1;
	}
	return commands;
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
			strings.push({ value: token.text, line: token.line });
			code += " ";
			continue;
		}
		code += `${token.text} `;
	}
	return { code, strings };
}
