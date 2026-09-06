/**
 * 식의 값을 **정적으로** 읽는 자리. 저장소에 하나뿐이다.
 *
 * 왜 따로 두는가: 열여덟 번의 교차 리뷰에서 이 모듈이 뚫린 자리는 거의 언제나
 * "이 형태는 접고 저 형태는 안 접는다" 였다. `+true` 는 접는데 `1 === 1` 은 안
 * 접고, `{a:"x"}.a` 는 접는데 `"x".length` 는 안 접고, `["alert"][0]` 은 접는데
 * `["alert"][0+0]` 은 안 접었다. 무엇을 접는지가 코드 여기저기에 흩어져 있으면
 * 리뷰어는 매 회차에 안 접는 갈래를 하나 더 찾는다.
 *
 * 그래서 접는 일을 이 파일 하나로 모았다. `jsx-static.mjs` 의 영구 참·문자열
 * 후보 판정, `bindings.mjs` 의 동적 모듈 지정자, 린트 경계의 "리터럴" 판정이
 * 모두 여기를 지난다. 아래 표가 그 범위의 정본이고, 모듈 머리말과
 * `docs/quality-reviews/obfuscation-forms.md` 의 "정적 평가 범위" 절이 같은
 * 표를 싣는다. 셋이 어긋나면 계약 테스트가 붉어진다.
 *
 * ## 정적 평가 범위 (표 안은 접고, 표 밖은 모른다)
 *
 *   - `literal` — 리터럴 — 문자열·숫자·불리언·`null`·`undefined`
 *   - `template` — 템플릿 — 보간까지 정적이면 이어 붙인다
 *   - `tagged-raw` — 태그 템플릿 `String.raw` — raw 조각과 정적 보간
 *   - `unary` — 단항 — `+` `-` `~` `!` `void` `typeof`
 *   - `binary` — 이항 — 비교·산술·비트, 그리고 `&&` `||` `??`
 *   - `conditional` — 삼항 — 조건이 정해지면 그 갈래
 *   - `const-chain` — `const` 사슬 — 구조분해와 배열 분해까지
 *   - `literal-member` — 리터럴의 멤버 — `"x".length`, `[1,2].length`, `{a:1}.a`
 *   - `literal-index` — 리터럴의 인덱스 — 인덱스 식도 접어서 쓴다 (`["a"][0+0]`)
 *   - `computed-key` — 계산된 리터럴 키 — `{ ["role"]: "alert" }` 는 `role` 이다
 *
 * 표 밖은 보증하지 않는다.
 *
 *   - 함수 호출의 결과 일반 (`makeUrl()`, `arr.map(...)`)
 *   - 정규식 실행 (`/x/.test(s)`)
 *   - 전역 객체의 속성 (`Date.now`, `Math.PI`, `process.env`)
 *   - 실행할 때 조립되는 값
 *
 * ## 이름은 어떻게 푸는가
 *
 * 이 모듈은 `const` 를 **직접 찾지 않는다**. 부르는 쪽이 `scope.constBindingOf`
 * 로 "그 이름이 묶인 초기화식이 어디 있는가" 를 알려 준다. 그래야 파일을
 * 건너가는 규칙(어느 import 를 따라갈지)이 이 파일에 두 벌로 생기지 않는다.
 * 훅이 없으면 이름은 그냥 모른다 — 리터럴만 접는다.
 */

import ts from "typescript";
import { unwrapExpression } from "./unwrap.mjs";

/** 정적으로 정해지지 않았다는 표식. 값과 헷갈리지 않게 심볼이다. */
export const STATIC_UNKNOWN = Symbol("정적으로 정해지지 않음");

/** 접는 범위의 정본. 머리말과 문서가 이 목록을 그대로 싣는다. */
export const STATIC_EVAL_KINDS = [
	{ id: "literal", title: "리터럴 — 문자열·숫자·불리언·`null`·`undefined`" },
	{ id: "template", title: "템플릿 — 보간까지 정적이면 이어 붙인다" },
	{ id: "tagged-raw", title: "태그 템플릿 `String.raw` — raw 조각과 정적 보간" },
	{ id: "unary", title: "단항 — `+` `-` `~` `!` `void` `typeof`" },
	{ id: "binary", title: "이항 — 비교·산술·비트, 그리고 `&&` `||` `??`" },
	{ id: "conditional", title: "삼항 — 조건이 정해지면 그 갈래" },
	{ id: "const-chain", title: "`const` 사슬 — 구조분해와 배열 분해까지" },
	{ id: "literal-member", title: "리터럴의 멤버 — `\"x\".length`, `[1,2].length`, `{a:1}.a`" },
	{ id: "literal-index", title: "리터럴의 인덱스 — 인덱스 식도 접어서 쓴다 (`[\"a\"][0+0]`)" },
	{ id: "computed-key", title: "계산된 리터럴 키 — `{ [\"role\"]: \"alert\" }` 는 `role` 이다" },
];

