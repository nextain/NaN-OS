/**
 * JSX 와 `createElement` 의 속성을 **뜻으로** 읽는 공용 모듈.
 *
 * 왜 따로 두는가: 아홉 번째 회차까지 같은 구멍이 두 게이트에 따로 났다.
 * check-dead-ui-specs 가 속성 읽기를 고치면 check-recovery-affordance 는
 * 옛 방식으로 남았고, 리뷰어는 고치지 않은 쪽으로 같은 결함을 넣었다.
 * 속성을 읽는 자리가 하나면 구멍도 한 번만 막으면 된다.
 *
 * 무엇을 뜻으로 읽는가: 화면에 실제로 붙는 값이 같으면 같은 것으로 읽는다.
 * `<div role="alert">`, `<div role={"alert"}>`, `<div {...{ role: "alert" }}>`,
 * `createElement("div", { role: "alert" })` 는 브라우저에서 구별되지 않는다.
 * 형태를 하나씩 열거하는 방식은 매 회차 하나가 더 왔다.
 *
 * 무엇을 모른다고 말하는가: 함수 인자나 import 된 객체를 펼친 spread 처럼
 * 값을 정적으로 알 수 없는 자리는 `unknownSpread` 로 표시한다. 호출자가
 * "모른다" 를 "없다" 로 읽으면, 값을 숨기는 것만으로 검사를 통과한다.
 *
 * 무엇이 요소인가는 여기서 정하지 않는다. "이 호출은 어느 모듈의 어느 export
 * 인가" 는 `scripts/lib/bindings.mjs` 가 답하고, 이 모듈은 그 답을 받아
 * react·preact 계열의 요소 만드는 함수인지만 묻는다. 열한 번째 회차까지 그
 * 판정이 `"createElement"` 라는 **글자**였고, 별명 한 줄이면 막다른 오류
 * 화면이 알림으로도 세어지지 않았다.
 *
 * ## 호출 규약 — `env` 는 선택이 아니다
 *
 * 요소를 다루는 함수(`elementFactory`·`isCreateElementCall`·`isElementNode`·
 * `elementProps`·`elementChildren`·`jsxElementsIn`)는 `env` 를 **반드시** 받는다.
 * 안 넘기면 던진다. 예전에는 안 넘겨도 조용히 같은 파일 안에서만 풀었고,
 * 그래서 게이트 한 곳이 인자 하나를 빠뜨린 것만으로 파일을 건너간 별명이
 * 화면에서 사라졌다 — 검사기가 "요소가 아니다" 라고 말한 것이 아니라 아예
 * 못 본 것이라, 결함이 초록 안에 숨었다(12회차 지적 3).
 *
 * 파일을 건너가지 않겠다는 것도 뜻이다. 그때는 `null` 을 넘긴다. 침묵이
 * 아니라 선언이어야 다음 사람이 그것을 읽을 수 있다.
 *
 * 그리고 `bindings.mjs` 가 `argShift`/`argsUnknown` 을 돌려주면 **반드시**
 * 그만큼 인자 자리를 옮기거나 "모른다" 로 다뤄야 한다. `createElement.call(
 * null, "div", { role: "alert" })` 의 둘째 인자는 props 가 아니라 `"div"` 다.
 * 자리를 안 옮기면 같은 화면이 `.call` 한 겹으로 검사를 빠져나간다
 * (12회차 지적 2).
 *
 * ## 이 모듈이 따라가지 않는 것 (보증 밖)
 *
 * `bindings.mjs` 의 보증 밖 목록을 그대로 물려받는다 — 동적 속성 이름
 * (`obj[name]`), `eval`/`new Function`/`Reflect.apply`/`Function.prototype` 을
 * 두 겹 이상 거친 호출, 고차 함수가 돌려준 함수, 배열·객체·`Map` 을 거쳐
 * 흘러간 함수, 동적 `import()`/`require()` 의 결과, 실행할 때 조립되는 문자열.
 * 여기에 이 모듈의 것을 더한다.
 *
 *   - 함수 인자나 못 푼 이름을 펼친 spread 의 속성. 이것은 "없다" 가 아니라
 *     `unknownSpread` 로 알린다 — 호출자가 없다로 읽으면 안 된다.
 *   - 실행할 때 정해지는 값. `alwaysTruthy`/`alwaysFalsy` 는 **리터럴과 그것에
 *     닿는 `const` 사슬**만 접는다. 값이 상태·인자·함수 결과에서 오는 자리는
 *     언제나 "모른다" 이고, 그런 조작은 영구히 꺼 둔 것으로 세지 않는다.
 *
 * 이 경계 안쪽 형태는 새 모양이 와도 같은 규칙으로 잡힌다. 경계 밖은 코드
 * 리뷰의 몫이다.
 *
 * ## 이 저장소의 린트 경계가 금지하는 형태
 *
 * 아래는 게이트가 읽지 않기로 **선언**한 형태이고, 저장소에 들어오지 못한다 —
 * `scripts/check-lint-boundary.mjs` 가 막는다. 목록의 정본은
 * `scripts/lib/lint-boundary-forms.mjs` 하나이고, 이 머리말·린트 게이트·
 * `docs/quality-reviews/obfuscation-forms.md` 가 같은 목록을 본다. 셋이
 * 어긋나면 `src/test/lint-boundary.contract.test.ts` 가 붉어진다.
 *
 *   - `comma-operator` — 쉼표식 `(a, b)` · `(0, f)()`
 *   - `void-literal` — 리터럴에 씌운 `void` (`void 0`, `void "x"`)
 *   - `void-stacked` — 겹쳐 쌓은 `void` (`void void …`)
 *   - `computed-callee` — 리터럴 키로 곧바로 부르기 (`f["call"](…)`, `el["click"]()`)
 *
 * 이 모듈은 위 형태를 지금도 읽는다(이미 닫힌 자리다). 다만 **읽는 것에
 * 기대지 않는다** — 경계는 린트가 지고, 게이트는 자기가 읽는 범위를 지킨다.
 * 그래서 다음 회차의 도전은 린트를 통과하는 형태여야 한다.
 */

import ts from "typescript";
import { exportedValueSite, importedValueSite, resolveCallee } from "./bindings.mjs";
import { unwrapExpression } from "./unwrap.mjs";

/* ─────────────── 파싱과 파일 환경 ─────────────── */

export function parseSource(file, text) {
	return ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		/\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
}

/**
 * 파일 사이를 따라가는 환경. `import` 로 건너간 곳의 상수·타입도 같은 값이다.
 * 넘기지 않으면 같은 파일 안에서만 푼다.
 */
export function makeEnv(files) {
	const parsed = new Map();
	return {
		has: (path) => files.has(path),
		sourceFile(path) {
			if (!files.has(path)) return null;
			if (!parsed.has(path)) parsed.set(path, parseSource(path, files.get(path)));
			return parsed.get(path);
		},
		resolve(from, spec) {
			if (!spec.startsWith(".")) return null;
			const stack = [];
			const base = from.split("/").slice(0, -1).join("/");
			for (const part of `${base}/${spec}`.split("/")) {
				if (part === "." || part === "") continue;
				if (part === "..") stack.pop();
				else stack.push(part);
			}
			const path = stack.join("/").replace(/\.[jt]sx?$/, "");
			for (const candidate of [
				`${path}.tsx`,
				`${path}.ts`,
				`${path}/index.tsx`,
				`${path}/index.ts`,
			]) {
				if (files.has(candidate)) return candidate;
			}
			return null;
		},
	};
}

/* ─────────────── 껍데기 벗기기 ─────────────── */

/**
 * 껍데기를 모두 벗긴다. 값이 없는 `{}` 는 null.
 *
 * 문법 껍데기(괄호·단언·non-null·**쉼표식의 마지막 항**)는
 * `scripts/lib/unwrap.mjs` 하나가 벗긴다. 여기서 더하는 것은 JSX 식 컨테이너
 * (`{ ... }`) 뿐이다 — 그것은 JSX 에만 있는 껍데기라 공용 모듈이 알 필요가 없다.
 * 껍데기 규칙을 이 파일에 다시 적으면, 12회차처럼 callee 쪽만 고쳐지고 값 쪽은
 * 그대로 남는다(13회차 지적 1).
 */
export function unwrapAll(node) {
	let cur = node;
	for (;;) {
		cur = unwrapExpression(cur);
		if (!cur) return null;
		if (ts.isJsxExpression(cur)) {
			if (!cur.expression) return null;
			cur = cur.expression;
			continue;
		}
		return cur;
	}
}

