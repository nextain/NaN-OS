/**
 * `Cargo.toml` 을 **문법으로** 읽는 최소 TOML 파서.
 *
 * 왜 이 모듈이 있는가: 파괴 조작 검사는 명령 목록을 뽑을 크레이트 자리를
 * `Cargo.toml` 에서 읽는데, 그 읽기가 `\bpath\s*=\s*"([^"]+)"` 라는 **정규식**
 * 이었다. TOML 은 홑따옴표를 같은 문자열로 보므로 `path = 'plugins/…'` 로 적기만
 * 하면 그 크레이트의 `src` 가 뿌리에서 빠졌고, 목록에 없으면 프런트의
 * `invoke("…")` 는 확인 검사에서 통째로 건너뛰어졌다 — 확인 없는 파괴 조작이
 * **따옴표를 바꾸는 것만으로** 초록을 받았다(15회차 지적 6).
 *
 * 따옴표 하나를 더 열거하는 것은 고침이 아니다. 다음 회차에 여러 줄 문자열이나
 * 인라인 테이블로 같은 일이 난다. 그래서 형태를 세는 자리를 없애고 **문법으로**
 * 읽는다 — 문자열은 네 가지 모두 값 하나이고, 주석은 값이 아니며, 배열과 인라인
 * 테이블은 구조다.
 *
 * 이 트리에 TOML 패키지가 없어(확인함) 필요한 만큼만 손으로 적었다.
 *
 * ## 읽는 것
 *
 *   - 테이블 헤더 `[a.b]` 와 테이블 배열 `[[a]]`(따옴표 키 포함)
 *   - 점 찍은 키 `a.b.c = …`
 *   - 문자열 넷: `"…"`, `'…'`, `"""…"""`, `'''…'''`
 *   - 배열 `[ … ]`(줄바꿈·주석·꼬리 쉼표 허용)과 인라인 테이블 `{ … }`
 *   - `#` 주석
 *
 * ## 이 모듈이 보증하지 않는 것
 *
 * 숫자·불리언·날짜는 **글자 그대로의 문자열**로 돌려준다. 이 게이트가 묻는 것은
 * 경로와 이름뿐이라 값의 타입이 판정에 들어오지 않는다. 여기 적은 문법 밖의
 * TOML(예: 같은 테이블을 두 번 여는 것)은 뒤에 오는 값이 이긴다 — 그것은 Cargo
 * 가 거부하는 문서라 이 게이트가 판정할 자리가 아니다.
 */

const ESCAPES = new Map([
	["b", "\b"],
	["t", "\t"],
	["n", "\n"],
	["f", "\f"],
	["r", "\r"],
	['"', '"'],
	["\\", "\\"],
]);

/** 공백·주석·줄바꿈을 건너뛴 다음 위치. `stopAtNewline` 이면 줄바꿈에서 멈춘다. */
function skipTrivia(text, i, stopAtNewline = false) {
	while (i < text.length) {
		const ch = text[i];
		if (ch === "#") {
			while (i < text.length && text[i] !== "\n") i += 1;
			continue;
		}
		if (ch === "\n") {
			if (stopAtNewline) return i;
			i += 1;
			continue;
		}
		if (ch === " " || ch === "\t" || ch === "\r") {
			i += 1;
			continue;
		}
		return i;
	}
	return i;
}

/** 따옴표 넷 중 하나. 문자열이 아니면 `null`. */
function readString(text, i) {
	const three = text.slice(i, i + 3);
	if (three === '"""' || three === "'''") {
		const literal = three === "'''";
		const close = text.indexOf(three, i + 3);
		const stop = close === -1 ? text.length : close;
		let body = text.slice(i + 3, stop);
		// 여는 따옴표 바로 뒤의 줄바꿈 하나는 값이 아니다.
		if (body.startsWith("\r\n")) body = body.slice(2);
		else if (body.startsWith("\n")) body = body.slice(1);
		return {
			value: literal ? body : unescapeBasic(body),
			next: close === -1 ? text.length : close + 3,
		};
	}
	if (text[i] === "'") {
		const close = text.indexOf("'", i + 1);
		const stop = close === -1 ? text.length : close;
		return { value: text.slice(i + 1, stop), next: close === -1 ? text.length : close + 1 };
	}
	if (text[i] === '"') {
		let j = i + 1;
		let raw = "";
		while (j < text.length && text[j] !== '"') {
			if (text[j] === "\\") {
				raw += text.slice(j, j + 2);
				j += 2;
				continue;
			}
			raw += text[j];
			j += 1;
		}
		return { value: unescapeBasic(raw), next: Math.min(j + 1, text.length) };
	}
	return null;
}

function unescapeBasic(raw) {
	let out = "";
	for (let i = 0; i < raw.length; i += 1) {
		if (raw[i] !== "\\") {
			out += raw[i];
			continue;
		}
		const next = raw[i + 1];
		if (next === "u" || next === "U") {
			const width = next === "u" ? 4 : 8;
			const code = Number.parseInt(raw.slice(i + 2, i + 2 + width), 16);
			if (Number.isFinite(code)) {
				out += String.fromCodePoint(code);
				i += 1 + width;
				continue;
			}
		}
		// 줄 끝 백슬래시는 이어지는 공백을 지운다(여러 줄 기본 문자열).
		if (next === "\n" || next === "\r") {
			let j = i + 1;
			while (j < raw.length && /\s/.test(raw[j])) j += 1;
			i = j - 1;
			continue;
		}
		out += ESCAPES.get(next) ?? next ?? "";
		i += 1;
	}
	return out;
}