/** 표 밖. "없다" 가 아니라 **모른다** 이고, 판정은 놓치는 쪽으로 틀린다. */
export const STATIC_EVAL_OUT_OF_SCOPE = [
	"함수 호출의 결과 일반 (`makeUrl()`, `arr.map(...)`)",
	"정규식 실행 (`/x/.test(s)`)",
	"전역 객체의 속성 (`Date.now`, `Math.PI`, `process.env`)",
	"실행할 때 조립되는 값",
];

/* ─────────────── 이름 ─────────────── */

/**
 * 선언·속성에 적힌 **이름**. 식별자든 문자열 리터럴이든 계산된 키든 같다.
 *
 * `{ role: "alert" }`, `{ "role": "alert" }`, `{ ["role"]: "alert" }` 는 브라우저
 * 에서 구별되지 않는다. 식별자만 이름으로 읽으면 대괄호 한 쌍으로 판정이
 * 갈린다 — 구조분해에서 한 번(16회차 지적 2), 객체 리터럴에서 또 한 번(18회차
 * 지적 2) 같은 사고가 났다. 계산된 키는 이 모듈의 평가기로 접어서 읽는다.
 * 접히지 않으면 `null` — 동적 키는 보증 밖이다.
 */
export function declaredPropertyName(name, sf, scope, seen) {
	if (!name) return null;
	if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
	if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
	if (ts.isNumericLiteral(name)) return name.text;
	if (ts.isComputedPropertyName(name)) {
		const value = staticValue(name.expression, sf, scope, seen);
		if (value === STATIC_UNKNOWN) return null;
		if (typeof value === "string") return value;
		if (typeof value === "number") return String(value);
	}
	return null;
}

/** `obj.key` · `obj[식]` 의 그 키. 인덱스 식도 접어서 읽는다. */
export function accessKeyOf(node, sf, scope, seen) {
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	if (!ts.isElementAccessExpression(node)) return null;
	const value = staticValue(node.argumentExpression, sf, scope, seen);
	if (value === STATIC_UNKNOWN) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return null;
}

/* ─────────────── 값 ─────────────── */

function foldUnary(operator, inner) {
	if (operator === ts.SyntaxKind.PlusToken) return +inner;
	if (operator === ts.SyntaxKind.MinusToken) return -inner;
	if (operator === ts.SyntaxKind.TildeToken) return ~inner;
	if (operator === ts.SyntaxKind.ExclamationToken) return !inner;
	return STATIC_UNKNOWN;
}

function foldBinary(op, left, right) {
	switch (op) {
		case ts.SyntaxKind.EqualsEqualsEqualsToken:
			return left === right;
		case ts.SyntaxKind.ExclamationEqualsEqualsToken:
			return left !== right;
		// biome-ignore lint/suspicious/noDoubleEquals: `==` 의 뜻을 그대로 계산한다
		case ts.SyntaxKind.EqualsEqualsToken:
			return left == right;
		// biome-ignore lint/suspicious/noDoubleEquals: `!=` 의 뜻을 그대로 계산한다
		case ts.SyntaxKind.ExclamationEqualsToken:
			return left != right;
		case ts.SyntaxKind.LessThanToken:
			return left < right;
		case ts.SyntaxKind.LessThanEqualsToken:
			return left <= right;
		case ts.SyntaxKind.GreaterThanToken:
			return left > right;
		case ts.SyntaxKind.GreaterThanEqualsToken:
			return left >= right;
		case ts.SyntaxKind.PlusToken:
			return left + right;
		case ts.SyntaxKind.MinusToken:
			return left - right;
		case ts.SyntaxKind.AsteriskToken:
			return left * right;
		case ts.SyntaxKind.SlashToken:
			return left / right;
		case ts.SyntaxKind.PercentToken:
			return left % right;
		case ts.SyntaxKind.AsteriskAsteriskToken:
			return left ** right;
		case ts.SyntaxKind.AmpersandToken:
			return left & right;
		case ts.SyntaxKind.BarToken:
			return left | right;
		case ts.SyntaxKind.CaretToken:
			return left ^ right;
		case ts.SyntaxKind.LessThanLessThanToken:
			return left << right;
		case ts.SyntaxKind.GreaterThanGreaterThanToken:
			return left >> right;
		case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
			return left >>> right;
		default:
			return STATIC_UNKNOWN;
	}
}