/* ─────────────── 되돌아가지 않기 ─────────────── */

/**
 * 이름·값을 따라갈 때 이미 지난 자리.
 *
 * 예전에는 겹을 셋·넷까지만 셌다. 그런 숫자는 한계가 아니라 **눈금**이다 —
 * 상수를 한 겹 더 쌓거나 spread 를 한 겹 더 씌우면 판정이 뒤집힌다. 200자
 * 창·속성 64개·별명 여섯 겹과 같은 종류의 자리다(13회차 지적 4).
 *
 * 끝나는 이유는 세는 것이 아니라 **다시 가지 않는 것**이다. 이름은 (파일,
 * 이름)으로, 값은 그 노드 자신으로 적어 두고, 같은 자리에 두 번째로 닿으면
 * 모른다로 답한다. 그래서 `const A = B; const B = A;` 같은 순환은 끊기고,
 * 겹은 몇이든 따라간다.
 */
function trail(state) {
	return state instanceof Set ? state : new Set();
}

function nameMark(sf, name) {
	return `${sf && sf.fileName ? sf.fileName : "?"}\u0000${name}`;
}

/* ─────────────── 호출 규약 ─────────────── */

/**
 * `env` 를 넘기지 않고 부른 것을 잡는다.
 *
 * 파일을 건너가지 않겠다는 뜻이면 `null` 을 넘긴다. 빠뜨린 것과 일부러 안
 * 넘긴 것을 구별할 수 없으면, 인자 하나를 잊은 게이트가 조용히 좁게 판정하고
 * 그 사실이 아무 데도 남지 않는다.
 */
function requireEnv(env, fn) {
	if (env === undefined)
		throw new TypeError(
			`${fn}(…): env 를 넘겨야 한다. 파일을 건너가지 않겠다면 null 을 넘긴다.`,
		);
	return env;
}

/* ─────────────── 요소와 속성 ─────────────── */

/**
 * 요소를 만드는 함수를 내주는 모듈들. 이름이 아니라 **어디서 온 무엇인가**로
 * 판정하므로, 별명을 붙이든(`createElement as h`) 네임스페이스로 부르든
 * (`React.createElement`) 같은 것으로 읽힌다.
 */
const ELEMENT_MODULES = new Set([
	"react",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"preact",
	"preact/compat",
	"preact/jsx-runtime",
	"preact/jsx-dev-runtime",
]);

/** 옛 방식. 자식은 셋째 인자부터다. */
const CLASSIC_FACTORIES = new Set(["createElement", "h"]);
/** 새 방식(automatic runtime). 자식은 props 안의 `children` 이다. */
const RUNTIME_FACTORIES = new Set(["jsx", "jsxs", "jsxDEV"]);

/**
 * 이 호출이 요소를 만드는가. 만든다면 자식이 어디 있는 방식인가.
 *
 * `"classic"` 이면 `createElement(type, props, ...children)`,
 * `"runtime"` 이면 `jsx(type, { ...props, children })` 다. 둘 다 props 는 둘째
 * 인자인데 자식 자리가 다르다 — 그 차이를 여기 한 곳에서만 안다.
 *
 * 판정은 `scripts/lib/bindings.mjs` 가 푼 **바인딩**으로 한다. 열한 번째
 * 회차까지 이 자리는 `"createElement"` 라는 글자였고, `import { createElement
 * as h }` 한 줄이면 막다른 오류 화면이 알림으로도 세어지지 않았다.
 *
 * 딱 한 자리만 이름으로 남긴다: 아무 데서도 오지 않은 자유 식별자
 * `createElement(...)`. 어디서 왔는지 모르는 것을 요소가 아니라고 단정하면
 * 놓치는 쪽으로 틀리므로, 옛 판정을 그대로 잠근다. 반대로 `document.
 * createElement("canvas")` 처럼 **출처가 있는 다른 것**은 이제 요소가 아니다.
 */
export function elementFactory(node, env) {
	requireEnv(env, "elementFactory");
	return elementCallShape(node, env).factory;
}

/**
 * 요소를 만드는 호출의 **모양** — 방식과 인자 자리.
 *
 * `argShift` 는 대상 함수의 것이 아닌 앞자리 인자 수다. `createElement.call(
 * null, …)` 이면 1 이고, 그래서 type 은 0 이 아니라 1, props 는 1 이 아니라 2 다.
 * `argsUnknown` 이면 인자 자리를 믿을 수 없다(`.apply`, 인자를 미리 먹인
 * `.bind`) — 그때는 속성을 "없다" 가 아니라 **모른다** 로 다룬다.
 */
export function elementCallShape(node, env) {
	requireEnv(env, "elementCallShape");
	const none = { factory: null, argShift: 0, argsUnknown: false };
	if (!node || !ts.isCallExpression(node)) return none;
	const sf = typeof node.getSourceFile === "function" ? node.getSourceFile() : null;
	const binding = sf ? resolveCallee(node, sf, env) : null;
	// 모듈에서 온 것으로 풀렸을 때만 바인딩으로 판정한다. 전역·자유 식별자는
	// 아래 옛 판정으로 내려보낸다 — 어디서 왔는지 모르는 `createElement` 를
	// 요소가 아니라고 단정하면 놓치는 쪽으로 틀린다.
	if (binding && binding.module) {
		if (!ELEMENT_MODULES.has(binding.module)) return none;
		const shape = {
			argShift: binding.argShift ?? 0,
			argsUnknown: !!binding.argsUnknown,
		};
		if (CLASSIC_FACTORIES.has(binding.imported)) return { factory: "classic", ...shape };
		if (RUNTIME_FACTORIES.has(binding.imported)) return { factory: "runtime", ...shape };
		return none;
	}
	// 아무 데서도 오지 않은 자유 식별자 `createElement` 는 이름으로 잠근다.
	// 그 잠금은 `.call`/`.apply` 로 부른 것에도 같이 걸린다 — 같은 함수를 한 겹
	// 다르게 부른 것뿐이고, 자리는 바인딩이 알려 준 만큼 밀린다(14회차 지적 4).
	if (binding && binding.global === "createElement")
		return {
			factory: "classic",
			argShift: binding.argShift ?? 0,
			argsUnknown: !!binding.argsUnknown,
		};
	const callee = unwrapAll(node.expression);
	if (callee && ts.isIdentifier(callee) && callee.text === "createElement")
		return { factory: "classic", argShift: 0, argsUnknown: false };
	return none;
}

export function isCreateElementCall(node, env) {
	requireEnv(env, "isCreateElementCall");
	return elementCallShape(node, env).factory !== null;
}

export function isElementNode(node, env) {
	requireEnv(env, "isElementNode");
	return (
		!!node &&
		(ts.isJsxElement(node) ||
			ts.isJsxSelfClosingElement(node) ||
			isCreateElementCall(node, env))
	);
}

/** 요소의 여는 태그. createElement 호출은 그 자신이다. */
export function elementOpening(node) {
	return ts.isJsxElement(node) ? node.openingElement : node;
}

function propertyName(name) {
	if (!name) return null;
	if (ts.isIdentifier(name)) return name.text;
	if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	return null;
}

/**
 * 요소가 실제로 받는 속성 전부.
 *
 * JSX 속성, spread 의 객체 리터럴, `const` 로 묶어 둔 객체(같은 파일이든
 * import 로 건너간 파일이든), `createElement` 둘째 인자를 모두 같은 목록으로
 * 돌려준다. 풀 수 없는 spread 는 `unknownSpread` 로 알린다 — 그 요소에는
 * 우리가 못 본 속성이 있을 수 있다는 뜻이고, 호출자는 그것을 "없다" 로
 * 읽으면 안 된다.
 *
 * 속성마다 그 값이 **어느 파일의 것인지**(`sf`)를 함께 싣는다. 값이 다른
 * 파일에서 왔는데 그 사실을 잃으면, 건너간 파일의 노드를 불러온 쪽 트리로
 * 풀게 된다. 그러면 `props.ts` 의 `const OFF = true` 로 꺼 둔 버튼이,
 * 불러오는 화면에 우연히 `const OFF = false` 가 있다는 이유로 열린 것으로
 * 읽힌다 — import 한 겹으로 검사가 다시 열리는 자리다. 호출자는 값을 풀 때
 * 반드시 `prop.sf` 를 넘겨야 한다.
 */