/** 키 한 마디 — 따옴표 키이거나 맨 키(`A-Za-z0-9_-`). */
function readKeyPart(text, i) {
	const quoted = readString(text, i);
	if (quoted) return quoted;
	let j = i;
	while (j < text.length && /[A-Za-z0-9_-]/.test(text[j])) j += 1;
	if (j === i) return null;
	return { value: text.slice(i, j), next: j };
}

/** 점 찍은 키 전체(`a.b."c d"`). */
function readKeyPath(text, i) {
	const parts = [];
	let j = skipTrivia(text, i, true);
	for (;;) {
		const part = readKeyPart(text, j);
		if (!part) break;
		parts.push(part.value);
		j = skipTrivia(part.next, 0) === 0 ? part.next : part.next;
		j = skipSpaces(text, j);
		if (text[j] !== ".") break;
		j = skipSpaces(text, j + 1);
	}
	if (!parts.length) return null;
	return { parts, next: j };
}

function skipSpaces(text, i) {
	while (i < text.length && (text[i] === " " || text[i] === "\t")) i += 1;
	return i;
}

/** 값 하나 — 문자열·배열·인라인 테이블, 그 밖은 글자 그대로. */
function readValue(text, i) {
	const at = skipTrivia(text, i, true);
	const string = readString(text, at);
	if (string) return string;

	if (text[at] === "[") {
		const items = [];
		let j = skipTrivia(text, at + 1);
		while (j < text.length && text[j] !== "]") {
			const item = readValue(text, j);
			if (!item) break;
			items.push(item.value);
			j = skipTrivia(text, item.next);
			if (text[j] === ",") j = skipTrivia(text, j + 1);
		}
		return { value: items, next: text[j] === "]" ? j + 1 : j };
	}

	if (text[at] === "{") {
		const table = {};
		let j = skipTrivia(text, at + 1);
		while (j < text.length && text[j] !== "}") {
			const key = readKeyPath(text, j);
			if (!key) break;
			j = skipTrivia(text, key.next);
			if (text[j] !== "=") break;
			const value = readValue(text, j + 1);
			if (!value) break;
			assign(table, key.parts, value.value);
			j = skipTrivia(text, value.next);
			if (text[j] === ",") j = skipTrivia(text, j + 1);
		}
		return { value: table, next: text[j] === "}" ? j + 1 : j };
	}

	// 숫자·불리언·날짜는 글자 그대로. 값의 끝은 쉼표·닫는 괄호·주석·줄바꿈이다.
	let j = at;
	while (j < text.length && !",]}#\n".includes(text[j])) j += 1;
	const raw = text.slice(at, j).trim();
	if (!raw) return null;
	return { value: raw, next: j };
}

function assign(table, parts, value) {
	let node = table;
	for (let i = 0; i < parts.length - 1; i += 1) {
		const key = parts[i];
		if (typeof node[key] !== "object" || node[key] === null || Array.isArray(node[key]))
			node[key] = {};
		node = node[key];
	}
	node[parts[parts.length - 1]] = value;
}

/** 테이블 헤더가 가리키는 테이블. `arrayOfTables` 면 새 항목을 밀어 넣는다. */
function tableAt(root, parts, arrayOfTables) {
	let node = root;
	for (let i = 0; i < parts.length; i += 1) {
		const key = parts[i];
		const last = i === parts.length - 1;
		let child = node[key];
		if (Array.isArray(child)) {
			if (last && arrayOfTables) {
				const entry = {};
				child.push(entry);
				return entry;
			}
			child = child[child.length - 1] ?? {};
		} else if (typeof child !== "object" || child === null) {
			child = last && arrayOfTables ? [] : {};
			node[key] = child;
		}
		if (Array.isArray(child)) {
			const entry = {};
			child.push(entry);
			node[key] = child;
			node = entry;
			continue;
		}
		node[key] = child;
		node = child;
	}
	return node;
}

/** TOML 한 편을 평범한 객체 나무로. */
export function parseToml(text) {
	const root = {};
	let current = root;
	let i = 0;
	while (i < text.length) {
		i = skipTrivia(text, i);
		if (i >= text.length) break;

		if (text[i] === "[") {
			const arrayOfTables = text[i + 1] === "[";
			let j = skipSpaces(text, i + (arrayOfTables ? 2 : 1));
			const key = readKeyPath(text, j);
			if (!key) {
				i += 1;
				continue;
			}
			j = skipSpaces(text, key.next);
			while (j < text.length && text[j] === "]") j += 1;
			current = tableAt(root, key.parts, arrayOfTables);
			i = j;
			continue;
		}

		const key = readKeyPath(text, i);
		if (!key) {
			i += 1;
			continue;
		}
		let j = skipSpaces(text, key.next);
		if (text[j] !== "=") {
			i = key.next + 1;
			continue;
		}
		const value = readValue(text, j + 1);
		if (!value) {
			i = j + 1;
			continue;
		}
		assign(current, key.parts, value.value);
		i = value.next;
	}
	return root;
}