/** 문자열 리터럴 값의 정적 속성. */
function literalPropertyValue(value, key) {
	if (typeof value !== "string") return STATIC_UNKNOWN;
	if (key === "length") return value.length;
	const index = Number(key);
	if (Number.isInteger(index) && index >= 0 && index < value.length) return value[index];
	return STATIC_UNKNOWN;
}

/**
 * 객체·배열 리터럴에서 그 키가 가리키는 **노드**.
 *
 * spread 가 있으면 무엇이 덮였는지 모르므로 통째로 모른다. 이 함수 하나를
 * 멤버 접근과 구조분해가 함께 쓴다 — `{ role: "alert" }.role` 과
 * `const { role } = { role: "alert" }` 은 같은 질문이다(18회차 지적 3).
 */
export function literalMemberNode(literal, key, sf, scope, seen) {
	if (!literal) return null;
	if (ts.isArrayLiteralExpression(literal)) {
		if (literal.elements.some((el) => ts.isSpreadElement(el))) return null;
		if (!/^\d+$/.test(key)) return null;
		const element = literal.elements[Number(key)];
		return element ?? null;
	}
	if (!ts.isObjectLiteralExpression(literal)) return null;
	let found = null;
	for (const property of literal.properties) {
		if (ts.isSpreadAssignment(property)) return null;
		if (ts.isPropertyAssignment(property)) {
			if (declaredPropertyName(property.name, sf, scope, seen) === key)
				found = property.initializer;
		} else if (ts.isShorthandPropertyAssignment(property)) {
			if (property.name.text === key) found = property.name;
		}
	}
	return found;
}

/**
 * 이 식이 정적으로 정해지는 **원시값**인가. 정해지면 그 값, 아니면
 * `STATIC_UNKNOWN`.
 *
 * `scope.constBindingOf(name, sf)` 를 주면 이름도 따라간다. 그 훅은
 * `{ node, sf, path }` 를 돌려준다 — `path` 는 초기화식에서 꺼낼 키의 차례이고,
 * 구조분해(`const { role } = …` 는 `["role"]`, `const [first] = …` 는 `["0"]`)를
 * 그렇게 표현한다.
 */