export function elementProps(node, sf, env) {
	requireEnv(env, "elementProps");
	const props = [];
	let unknownSpread = false;

	// `home` 은 지금 읽고 있는 객체가 적혀 있는 파일이다. 파일을 건너갈 때마다
	// 함께 옮겨 간다.
	// 이미 펼친 객체. 겹을 세는 대신 같은 자리에 두 번 가지 않는다 —
	// `const A = { ...B }; const B = { ...A }` 는 여기서 끊긴다.
	const spreadSeen = new Set();
	const fromObject = (expr, home) => {
		const obj = unwrapAll(expr);
		if (!obj) {
			unknownSpread = true;
			return;
		}
		if (spreadSeen.has(obj)) return;
		spreadSeen.add(obj);
		if (obj.kind === ts.SyntaxKind.NullKeyword) return;
		if (ts.isIdentifier(obj) && obj.text === "undefined") return;
		if (ts.isObjectLiteralExpression(obj)) {
			for (const p of obj.properties) {
				if (ts.isPropertyAssignment(p)) {
					const name = propertyName(p.name);
					if (name === null) unknownSpread = true;
					else props.push({ name, value: p.initializer, bare: false, sf: home });
				} else if (ts.isShorthandPropertyAssignment(p)) {
					props.push({ name: p.name.text, value: p.name, bare: false, sf: home });
				} else if (ts.isSpreadAssignment(p)) {
					// 객체 안의 spread 도 그 파일 트리에서 이어 푼다. 여기서 멈추면
					// `{ ...BASE, id: "k" }` 가 BASE 의 속성을 통째로 잃는다.
					fromObject(p.expression, home);
				} else {
					unknownSpread = true;
				}
			}
			return;
		}
		if (ts.isIdentifier(obj)) {
			const bound = constValue(obj.text, home, env);
			if (bound) {
				fromObject(bound.node, bound.sf);
				return;
			}
		}
		unknownSpread = true;
	};

	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
		for (const a of elementOpening(node).attributes.properties) {
			if (ts.isJsxAttribute(a)) {
				const name = a.name
					? ts.isIdentifier(a.name)
						? a.name.text
						: a.name.getText(sf)
					: null;
				if (name === null) unknownSpread = true;
				else
					props.push({
						name,
						value: a.initializer,
						bare: a.initializer === undefined,
						sf,
					});
			} else if (ts.isJsxSpreadAttribute(a)) {
				fromObject(a.expression, sf);
			} else {
				unknownSpread = true;
			}
		}
		return { props, unknownSpread };
	}
	// `createElement` 와 `jsx`/`jsxs` 는 자식 자리가 다르지만 props 는 둘 다
	// 둘째 인자다. `jsx` 쪽은 그 객체 안에 `children` 이 함께 들어 있고, 그것도
	// 실제로 넘어가는 prop 이므로 목록에서 빼지 않는다.
	const shape = elementCallShape(node, env);
	if (shape.factory) {
		// 인자 자리를 믿을 수 없으면 속성을 **모른다**. 없다로 읽으면 인자를
		// 한 겹 미리 먹이는 것만으로 검사를 통과한다.
		if (shape.argsUnknown) {
			unknownSpread = true;
			return { props, unknownSpread };
		}
		const at = 1 + shape.argShift;
		if (node.arguments.length > at) fromObject(node.arguments[at], sf);
		return { props, unknownSpread };
	}
	return { props, unknownSpread };
}

/**
 * 요소의 자식들. JSX 자식과 `createElement` 의 셋째 인자부터.
 *
 * 양쪽에서 **공백뿐인 글자는 자식으로 세지 않는다**. JSX 쪽만 걸러 내면
 * 같은 화면을 `createElement` 로 적었을 때 들여쓰기 한 칸이 형제로 세어져
 * "자식이 하나뿐인가" 판정이 갈린다.
 */
export function elementChildren(node, env) {
	requireEnv(env, "elementChildren");
	const meaningfulJsx = (c) => !ts.isJsxText(c) || c.getText().trim().length > 0;
	const meaningfulValue = (a) => {
		const arg = unwrapAll(a);
		if (!arg) return false;
		if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
			return arg.text.trim().length > 0;
		return true;
	};
	if (ts.isJsxElement(node) || ts.isJsxFragment(node))
		return node.children.filter(meaningfulJsx);
	const shape = elementCallShape(node, env);
	const factory = shape.factory;
	// 인자 자리를 믿을 수 없으면 자식도 모른다. 빈 목록은 "자식이 없다" 가
	// 아니라 "여기서는 더 못 본다" 는 뜻으로만 쓴다.
	if (shape.argsUnknown) return [];
	if (factory === "classic")
		return node.arguments.slice(2 + shape.argShift).filter(meaningfulValue);
	// automatic runtime 은 자식을 props 안에 넣는다. `jsx` 는 하나, `jsxs` 는
	// 배열이다. 여기서 읽지 않으면 `jsx("div", { role: "alert", children: [a, b] })`
	// 가 자식 없는 요소로 보여, "화면에 오르는 것이 이 알림 하나뿐인가" 판정이
	// 통째로 갈린다.
	if (factory === "runtime") {
		const sf = typeof node.getSourceFile === "function" ? node.getSourceFile() : undefined;
		const { props } = elementProps(node, sf, env);
		const slot = props.find((p) => p.name === "children");
		if (!slot || !slot.value) return [];
		const value = unwrapAll(slot.value);
		if (!value) return [];
		if (ts.isArrayLiteralExpression(value)) return value.elements.filter(meaningfulValue);
		return meaningfulValue(value) ? [value] : [];
	}
	return [];
}

/**
 * 어떤 식(또는 파일) 안에 있는 요소 전부. 전위 순회 순서로 준다.
 *
 * `&&`·삼항·`createElement`·자식의 `{cond && …}` 를 모두 뚫고 하위 트리를
 * 끝까지 훑는다. 그러므로 이것은 **도달 가능성 열거이지 유일성 판정이
 * 아니다** — 목록의 크기를 "화면에 오르는 것이 하나뿐인가" 로 읽으면 안
 * 된다. 형제가 있는지는 `elementChildren` 이 세는 자식 수로 묻는다.
 */
export function jsxElementsIn(node, sf, env) {
	requireEnv(env, "jsxElementsIn");
	const out = [];
	const visit = (n) => {
		if (!n) return;
		if (isElementNode(n, env)) out.push(n);
		ts.forEachChild(n, visit);
	};
	visit(node);
	return out;
}

/* ─────────────── 이름 풀기 ─────────────── */

