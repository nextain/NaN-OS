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
 * ## 이 모듈이 보증하지 않는 것
 *
 * 매크로가 만들어 내는 `#[tauri::command]`(예 `macro_rules!` 안에서 이름을
 * 조립하는 것)는 소스에 그 토큰이 없으므로 보지 못한다. 그것은 우회가 아니라
 * 위조라서 리뷰가 볼 몫이다.
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

/** 함수 앞에 붙는 수식어. 명령 이름을 읽기 전에 건너뛴다. */
const FN_MODIFIERS = new Set(["async", "unsafe", "extern", "default"]);

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

/** 그 속성이 `#[tauri::command…]` 인가. */
function isTauriCommandAttribute(tokens, at) {
	let j = at + 1;
	if (tokens[j]?.kind === "punct" && tokens[j].text === "!") j += 1;
	if (!(tokens[j]?.kind === "punct" && tokens[j].text === "[")) return false;
	const head = tokens
		.slice(j + 1, j + 5)
		.map((t) => t.text)
		.join("");
	return head === "tauri::command";
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

		let j = skipAttribute(tokens, i);
		// 뒤따르는 속성과 수식어를 건너뛴다.
		for (let guard = 0; guard < 64; guard += 1) {
			const next = tokens[j];
			if (!next) break;
			if (next.kind === "punct" && next.text === "#") {
				const after = skipAttribute(tokens, j);
				if (after === j) break;
				j = after;
				continue;
			}
			if (next.kind === "ident" && next.text === "pub") {
				j += 1;
				if (tokens[j]?.kind === "punct" && tokens[j].text === "(")
					j = skipBalanced(tokens, j, "(", ")");
				continue;
			}
			if (next.kind === "ident" && FN_MODIFIERS.has(next.text)) {
				j += 1;
				// `extern "C"` 의 ABI 문자열.
				if (next.text === "extern" && tokens[j]?.kind === "string") j += 1;
				continue;
			}
			break;
		}

		if (!(tokens[j]?.kind === "ident" && tokens[j].text === "fn")) continue;
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