export function staticValue(node, sf, scope = {}, seen = new Set()) {
	const n = unwrapExpression(node);
	if (!n) return STATIC_UNKNOWN;
	const guard = seen instanceof Set ? seen : new Set();
	if (guard.has(n)) return STATIC_UNKNOWN;
	guard.add(n);

	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
	if (ts.isNumericLiteral(n)) return Number(n.text);
	if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (n.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isIdentifier(n) && n.text === "undefined") return undefined;
	if (ts.isVoidExpression(n)) return undefined;

	if (ts.isTemplateExpression(n)) {
		let out = n.head.text;
		for (const span of n.templateSpans) {
			const piece = staticValue(span.expression, sf, scope, guard);
			if (piece === STATIC_UNKNOWN) return STATIC_UNKNOWN;
			out += String(piece) + span.literal.text;
		}
		return out;
	}

	// `String.raw` 는 이스케이프를 풀지 않은 조각을 그대로 이어 붙인다.
	// 보간이 있으면 그 값도 접어서 넣는다(18회차 지적 4).
	if (ts.isTaggedTemplateExpression(n)) {
		if (!isStringRawTag(n.tag)) return STATIC_UNKNOWN;
		const body = n.template;
		if (ts.isNoSubstitutionTemplateLiteral(body)) return body.rawText ?? body.text;
		if (!ts.isTemplateExpression(body)) return STATIC_UNKNOWN;
		let out = body.head.rawText ?? body.head.text;
		for (const span of body.templateSpans) {
			const piece = staticValue(span.expression, sf, scope, guard);
			if (piece === STATIC_UNKNOWN) return STATIC_UNKNOWN;
			out += String(piece) + (span.literal.rawText ?? span.literal.text);
		}
		return out;
	}

	if (ts.isTypeOfExpression(n)) {
		const inner = staticValue(n.expression, sf, scope, guard);
		return inner === STATIC_UNKNOWN ? STATIC_UNKNOWN : typeof inner;
	}

	if (ts.isPrefixUnaryExpression(n)) {
		const inner = staticValue(n.operand, sf, scope, guard);
		return inner === STATIC_UNKNOWN ? STATIC_UNKNOWN : foldUnary(n.operator, inner);
	}

	if (ts.isConditionalExpression(n)) {
		const cond = staticValue(n.condition, sf, scope, guard);
		if (cond === STATIC_UNKNOWN) return STATIC_UNKNOWN;
		return staticValue(cond ? n.whenTrue : n.whenFalse, sf, scope, guard);
	}

	if (ts.isBinaryExpression(n)) {
		const kind = n.operatorToken.kind;
		const left = staticValue(n.left, sf, scope, guard);
		if (left === STATIC_UNKNOWN) return STATIC_UNKNOWN;
		if (kind === ts.SyntaxKind.AmpersandAmpersandToken)
			return left ? staticValue(n.right, sf, scope, guard) : left;
		if (kind === ts.SyntaxKind.BarBarToken)
			return left ? left : staticValue(n.right, sf, scope, guard);
		if (kind === ts.SyntaxKind.QuestionQuestionToken)
			return left === null || left === undefined
				? staticValue(n.right, sf, scope, guard)
				: left;
		const right = staticValue(n.right, sf, scope, guard);
		if (right === STATIC_UNKNOWN) return STATIC_UNKNOWN;
		return foldBinary(kind, left, right);
	}

	if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
		const key = accessKeyOf(n, sf, scope, guard);
		if (key === null) return STATIC_UNKNOWN;
		const container = containerOf(n.expression, sf, scope, guard);
		if (!container) return STATIC_UNKNOWN;
		if (
			ts.isArrayLiteralExpression(container.node) ||
			ts.isObjectLiteralExpression(container.node)
		) {
			if (key === "length" && ts.isArrayLiteralExpression(container.node))
				return container.node.elements.some((el) => ts.isSpreadElement(el))
					? STATIC_UNKNOWN
					: container.node.elements.length;
			const member = literalMemberNode(container.node, key, container.sf, scope, guard);
			if (!member) return STATIC_UNKNOWN;
			return staticValue(member, container.sf, scope, guard);
		}
		const inner = staticValue(container.node, container.sf, scope, guard);
		if (inner === STATIC_UNKNOWN) return STATIC_UNKNOWN;
		return literalPropertyValue(inner, key);
	}

	if (ts.isIdentifier(n)) {
		const bound = bindingOf(n.text, sf, scope);
		if (!bound) return STATIC_UNKNOWN;
		return staticValue(bound.node, bound.sf, scope, guard);
	}

	return STATIC_UNKNOWN;
}

function isStringRawTag(tag) {
	const t = unwrapExpression(tag);
	if (!t) return false;
	if (ts.isPropertyAccessExpression(t))
		return (
			t.name.text === "raw" && ts.isIdentifier(t.expression) && t.expression.text === "String"
		);
	return ts.isIdentifier(t) && t.text === "raw";
}

/** 담는 것을 노드로 든다. 이름이면 그 `const` 값으로 바꿔 든다. */
function containerOf(expr, sf, scope, seen) {
	const node = unwrapExpression(expr);
	if (!node) return null;
	if (!ts.isIdentifier(node)) return { node, sf };
	const bound = bindingOf(node.text, sf, scope);
	if (!bound) return { node, sf };
	const inner = unwrapExpression(bound.node);
	return inner ? { node: inner, sf: bound.sf } : null;
}

/**
 * 이름이 묶인 값. 훅이 준 `path` 를 초기화식에서 차례로 꺼낸다.
 *
 * `const { role } = { role: "alert" }` 은 `path: ["role"]`,
 * `const [first] = ["alert"]` 은 `path: ["0"]` 이다. 구조분해도 결국 "그
 * 초기화식의 그 키" 라는 같은 질문이다(18회차 지적 3).
 */
function bindingOf(name, sf, scope) {
	if (!scope || typeof scope.constBindingOf !== "function") return null;
	const hit = scope.constBindingOf(name, sf);
	if (!hit || !hit.node) return null;
	let node = unwrapExpression(hit.node);
	let home = hit.sf ?? sf;
	for (const key of hit.path ?? []) {
		if (!node) return null;
		const member = literalMemberNode(node, key, home, scope, new Set());
		if (!member) return null;
		node = unwrapExpression(member);
	}
	return node ? { node, sf: home } : null;
}