/** 같은 파일(또는 import 로 건너간 파일)에서 그 이름의 선언들. */
function declarationSites(name, sf) {
	const hits = [];
	const visit = (n) => {
		if (ts.isVariableDeclaration(n)) {
			if (ts.isIdentifier(n.name) && n.name.text === name) {
				hits.push({ kind: "var", decl: n });
			} else if (ts.isArrayBindingPattern(n.name)) {
				n.name.elements.forEach((el, index) => {
					if (ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name)
						hits.push({ kind: "arrayBinding", decl: n, index });
				});
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return hits;
}

/**
 * 이 이름이 import 로 들어온 것이면, 값이 적혀 있는 **파일과 이름**.
 *
 * 판정은 `scripts/lib/bindings.mjs` 하나가 한다 — named·default 는 물론
 * 네임스페이스·`export default`·재수출(`export { x } from "…"`, `export *`)까지
 * 같은 규칙으로 따라간다. 예전에는 이 파일이 import 선언을 직접 읽었고, named
 * import 와 그 파일의 `const` 선언만 알았다. 그래서 import **형태** 한 겹만
 * 바꾸면 영구히 꺼 둔 버튼이 열린 것으로 읽혔다(14회차 지적 2).
 *
 * 값이 하나로 정해지지 않는 자리(네임스페이스 전체, `export default <식>`)는
 * 여기서 `null` 이다. 그 둘은 멤버를 물을 때 `constAccessValue` 가 따로 푼다.
 */
function importedBinding(name, sf, env) {
	const site = importedValueSite(name, sf, env);
	if (!site || !site.name) return null;
	return { name: site.name, sf: site.sf };
}

/**
 * `const NAME = <식>` 의 그 식. import 를 따라 파일을 건너간다.
 *
 * 겹의 수는 세지 않는다. 같은 (파일, 이름)에 두 번째로 닿으면 멈춘다.
 */
export function constValue(name, sf, env, state) {
	const seen = trail(state);
	const mark = nameMark(sf, name);
	if (seen.has(mark)) return null;
	seen.add(mark);
	for (const hit of declarationSites(name, sf)) {
		if (hit.kind === "var" && hit.decl.initializer)
			return { node: hit.decl.initializer, sf };
	}
	const imported = importedBinding(name, sf, env);
	if (imported) return constValue(imported.name, imported.sf, env, seen);
	return null;
}

/** 이 이름이 파일 안에서 다시 대입되는가. */
function isReassigned(name, sf) {
	let hit = false;
	const visit = (n) => {
		if (hit) return;
		if (
			ts.isBinaryExpression(n) &&
			n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(n.left) &&
			n.left.text === name
		)
			hit = true;
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return hit;
}

function isConstDeclaration(decl) {
	const list = decl.parent;
	return !!list && ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

/**
 * 재대입 없는 `const` 로만 묶인 값. import 도 한 번 따라간다.
 *
 * `constValue` 와 다른 점은 **const 인지 묻는다**는 것뿐이다. 언제나 참인지를
 * 판정할 때는 값이 도중에 바뀌지 않는다는 사실이 근거의 일부다. `as const`
 * 인지는 묻지 않는다 — `as const` 는 타입 표기이지 값이 바뀌는지와 무관하고,
 * 그것을 요구하면 `as const` 를 떼는 것만으로 판정이 빠져나간다.
 */
function constOnlyValue(name, sf, env, state) {
	const seen = trail(state);
	const mark = nameMark(sf, name);
	if (seen.has(mark)) return null;
	seen.add(mark);
	let seenDeclaration = false;
	for (const hit of declarationSites(name, sf)) {
		if (hit.kind !== "var") continue;
		seenDeclaration = true;
		if (!hit.decl.initializer) continue;
		if (!isConstDeclaration(hit.decl)) continue;
		if (isReassigned(name, sf)) continue;
		return { node: hit.decl.initializer, sf };
	}
	if (seenDeclaration) return null;
	const imported = importedBinding(name, sf, env);
	if (imported) return constOnlyValue(imported.name, imported.sf, env, seen);
	return null;
}

/** `obj.key` 와 `obj["key"]` 의 그 키. 값으로 계산되는 키는 모른다. */
function accessKey(node) {
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	if (ts.isElementAccessExpression(node)) {
		const arg = node.argumentExpression ? unwrapAll(node.argumentExpression) : null;
		if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
			return arg.text;
		if (arg && ts.isNumericLiteral(arg)) return arg.text;
	}
	return null;
}

/** 객체·배열 리터럴에서 그 키의 값. spread 때문에 못 정하면 모른다. */
function literalMember(literal, key, home) {
	if (ts.isArrayLiteralExpression(literal)) {
		if (!/^\d+$/.test(key)) return null;
		const element = literal.elements[Number(key)];
		if (!element || ts.isSpreadElement(element)) return null;
		if (literal.elements.some((el) => ts.isSpreadElement(el))) return null;
		return { node: element, sf: home };
	}
	if (!ts.isObjectLiteralExpression(literal)) return null;
	let spread = false;
	for (const p of literal.properties) {
		if (ts.isSpreadAssignment(p)) {
			spread = true;
			continue;
		}
		if (ts.isPropertyAssignment(p) && propertyName(p.name) === key)
			return { node: p.initializer, sf: home };
		if (ts.isShorthandPropertyAssignment(p) && p.name.text === key)
			return { node: p.name, sf: home };
	}
	// 못 찾았는데 spread 가 있으면 그 안에 있을 수도 있다 — 없다고 말하지 않는다.
	return spread ? null : null;
}

/**
 * `FLAGS.off` · `FLAGS["off"]` 가 가리키는 값. 재대입 없는 const 객체만 푼다.
 *
 * 왜 필요한가: 표지 문자열(`stringCandidates`)은 이미 `obj.id` 를 이 방식으로
 * 푸는데 "언제나 참인가" 판정만 한 겹에서 멈춰 있었다. React 에서
 * `disabled={true}` 와 `disabled={FLAGS.off}`(위에서 `const FLAGS = { off: true }`)
 * 는 둘 다 누를 수 없는 버튼이다. 한쪽만 영구 꺼짐으로 읽으면, 속성 하나로
 * 감싸는 것만으로 죽은 화면이 살아 있는 것으로 세어진다.
 */
function constAccessValue(node, sf, env, state) {
	const seen = trail(state);
	if (seen.has(node)) return null;
	seen.add(node);
	const key = accessKey(node);
	if (key === null) return null;
	const base = unwrapAll(node.expression);
	if (!base) return null;
	let literal = null;
	let home = sf;
	if (ts.isObjectLiteralExpression(base) || ts.isArrayLiteralExpression(base)) {
		literal = base;
	} else if (ts.isIdentifier(base)) {
		// 네임스페이스·default import 의 멤버. `import * as flags from "./x"` 뒤의
		// `flags.OFF` 는 x 가 내주는 `OFF` 이고, `import flags from "./x"`(그 파일이
		// `export default { off: true }`)의 `flags.off` 는 그 객체의 속성이다.
		// import 형태가 하나 다르다는 이유로 판정이 갈리면, 형태 한 겹으로
		// 영구히 꺼 둔 버튼이 열린 것으로 읽힌다(14회차 지적 2).
		const site = importedValueSite(base.text, sf, env);
		if (site && site.namespace) {
			const member = exportedValueSite(key, site.sf, env);
			if (!member || !member.name) return null;
			return constOnlyValue(member.name, member.sf, env);
		}
		if (site && site.defaultNode) {
			const value = unwrapAll(site.defaultNode);
			if (
				!value ||
				(!ts.isObjectLiteralExpression(value) && !ts.isArrayLiteralExpression(value))
			)
				return null;
			return literalMember(value, key, site.sf);
		}
		const bound = constOnlyValue(base.text, sf, env);
		const value = bound ? unwrapAll(bound.node) : null;
		if (!value) return null;
		if (!ts.isObjectLiteralExpression(value) && !ts.isArrayLiteralExpression(value)) return null;
		literal = value;
		home = bound.sf;
	} else if (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) {
		const inner = constAccessValue(base, sf, env, seen);
		const value = inner ? unwrapAll(inner.node) : null;
		if (!value) return null;
		if (!ts.isObjectLiteralExpression(value) && !ts.isArrayLiteralExpression(value)) return null;
		literal = value;
		home = inner.sf;
	} else {
		return null;
	}
	return literalMember(literal, key, home);
}

/** 그 이름으로 부르는 호출들. `setActiveTab("general")` 을 찾을 때 쓴다. */
function callsTo(name, sf) {
	const out = [];
	const visit = (n) => {
		if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name)
			out.push(n);
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return out;
}

function isUseStateCall(node) {
	const callee = node.expression;
	if (ts.isIdentifier(callee)) return /^use(?:State|Reducer)$/.test(callee.text);
	if (ts.isPropertyAccessExpression(callee)) return /^use(?:State|Reducer)$/.test(callee.name.text);
	return false;
}

/** 타입 자리의 문자열 유니언. `"a" | "b"` 와 그 별칭. */
export function typeStrings(typeNode, sf, env, state) {
	const values = new Set();
	let complete = true;
	const seen = trail(state);
	if (!typeNode) return { values, complete: false };
	// 되돌아온 자리는 모른다. `type A = A | "x"` 같은 순환 별칭이 여기서 끊긴다.
	if (seen.has(typeNode)) return { values, complete: false };
	seen.add(typeNode);
	if (ts.isParenthesizedTypeNode(typeNode))
		return typeStrings(typeNode.type, sf, env, seen);
	if (ts.isUnionTypeNode(typeNode)) {
		for (const member of typeNode.types) {
			// 갈래마다 지나온 자국을 따로 든다. 순환은 **한 갈래 안에서** 되돌아
			// 오는 것이고, 형제 갈래가 같은 별칭을 쓰는 것은 순환이 아니다.
			// 자국을 형제끼리 나눠 쓰면 `X | X` 의 둘째가 모른다로 접힌다.
			const r = typeStrings(member, sf, env, new Set(seen));
			for (const v of r.values) values.add(v);
			if (!r.complete) complete = false;
		}
		return { values, complete };
	}
	if (ts.isLiteralTypeNode(typeNode)) {
		const literal = typeNode.literal;
		if (ts.isStringLiteral(literal)) {
			values.add(literal.text);
			return { values, complete: true };
		}
		// `null` 같은 것은 문자열 후보가 아니지만 목록을 깨뜨리지도 않는다.
		if (
			literal.kind === ts.SyntaxKind.NullKeyword ||
			literal.kind === ts.SyntaxKind.TrueKeyword ||
			literal.kind === ts.SyntaxKind.FalseKeyword
		)
			return { values, complete: true };
		return { values, complete: false };
	}
	if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword || typeNode.kind === ts.SyntaxKind.NullKeyword)
		return { values, complete: true };
	if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
		const name = typeNode.typeName.text;
		let alias = null;
		const visit = (n) => {
			if (alias) return;
			if (ts.isTypeAliasDeclaration(n) && n.name.text === name) alias = n;
			ts.forEachChild(n, visit);
		};
		visit(sf);
		if (alias) return typeStrings(alias.type, sf, env, seen);
		const imported = importedBinding(name, sf, env);
		if (imported) {
			let target = null;
			const seek = (n) => {
				if (target) return;
				if (ts.isTypeAliasDeclaration(n) && n.name.text === imported.name) target = n;
				ts.forEachChild(n, seek);
			};
			seek(imported.sf);
			if (target) return typeStrings(target.type, imported.sf, env, seen);
		}
		return { values, complete: false };
	}
	return { values, complete: false };
}

/** 이 식별자가 `xs.map((x) => …)` 의 매개변수인가. 그렇다면 그 `xs`. */
function mapSourceFor(ident) {
	let cur = ident.parent;
	while (cur) {
		if (
			ts.isArrowFunction(cur) ||
			ts.isFunctionExpression(cur) ||
			ts.isFunctionDeclaration(cur)
		) {
			for (const param of cur.parameters) {
				const match = paramBinds(param, ident.text);
				if (!match) continue;
				const call = cur.parent;
				if (
					call &&
					ts.isCallExpression(call) &&
					ts.isPropertyAccessExpression(call.expression) &&
					/^(?:map|flatMap|forEach|filter)$/.test(call.expression.name.text)
				)
					return { array: call.expression.expression, binding: match };
				return null;
			}
		}
		cur = cur.parent;
	}
	return null;
}

/** 매개변수가 이 이름을 묶는가. 통째 이름이면 `whole`, 구조분해면 그 속성. */
function paramBinds(param, name) {
	if (ts.isIdentifier(param.name))
		return param.name.text === name ? { kind: "whole" } : null;
	if (ts.isObjectBindingPattern(param.name)) {
		for (const el of param.name.elements) {
			if (!ts.isIdentifier(el.name) || el.name.text !== name) continue;
			const property = el.propertyName && ts.isIdentifier(el.propertyName)
				? el.propertyName.text
				: el.name.text;
			return { kind: "property", property };
		}
	}
	return null;
}

/** 배열 리터럴 원소들의 그 속성 값. `TABS.map((t) => t.id)` 를 푼다. */
function arrayPropertyValues(arrayExpr, property, sf, env, seen) {
	const arr = unwrapAll(arrayExpr);
	let literal = null;
	let home = sf;
	if (arr && ts.isArrayLiteralExpression(arr)) literal = arr;
	else if (arr && ts.isIdentifier(arr)) {
		const bound = constValue(arr.text, sf, env);
		const value = bound ? unwrapAll(bound.node) : null;
		if (value && ts.isArrayLiteralExpression(value)) {
			literal = value;
			home = bound.sf;
		}
	}
	if (!literal) return { values: new Set(), complete: false };
	const values = new Set();
	let complete = true;
	for (const element of literal.elements) {
		const obj = unwrapAll(element);
		if (!obj || !ts.isObjectLiteralExpression(obj)) {
			complete = false;
			continue;
		}
		const prop = obj.properties.find(
			(p) =>
				(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
				propertyName(p.name) === property,
		);
		if (!prop) {
			complete = false;
			continue;
		}
		const r = stringCandidates(
			ts.isPropertyAssignment(prop) ? prop.initializer : prop.name,
			home,
			env,
			seen,
		);
		for (const v of r.values) values.add(v);
		if (!r.complete) complete = false;
	}
	return { values, complete };
}

function resolveIdentifier(ident, sf, env, seen) {
	const name = ident.text;
	if (name === "undefined") return { values: new Set(), complete: true };

	// `xs.map(({ id }) => <… data-tab={id}>)`
	const mapped = mapSourceFor(ident);
	if (mapped && mapped.binding.kind === "property")
		return arrayPropertyValues(mapped.array, mapped.binding.property, sf, env, seen);
	if (mapped && mapped.binding.kind === "whole")
		return { values: new Set(), complete: false };

	const values = new Set();
	let complete = false;
	let seenDeclaration = false;
	for (const hit of declarationSites(name, sf)) {
		seenDeclaration = true;
		if (hit.kind === "var") {
			if (!hit.decl.initializer) continue;
			const r = stringCandidates(hit.decl.initializer, sf, env, seen);
			for (const v of r.values) values.add(v);
			if (r.complete) complete = true;
			continue;
		}
		// `const [tab, setTab] = useState<Union>(init)` — 그 값이 될 수 있는 것은
		// 초기값, 타입이 적어 둔 유니언, 그리고 세터에 넘기는 리터럴 전부다.
		if (hit.kind === "arrayBinding" && hit.index === 0) {
			const init = unwrapAll(hit.decl.initializer);
			if (!init || !ts.isCallExpression(init) || !isUseStateCall(init)) continue;
			if (init.arguments.length > 0) {
				const r = stringCandidates(init.arguments[0], sf, env, seen);
				for (const v of r.values) values.add(v);
			}
			const declared = init.typeArguments?.length
				? typeStrings(init.typeArguments[0], sf, env)
				: { values: new Set(), complete: false };
			for (const v of declared.values) values.add(v);
			let settersComplete = true;
			const setter = hit.decl.name.elements[1];
			if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
				for (const call of callsTo(setter.name.text, sf)) {
					if (call.arguments.length === 0) continue;
					const r = stringCandidates(call.arguments[0], sf, env, seen);
					for (const v of r.values) values.add(v);
					if (!r.complete) settersComplete = false;
				}
			}
			// 타입이 유니언으로 닫혀 있으면 그것이 전부다. 아니면 세터까지
			// 모두 리터럴일 때만 다 봤다고 말한다.
			if (declared.complete && declared.values.size > 0) complete = true;
			else if (settersComplete && values.size > 0) complete = true;
		}
	}
	if (seenDeclaration) return { values, complete };

	const imported = importedBinding(name, sf, env);
	if (imported) {
		const bound = constValue(imported.name, imported.sf, env);
		if (bound) return stringCandidates(bound.node, bound.sf, env, seen);
	}
	return { values, complete: false };
}

function resolvePropertyAccess(node, sf, env, seen) {
	const target = unwrapAll(node.expression);
	if (target && ts.isIdentifier(target)) {
		const mapped = mapSourceFor(target);
		if (mapped && mapped.binding.kind === "whole")
			return arrayPropertyValues(mapped.array, node.name.text, sf, env, seen);
		const bound = constValue(target.text, sf, env);
		const obj = bound ? unwrapAll(bound.node) : null;
		if (obj && ts.isObjectLiteralExpression(obj)) {
			const prop = obj.properties.find(
				(p) =>
					(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
					propertyName(p.name) === node.name.text,
			);
			if (prop)
				return stringCandidates(
					ts.isPropertyAssignment(prop) ? prop.initializer : prop.name,
					bound.sf,
					env,
					seen,
				);
		}
	}
	return { values: new Set(), complete: false };
}

/**
 * 이 식이 될 수 있는 문자열 전부와, 그것이 **전부인지** 여부.
 *
 * `complete` 가 거짓이면 우리가 못 본 값이 있다는 뜻이다. 호출자는 그것을
 * "그런 값은 없다" 로 읽으면 안 된다 — 값을 한 겹 숨기는 것만으로 검사를
 * 통과하는 자리가 거기서 생긴다.
 */
export function stringCandidates(node, sf, env, seen = new Set()) {
	const values = new Set();
	const n = unwrapAll(node);
	if (!n) return { values, complete: true };
	if (seen.has(n)) return { values, complete: false };
	seen.add(n);

	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
		values.add(n.text);
		return { values, complete: true };
	}
	if (n.kind === ts.SyntaxKind.NullKeyword) return { values, complete: true };
	if (ts.isTemplateExpression(n)) {
		let combos = [n.head.text];
		for (const span of n.templateSpans) {
			const r = stringCandidates(span.expression, sf, env, seen);
			if (!r.complete || r.values.size === 0 || combos.length * r.values.size > 64)
				return { values, complete: false };
			const next = [];
			for (const head of combos)
				for (const v of r.values) next.push(head + v + span.literal.text);
			combos = next;
		}
		for (const c of combos) values.add(c);
		return { values, complete: true };
	}
	if (ts.isConditionalExpression(n)) {
		const a = stringCandidates(n.whenTrue, sf, env, seen);
		const b = stringCandidates(n.whenFalse, sf, env, seen);
		for (const v of a.values) values.add(v);
		for (const v of b.values) values.add(v);
		return { values, complete: a.complete && b.complete };
	}
	if (ts.isBinaryExpression(n)) {
		const kind = n.operatorToken.kind;
		if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
			const r = stringCandidates(n.right, sf, env, seen);
			for (const v of r.values) values.add(v);
			return { values, complete: r.complete };
		}
		if (
			kind === ts.SyntaxKind.BarBarToken ||
			kind === ts.SyntaxKind.QuestionQuestionToken
		) {
			const a = stringCandidates(n.left, sf, env, seen);
			const b = stringCandidates(n.right, sf, env, seen);
			for (const v of a.values) values.add(v);
			for (const v of b.values) values.add(v);
			return { values, complete: a.complete && b.complete };
		}
		if (kind === ts.SyntaxKind.PlusToken) {
			const a = stringCandidates(n.left, sf, env, seen);
			const b = stringCandidates(n.right, sf, env, seen);
			if (!a.complete || !b.complete || a.values.size * b.values.size > 64)
				return { values, complete: false };
			for (const x of a.values) for (const y of b.values) values.add(x + y);
			return { values, complete: true };
		}
		return { values, complete: false };
	}
	if (ts.isIdentifier(n)) return resolveIdentifier(n, sf, env, seen);
	if (ts.isPropertyAccessExpression(n)) return resolvePropertyAccess(n, sf, env, seen);
	return { values, complete: false };
}

/**
 * 이 식이 될 수 있는 문자열 조각 전부.
 *
 * 완성값(조건식의 모든 갈래, `||`·`??`·`&&` 의 문자열 갈래, 같은 파일 상수)에
 * 더해 템플릿의 **고정 조각**까지 돌려준다. 클래스처럼 조각으로 붙는 값은
 * 완성값이 없어도 조각이 화면에 그대로 오른다.
 */
/**
 * 이 식에서 **정적으로 나올 수 있는 문자열 전부**.
 *
 * `stringCandidates` 와 무엇이 다른가: 저것은 "이 식의 값이 무엇인가" 를 묻고,
 * 이것은 "이 식 **안 어딘가에** 적혀 있는 문자열이 무엇인가" 를 묻는다. 주소를
 * 찾는 자리가 필요로 하는 것은 뒤엣것이다 —
 * `fetch(new Request("https://…"))` 의 값은 `Request` 객체이지 문자열이 아니지만,
 * 그 호출이 닿는 곳은 생성자에 적힌 그 주소다(15회차 지적 9).
 *
 * 그래서 형태를 열거하지 않고 **값이 담겨 흘러가는 자리**를 따라간다 —
 * 호출·`new` 의 인자, 객체 리터럴의 속성값, 배열 요소, 그리고 그 사슬에 놓인
 * `const`. 같은 노드에 두 번 가지 않으므로 순환은 끊기고 겹은 세지 않는다.
 *
 * 무엇을 모르는가: `stringCandidates` 와 같다. 함수 매개변수로 받은 값, 실행할
 * 때 조립되는 문자열, 배열·객체·Map 에서 **꺼내 온** 값(`table.get(k)`)은
 * 후보가 없다. 그런 자리는 "없다" 가 아니라 `complete: false` 다.
 *
 * 주의: 이것으로 판정을 넓히면 과탐지가 된다. `elementProps` 나 표지 판정처럼
 * "이 식의 값" 이 필요한 자리는 그대로 `stringCandidates` 를 쓴다.
 */
export function staticStringsIn(node, sf, env, seen = new Set()) {
	const values = new Set();
	let complete = true;
	const visit = (expr, home) => {
		const n = unwrapAll(expr);
		if (!n || seen.has(n)) return;
		seen.add(n);
		const direct = stringCandidates(n, home, env, new Set());
		for (const value of direct.values) values.add(value);
		if (!direct.complete) complete = false;
		if (ts.isNewExpression(n) || ts.isCallExpression(n)) {
			for (const arg of n.arguments ?? []) visit(arg, home);
			return;
		}
		if (ts.isObjectLiteralExpression(n)) {
			for (const p of n.properties) {
				if (ts.isPropertyAssignment(p)) visit(p.initializer, home);
				else if (ts.isShorthandPropertyAssignment(p)) visit(p.name, home);
			}
			return;
		}
		if (ts.isArrayLiteralExpression(n)) {
			for (const element of n.elements) visit(element, home);
			return;
		}
		if (ts.isIdentifier(n)) {
			const bound = constValue(n.text, home, env);
			if (bound) visit(bound.node, bound.sf);
		}
	};
	visit(node, sf);
	return { values, complete };
}

export function staticChunks(node, sf, env, seen = new Set()) {
	const out = new Set();
	const resolved = stringCandidates(node, sf, env, new Set(seen));
	for (const v of resolved.values) out.add(v);
	const n = unwrapAll(node);
	if (!n || seen.has(n)) return [...out];
	seen.add(n);
	if (ts.isTemplateExpression(n)) {
		if (n.head.text) out.add(n.head.text);
		for (const span of n.templateSpans) {
			if (span.literal.text) out.add(span.literal.text);
			for (const c of staticChunks(span.expression, sf, env, seen)) out.add(c);
		}
	} else if (ts.isConditionalExpression(n)) {
		for (const c of staticChunks(n.whenTrue, sf, env, seen)) out.add(c);
		for (const c of staticChunks(n.whenFalse, sf, env, seen)) out.add(c);
	} else if (ts.isBinaryExpression(n)) {
		for (const c of staticChunks(n.right, sf, env, seen)) out.add(c);
		if (n.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
			for (const c of staticChunks(n.left, sf, env, seen)) out.add(c);
	} else if (ts.isIdentifier(n)) {
		const bound = constValue(n.text, sf, env);
		if (bound && bound.node !== n)
			for (const c of staticChunks(bound.node, bound.sf, env, seen)) out.add(c);
	}
	return [...out];
}

/**
 * 이 템플릿이 만드는 문자열이 **빈 문자열인가**. `true`/`false`/`null`(모른다).
 *
 * 문자열의 참·거짓은 길이 하나로 정해진다. 그래서 물을 것은 "무슨 글자가
 * 나오는가" 가 아니라 "한 글자라도 나오는가" 다.
 *
 *   - 고정 조각이 하나라도 비어 있지 않으면 → 빈 문자열이 아니다(참인 값).
 *   - 고정 조각이 모두 비어 있으면 삽입을 본다. 삽입이 정적으로 글자를
 *     만들면(`${true}` 는 `"true"`) 역시 빈 문자열이 아니다. 모든 삽입이
 *     정적으로 빈 문자열이면 빈 문자열이다.
 *   - 그 밖은 모른다. `` `${x}` `` 는 x 가 무엇이냐에 따라 갈린다.
 *
 * `${false}`·`${0}`·`${null}` 이 참인 값이라는 데 주의한다 — 글자로 바뀌면
 * `"false"`·`"0"`·`"null"` 이고, 모두 비어 있지 않다(14회차 지적 3).
 */
function templateEmptiness(node, sf, env, seen) {
	if (node.head.text.length > 0) return false;
	let known = true;
	for (const span of node.templateSpans) {
		if (span.literal.text.length > 0) return false;
		const piece = staticText(span.expression, sf, env, seen);
		if (piece === null) known = false;
		else if (piece.length > 0) return false;
	}
	return known ? true : null;
}

/** 이 식이 글자로 바뀌면 무엇인가. 정적으로 정해지지 않으면 `null`. */
function staticText(node, sf, env, seen) {
	const n = unwrapAll(node);
	if (!n) return null;
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
	if (ts.isNumericLiteral(n)) return String(Number(n.text));
	if (n.kind === ts.SyntaxKind.TrueKeyword) return "true";
	if (n.kind === ts.SyntaxKind.FalseKeyword) return "false";
	if (n.kind === ts.SyntaxKind.NullKeyword) return "null";
	if (ts.isIdentifier(n) && n.text === "undefined") return "undefined";
	if (ts.isVoidExpression(n)) return "undefined";
	if (ts.isTemplateExpression(n)) {
		let out = n.head.text;
		for (const span of n.templateSpans) {
			const piece = staticText(span.expression, sf, env, seen);
			if (piece === null) return null;
			out += piece + span.literal.text;
		}
		return out;
	}
	return null;
}

/**
 * 이 식이 숫자로 바뀌면 얼마인가. 정적으로 정해지지 않으면 `null`.
 *
 * `+true` 는 `1` 이고 React 에서 `disabled={+true}` 는 누를 수 없는 버튼이다.
 * 단항 `+`·`-`·`~` 는 값을 숫자로 바꿀 뿐이라, 안쪽이 리터럴이면 결과도
 * 리터럴이다(15회차 지적 7). 안쪽을 모르면 결과도 모른다 — `-x` 를 참으로도
 * 거짓으로도 접지 않는다.
 */
function staticNumber(node, sf, env, seen) {
	const n = unwrapAll(node);
	if (!n) return null;
	if (ts.isNumericLiteral(n)) return Number(n.text);
	if (n.kind === ts.SyntaxKind.TrueKeyword) return 1;
	if (n.kind === ts.SyntaxKind.FalseKeyword) return 0;
	if (n.kind === ts.SyntaxKind.NullKeyword) return 0;
	if (ts.isIdentifier(n) && n.text === "undefined") return Number.NaN;
	if (ts.isVoidExpression(n)) return Number.NaN;
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
		return n.text.trim() === "" ? 0 : Number(n.text);
	if (ts.isPrefixUnaryExpression(n)) {
		const inner = staticNumber(n.operand, sf, env, seen);
		if (inner === null) return null;
		if (n.operator === ts.SyntaxKind.PlusToken) return inner;
		if (n.operator === ts.SyntaxKind.MinusToken) return -inner;
		if (n.operator === ts.SyntaxKind.TildeToken)
			return Number.isNaN(inner) ? ~0 : ~Math.trunc(inner);
		return null;
	}
	if (ts.isIdentifier(n)) {
		const guard = seen instanceof Set ? seen : new Set();
		if (guard.has(n)) return null;
		guard.add(n);
		for (const hit of declarationSites(n.text, sf)) {
			if (hit.kind !== "var" || !hit.decl.initializer) continue;
			if (!isConstDeclaration(hit.decl)) continue;
			if (isReassigned(n.text, sf)) continue;
			return staticNumber(hit.decl.initializer, sf, env, guard);
		}
		const imported = importedBinding(n.text, sf, env);
		if (imported) {
			const bound = constOnlyValue(imported.name, imported.sf, env);
			if (bound) return staticNumber(bound.node, bound.sf, env, guard);
		}
	}
	return null;
}

/** 값을 숫자·문자열로 바꾸는 단항인가. 그 결과는 결코 널이 아니다. */
function isCoercingUnary(n) {
	if (ts.isTypeOfExpression(n)) return true;
	if (!ts.isPrefixUnaryExpression(n)) return false;
	return (
		n.operator === ts.SyntaxKind.PlusToken ||
		n.operator === ts.SyntaxKind.MinusToken ||
		n.operator === ts.SyntaxKind.TildeToken ||
		n.operator === ts.SyntaxKind.ExclamationToken
	);
}

/**
 * 이 식이 **언제나 널**인가. `true` 면 언제나 널, `false` 면 언제나 널이 아님,
 * `null` 이면 모른다.
 *
 * `??` 가 어느 쪽을 고르는지는 참·거짓이 아니라 이것으로 정해진다. 세 값을
 * 돌려주는 이유는 "모른다" 를 "널이 아니다" 로 접으면 `x ?? true` 가 영구
 * 참으로 읽히기 때문이다 — 실행하면 `x` 가 무엇이냐에 따라 열린 버튼이다.
 */
function staticNullish(node, sf, env, seen) {
	const n = unwrapAll(node);
	if (!n) return null;
	if (n.kind === ts.SyntaxKind.NullKeyword) return true;
	if (ts.isIdentifier(n) && n.text === "undefined") return true;
	// `void <아무 식>` 은 언제나 `undefined` 다. 안쪽 식이 무엇이든 결과는
	// 하나뿐이라 여기서 따라갈 것이 없다(14회차 지적 1).
	if (ts.isVoidExpression(n)) return true;
	// `+x`·`-x`·`~x`·`!x`·`typeof x` 는 숫자나 불리언이나 문자열이 된다.
	// 안쪽이 무엇이든 결과는 결코 널이 아니다.
	if (isCoercingUnary(n)) return false;
	if (
		n.kind === ts.SyntaxKind.TrueKeyword ||
		n.kind === ts.SyntaxKind.FalseKeyword ||
		ts.isStringLiteral(n) ||
		ts.isNoSubstitutionTemplateLiteral(n) ||
		ts.isTemplateExpression(n) ||
		ts.isNumericLiteral(n) ||
		ts.isBigIntLiteral(n) ||
		ts.isObjectLiteralExpression(n) ||
		ts.isArrayLiteralExpression(n) ||
		ts.isArrowFunction(n) ||
		ts.isFunctionExpression(n) ||
		ts.isClassExpression(n) ||
		ts.isJsxElement(n) ||
		ts.isJsxSelfClosingElement(n) ||
		ts.isJsxFragment(n)
	)
		return false;
	// `const off = null` 같은 상수 사슬도 같은 값이다. 한쪽만 풀면 값을 이름
	// 한 겹에 넣는 것으로 판정이 갈린다.
	if (ts.isIdentifier(n)) {
		const guard = seen instanceof Set ? seen : new Set();
		if (guard.has(n)) return null;
		guard.add(n);
		for (const hit of declarationSites(n.text, sf)) {
			if (hit.kind !== "var" || !hit.decl.initializer) continue;
			if (!isConstDeclaration(hit.decl)) continue;
			if (isReassigned(n.text, sf)) continue;
			return staticNullish(hit.decl.initializer, sf, env, guard);
		}
		const imported = importedBinding(n.text, sf, env);
		if (imported) {
			const bound = constOnlyValue(imported.name, imported.sf, env);
			if (bound) return staticNullish(bound.node, bound.sf, env, guard);
		}
	}
	return null;
}

/**
 * 이 식이 **언제나** 참인가. 영구히 꺼 둔 조작의 정의다.
 *
 * `disabled={true}` 만 영구로 보면, 같은 뜻인 `disabled={off}`(위에서
 * `const off = true`)나 `disabled={true && true}`, `disabled={true ? true : false}`,
 * `disabled={null ?? true}` 는 열린 것으로 읽힌다. React 에서 다섯 다 누를 수
 * 없는 버튼이다.
 */
export function alwaysTruthy(node, sf, env, seen = new Set()) {
	const n = unwrapAll(node);
	if (!n) return false;
	if (seen.has(n)) return false;
	seen.add(n);
	if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
		return n.text.length > 0;
	if (ts.isNumericLiteral(n)) return Number(n.text) !== 0;
	if (ts.isBigIntLiteral(n)) return !/^0n?$/.test(n.text);
	// 객체·배열·함수·정규식·`new X()` 는 만들자마자 참인 값이다. React 에서
	// `disabled={{}}` 는 누를 수 없는 버튼이다(14회차 지적 3). 빈 객체·빈 배열도
	// 참이라는 것이 이 자리의 뜻이다 — "비어 있음" 과 "거짓" 은 다르다.
	if (
		ts.isObjectLiteralExpression(n) ||
		ts.isArrayLiteralExpression(n) ||
		ts.isArrowFunction(n) ||
		ts.isFunctionExpression(n) ||
		ts.isClassExpression(n) ||
		ts.isNewExpression(n) ||
		ts.isRegularExpressionLiteral(n) ||
		ts.isJsxElement(n) ||
		ts.isJsxSelfClosingElement(n) ||
		ts.isJsxFragment(n)
	)
		return true;
	if (ts.isTemplateExpression(n)) {
		const filled = templateEmptiness(n, sf, env, seen);
		return filled === false;
	}
	if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
		return alwaysFalsy(n.operand, sf, env, seen);
	// `typeof x` 는 안쪽이 무엇이든 비어 있지 않은 문자열이다 — 언제나 참이다.
	if (ts.isTypeOfExpression(n)) return true;
	// `+`·`-`·`~` 는 값을 숫자로 바꾼다. 리터럴 위의 단항은 접는다(15회차 지적 7).
	if (ts.isPrefixUnaryExpression(n)) {
		const value = staticNumber(n, sf, env, seen);
		return value === null ? false : Boolean(value);
	}
	// 삼항은 **실제로 도는 갈래**로 판정한다. 조건이 언제나 참이면 결과는 언제나
	// 참 갈래이고, 언제나 거짓이면 언제나 거짓 갈래다 — `true ? true : false` 는
	// React 에서 누를 수 없는 버튼이다. 조건을 모를 때만 두 갈래가 모두 참이기를
	// 요구한다. 조건을 안 보면 `c ? a : b` 를 접는 규칙 하나로 영구히 꺼 둔
	// 조작이 열린 것으로 읽힌다(12회차 지적 1).
	if (ts.isConditionalExpression(n)) {
		if (alwaysTruthy(n.condition, sf, env, new Set(seen)))
			return alwaysTruthy(n.whenTrue, sf, env, seen);
		if (alwaysFalsy(n.condition, sf, env, new Set(seen)))
			return alwaysTruthy(n.whenFalse, sf, env, seen);
		return (
			alwaysTruthy(n.whenTrue, sf, env, seen) &&
			alwaysTruthy(n.whenFalse, sf, env, seen)
		);
	}
	if (ts.isBinaryExpression(n)) {
		const kind = n.operatorToken.kind;
		if (kind === ts.SyntaxKind.AmpersandAmpersandToken)
			return (
				alwaysTruthy(n.left, sf, env, seen) && alwaysTruthy(n.right, sf, env, seen)
			);
		// `a || b` 는 둘 중 하나만 언제나 참이면 언제나 참이다.
		if (kind === ts.SyntaxKind.BarBarToken)
			return (
				alwaysTruthy(n.left, sf, env, seen) || alwaysTruthy(n.right, sf, env, seen)
			);
		// `a ?? b` 는 `||` 와 다르다. 고르는 기준이 참·거짓이 아니라 **널인가**
		// 이므로, 왼쪽이 널인지부터 묻는다. 왼쪽만 보면 `false ?? true` 는
		// 옳게 거짓이지만 `null ?? true` 도 거짓이 된다 — 실행하면 `true` 이고
		// React 에서 누를 수 없는 버튼이다(13회차 지적 2).
		if (kind === ts.SyntaxKind.QuestionQuestionToken) {
			// 널 판정에 쓰는 방문 표시는 따로 둔다. 같은 집합을 넘기면 왼쪽을
			// 널로 물어본 것만으로 그 이름이 "이미 본 것" 이 되어, 바로 다음
			// 줄의 참 판정이 조용히 거짓으로 접힌다.
			const nullish = staticNullish(n.left, sf, env, new Set(seen));
			if (nullish === true) return alwaysTruthy(n.right, sf, env, seen);
			if (nullish === false) return alwaysTruthy(n.left, sf, env, seen);
			// 왼쪽이 널인지 모르면 어느 쪽이 나올지도 모른다. 둘 다 언제나
			// 참일 때만 언제나 참이다.
			return (
				alwaysTruthy(n.left, sf, env, seen) && alwaysTruthy(n.right, sf, env, seen)
			);
		}
		return false;
	}
	if (ts.isIdentifier(n)) {
		if (n.text === "undefined") return false;
		for (const hit of declarationSites(n.text, sf)) {
			if (hit.kind !== "var" || !hit.decl.initializer) continue;
			if (!isConstDeclaration(hit.decl)) continue;
			if (isReassigned(n.text, sf)) continue;
			if (alwaysTruthy(hit.decl.initializer, sf, env, seen)) return true;
		}
		const imported = importedBinding(n.text, sf, env);
		if (imported) {
			const bound = constValue(imported.name, imported.sf, env);
			if (bound && !isReassigned(imported.name, imported.sf))
				return alwaysTruthy(bound.node, bound.sf, env, seen);
		}
		return false;
	}
	// `disabled={FLAGS.off}` — 문자열 후보(`stringCandidates`)가 이미 푸는 바로
	// 그 속성이다. 한쪽만 풀면 값을 객체 한 겹에 넣는 것으로 판정이 갈린다.
	if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
		const member = constAccessValue(n, sf, env);
		if (member) return alwaysTruthy(member.node, member.sf, env, seen);
		return false;
	}
	return false;
}

function alwaysFalsy(node, sf, env, seen) {
	const n = unwrapAll(node);
	if (!n) return false;
	if (n.kind === ts.SyntaxKind.FalseKeyword) return true;
	if (n.kind === ts.SyntaxKind.NullKeyword) return true;
	if (ts.isIdentifier(n) && n.text === "undefined") return true;
	// `void <아무 식>` 은 언제나 `undefined` 이고, `undefined` 는 거짓이다.
	if (ts.isVoidExpression(n)) return true;
	// `typeof x` 는 비어 있지 않은 문자열이라 결코 거짓이 아니다.
	if (ts.isTypeOfExpression(n)) return false;
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
		return n.text.length === 0;
	if (ts.isNumericLiteral(n)) return Number(n.text) === 0;
	if (ts.isBigIntLiteral(n)) return /^0n?$/.test(n.text);
	if (ts.isTemplateExpression(n)) return templateEmptiness(n, sf, env, seen) === true;
	if (
		ts.isObjectLiteralExpression(n) ||
		ts.isArrayLiteralExpression(n) ||
		ts.isArrowFunction(n) ||
		ts.isFunctionExpression(n) ||
		ts.isClassExpression(n) ||
		ts.isNewExpression(n) ||
		ts.isRegularExpressionLiteral(n)
	)
		return false;
	if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
		return alwaysTruthy(n.operand, sf, env, new Set(seen));
	// `-0`·`+""`·`+"a"`(NaN) 는 언제나 거짓이다. 참 쪽과 대칭으로 접는다.
	if (ts.isPrefixUnaryExpression(n)) {
		const value = staticNumber(n, sf, env, seen);
		return value === null ? false : !value;
	}
	// 삼항은 참 쪽과 대칭이다. 조건이 언제나 참이면 참 갈래로, 언제나 거짓이면
	// 거짓 갈래로 접고, 조건을 모를 때만 두 갈래가 모두 언제나 거짓이기를
	// 요구한다. 한쪽만 규칙을 두면 `disabled={!(c ? A : B)}` 에서 판정이 갈린다.
	if (ts.isConditionalExpression(n)) {
		if (alwaysTruthy(n.condition, sf, env, new Set(seen)))
			return alwaysFalsy(n.whenTrue, sf, env, seen);
		if (alwaysFalsy(n.condition, sf, env, new Set(seen)))
			return alwaysFalsy(n.whenFalse, sf, env, seen);
		return (
			alwaysFalsy(n.whenTrue, sf, env, seen) && alwaysFalsy(n.whenFalse, sf, env, seen)
		);
	}
	// `a ?? b` 는 참 쪽과 대칭이다 — 왼쪽이 널이면 오른쪽이, 널이 아니면
	// 왼쪽이 결과다. `null ?? false` 는 언제나 거짓이고, `false ?? true` 도 그렇다.
	if (
		ts.isBinaryExpression(n) &&
		n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
	) {
		const nullish = staticNullish(n.left, sf, env, new Set(seen));
		if (nullish === true) return alwaysFalsy(n.right, sf, env, seen);
		if (nullish === false) return alwaysFalsy(n.left, sf, env, seen);
		return (
			alwaysFalsy(n.left, sf, env, seen) && alwaysFalsy(n.right, sf, env, seen)
		);
	}
	if (ts.isIdentifier(n)) {
		for (const hit of declarationSites(n.text, sf)) {
			if (hit.kind !== "var" || !hit.decl.initializer) continue;
			if (!isConstDeclaration(hit.decl)) continue;
			if (isReassigned(n.text, sf)) continue;
			if (alwaysFalsy(hit.decl.initializer, sf, env, seen)) return true;
		}
		const imported = importedBinding(n.text, sf, env);
		if (imported) {
			const bound = constOnlyValue(imported.name, imported.sf, env);
			if (bound) return alwaysFalsy(bound.node, bound.sf, env, seen);
		}
	}
	// `disabled={!FLAGS.on}` 은 `FLAGS.on` 이 언제나 거짓일 때 영구히 꺼져 있다.
	// 참 쪽만 속성을 풀면 부정 한 겹으로 같은 구멍이 남는다.
	if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
		const member = constAccessValue(n, sf, env);
		if (member) return alwaysFalsy(member.node, member.sf, env, seen);
	}
	return false;
}
