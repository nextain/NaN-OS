/**
 * 요소가 없어도 조용히 넘어가는 클릭과, 리눅스에서 반드시 실패하는 클릭 대기를
 * 잡는다.
 *
 * 왜 필요한가: `if (el) el.click()` 은 요소가 없으면 아무 일도 하지 않고,
 * 그 사실이 어디에도 남지 않는다. 그래서 실패가 한 걸음 뒤에서 엉뚱한
 * 모습으로 나타난다 — 실제로 92번 스펙이 "슬롯이 활성이 아니다" 로 실패했는데
 * 원인은 그보다 앞에서 버튼을 못 찾은 것이었다. 원인과 증상이 떨어져 있으면
 * 고치는 사람이 엉뚱한 곳을 판다.
 *
 * 무엇을 재는가: 스펙과 헬퍼 안에서 "있으면 누르고 없으면 넘어가는" 꼴.
 * 눌렀는지 돌려주고 못 눌렀으면 말하는 형태(`if (!pressed) throw`)는 세지
 * 않는다.
 *
 * `waitForClickable` 도 함께 본다. WebKitWebDriver 는 요소를 상호작용 가능으로
 * 보지 않아서 그 대기가 시간을 다 쓰고 실패한다 — 실제로 열 개 스펙이 그
 * 자리에서 삼십 초씩 기다리다 죽었다. 헬퍼(`clickElement`)는 보이는 것을
 * 확인한 뒤 페이지 안에서 누르므로 그 환경을 지난다.
 *
 * ## 어디서 재는가 (10회차 지적 8 이후)
 *
 * 예전에는 정규식 나열이었다. 같은 무음을 적는 방법이 하나 더 나올
 * 때마다 게이트가 뚫렸다 — 9b 회차는 `return undefined`, 10회차는
 * `return void 0` 이었다. `void 0` 은 `return;` 과 같은 값이고, 사람 눈에는
 * 구별되지 않는다. 형태를 하나 더 열거하는 대신 **판정을 파서로 옮겼다.**
 *
 * ## 무엇을 세는 단위인가 (11회차 지적 5 이후)
 *
 * 열 번째까지 판정의 단위는 **이름**이었다. 조건의 왼쪽이 식별자일 때만
 * 세었고, 클릭도 `이름.click(...)` 만 세었다. 그래서 같은 무음이 두 가지
 * 방식으로 빠져나갔다 — 보호되는 것이 이름이 아닐 때
 * (`(document.querySelector(sel) as HTMLElement)`, `state.el`)와, 클릭을
 * `void`·`await`·괄호로 한 겹 싼 때다. `void el.click()` 은 `el.click()` 이고,
 * `el != null && el.click()` 은 `el && el.click()` 이다.
 *
 * 이제 단위는 **보호되는 식 E** 다. 존재를 묻는 형태(`E`, `!!E`, `E != null`,
 * `E !== undefined`, `Boolean(E)`, `typeof E !== "undefined"`)를 하나로 읽어
 * E 를 꺼내고, 그 자리에서 눌리는 것이 같은 E 인지만 본다. E 는 식별자여야
 * 할 이유가 없다 — 속성 접근이든 단언으로 싼 호출이든 글자가 같으면 같은
 * 식으로 본다. 형태가 하나 더 와도 판정의 단위는 그대로다.
 *
 * 그래서 이제 파서에게 묻는 것은 이렇다.
 *
 *   - 조건이 **어떤 식의 있음/없음** 인가 (`el`, `!el`, `el == null`,
 *     `el !== undefined`, `Boolean(el)`, `typeof el !== "undefined"` …).
 *   - 없음일 때 그 가지가 **값 없이 빠져나가는가** (`return`, `return undefined`,
 *     `return void …`, `continue`). 값을 돌려주는 `return false` 는 다르다 —
 *     못 눌렀다는 사실을 부르는 쪽에 넘기는 것이고, 이 게이트가 권하는 형태다.
 *   - 그 뒤 같은 블록에서 **그 식을** 누르는가. 클릭이 `void`·`await`·괄호·`as`
 *     로 싸여 있어도 같은 클릭이다.
 *
 * `void 0`·`void expr`·`undefined` 는 파서에게 모두 "값 없이 나간다" 로 보이므로,
 * 셋을 따로 적어 둘 자리가 없다.
 *
 * 무엇을 재지 않는가: 값이 어디서 흘러 들어왔는지(`const el = pick();` 의 `pick`
 * 안쪽)는 보지 않는다. 같은 식인지는 글자로 비교하므로, 부를 때마다 다른 값을
 * 주는 식을 두 번 적은 자리는 같은 것으로 읽는다. 이 게이트는 한 함수 안에서
 * 사람이 읽어 알 수 있는 자리까지만 말한다.
 *
 * ## 무엇이 있음 가드인가 (13회차 지적 6 · 15회차 지적 5 이후)
 *
 * 묻는 것은 문법이 아니라 하나다 — **클릭이 E 가 있을 때만 도는가.** 그래서
 * 아래가 모두 같은 하나로 읽힌다.
 *
 *   - `if (E) E.click()` · `if (!E) return; … E.click()`
 *   - `E && E.click()` — 왼쪽이 있음 검사면 오른쪽은 있을 때만 돈다
 *   - `!E || E.click()` — 왼쪽이 없음 검사면 오른쪽은 있을 때만 돈다
 *     (드모르간으로 위와 같은 문장이다)
 *   - `E &&= E.click()` · `E ||= …` — 짧은회로 대입도 같은 뜻의 이항으로 읽는다
 *   - `E ? E.click() : undefined` · `!E ? undefined : E.click()`
 *   - `E?.click()`
 *
 * 연산자를 세면 매 회차에 하나가 더 온다. 가드는 `if (E) …`, `if (!E) return; …`,
 * `E && …`, `E?.click()` 넷이었다.
 * `E ? E.click() : undefined` 는 그 넷 어디에도 없는데 같은 무음이다 — 있으면
 * 누르고 없으면 아무것도 남기지 않는다. 이제 삼항도 같은 하나로 읽는다:
 * 조건이 있음(또는 없음) 검사이고, 도는 갈래가 그 식을 누르고, 다른 갈래가
 * 값을 남기지 않으면(`undefined`·`null`·`void …`) 가드다.
 *
 * ## 무엇이 클릭인가 (12회차 지적 7 이후)
 *
 * 클릭은 이제 형태가 아니라 **E 에 대한 `click` 멤버 호출**이다. `E.click(...)`,
 * `E?.click(...)`, `E["click"](...)`(리터럴 키), `E.click.call(E, …)`/`.apply(E, …)`
 * 가 모두 같은 하나로 읽힌다. 열한 번째까지는 속성 접근 한 형태만 클릭이었고,
 * 대괄호로 적거나 `.call` 로 부르면 같은 무음이 세어지지 않았다.
 *
 * ## 이 게이트가 따라가지 않는 것 (보증 밖)
 *
 * 아래는 일부러 보지 않는다 — 정적으로 답이 정해지지 않는 자리다. 여기 적힌
 * 것은 구멍이 아니라 경계이고, 그 바깥은 코드 리뷰의 몫이다.
 *
 *   - 동적 속성 이름 — `E[name]()`, `E[key()]()`. 리터럴 키는 경계 안이다.
 *   - `eval`/`new Function`/`Reflect.apply`/`Function.prototype` 을 두 겹 이상
 *     거친 호출(`E.click.call.call(…)`).
 *   - 고차 함수가 돌려준 함수 — `const press = make(el); press()`.
 *   - 배열·객체·`Map` 을 거쳐 흘러간 함수 — `handlers[0]()`, `table.get(k)()`.
 *   - 동적 `import()`/`require()` 로 받아 온 것, 실행할 때 조립되는 문자열로
 *     정해지는 이름.
 *   - `E.click.call(other)` 처럼 받는 쪽이 다른 식인 호출. 같은 무음이 아니다.
 *
 * 지금 있는 것은 baseline 으로 잠그고 늘어나는 것만 막는다. 한 번에 고치면
 * 그 커밋을 아무도 검토할 수 없다.
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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { unwrapExpression } from "./lib/unwrap.mjs";

const SHELL = "packages/shell";

/**
 * 지금 상태. 줄이면 이 값도 함께 줄여야 한다.
 *
 * 49 → 61 → 59 → 107. 마지막 변화는 **새로 생긴 것이 아니다.** 판정을 파서로
 * 옮기고 다시 세었더니 옛 셈이 두 가지로 틀려 있었다.
 *
 *   - 옛 정규식은 `?.` 앞에 낱말이 있어야 셌다(`(\w+)\?\.click\(`). 그래서
 *     이 저장소에 가장 흔한 무음 클릭인
 *     `(document.querySelector(sel) as HTMLElement)?.click()` 쉰 곳을 통째로
 *     못 보고 있었다 — `querySelector` 는 못 찾으면 null 을 주므로 그 자리는
 *     정확히 "없으면 조용히 넘어가는 클릭" 이다.
 *   - 반대로 옛 셈에는 **주석 안의 예시** 두 건이 들어 있었다. 파서는 코드만
 *     본다.
 *
 * 그래서 59 = 코드 57 + 주석 2 였고, 지금 107 = 57 + 새로 보인 50 이다. 수가
 * 커진 것은 게이트가 느슨해진 것이 아니라 눈이 밝아진 것이고, 이 값은 그
 * 빚을 잠근다.
 *
 * 11회차에 판정의 단위를 이름에서 **보호되는 식**으로 옮기고 다시 세었다.
 * 값은 107 그대로다 — 새로 보게 된 형태(`E != null && E.click()`,
 * `void E.click()`, `Boolean(E)`, `typeof E !== "undefined"`, 이름이 아닌 E)가
 * 지금 이 저장소에는 하나도 없기 때문이다. 그것들이 잡히는지는 셈이 아니라
 * 주입으로 확인했다(11회차 지적 5). 이 값을 줄이거나 늘리는 기준은 그대로다 —
 * 파서가 더 밝아진 만큼은 잠그고, 판정 범위 자체는 넓히지 않는다.
 */
const BASELINE = 107;

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

function parse(file, text) {
	return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/**
 * 껍데기와 `await` 를 벗겨 알맹이를 돌려준다.
 *
 * 문법 껍데기(괄호·단언·non-null·**쉼표식의 마지막 항**)는
 * `scripts/lib/unwrap.mjs` 하나가 벗긴다. 여기서 더하는 것은 `await` 뿐이다 —
 * 클릭을 기다렸는지는 같은 클릭이냐를 가르지 않는다. 껍데기 규칙을 이 파일에
 * 다시 적으면 `(0, el.click())` 처럼 공용 모듈이 이미 아는 형태가 여기서만
 * 빠져나간다(13회차 지적 1).
 */
function unwrap(node) {
	let current = node;
	for (;;) {
		current = unwrapExpression(current);
		if (!current) return null;
		if (ts.isAwaitExpression(current)) {
			current = current.expression;
			continue;
		}
		return current;
	}
}

/**
 * 값을 버리는 껍데기까지 벗긴다.
 *
 * `void el.click()` 은 `el.click()` 과 같은 클릭이다 — 결과를 쓰지 않겠다고
 * 적었을 뿐이다. 여기서 벗기지 않으면 `void` 세 글자로 같은 무음이 셈에서
 * 빠진다. 값이 있는지 보는 `exitsWithoutValue` 는 이것을 쓰지 않는다 — 거기서는
 * `void` 가 "값 없이 나간다" 는 근거 그 자체다.
 */
function unwrapDiscarded(node) {
	// 겹의 수를 세지 않는다. 예전에는 여덟 번만 돌았고, 아홉 번째 `void` 에서
	// 알맹이는 여전히 `el.click()` 인데 클릭이 아니었다(14회차 지적 7). 그런
	// 숫자는 한계가 아니라 "몇 겹을 더 씌우면 통과하는가" 를 알려 주는 눈금이다.
	// 껍데기는 언제나 자식 하나로 내려가므로 이 반복은 반드시 끝난다.
	let current = unwrap(node);
	for (;;) {
		if (!current || !ts.isVoidExpression(current)) return current ?? null;
		current = unwrap(current.expression);
	}
}

/**
 * 이 식을 가리키는 글자. 같은 식인지는 글자로 비교한다.
 *
 * 판정의 단위가 **이름**이던 동안, 보호되는 것이 이름이 아니면
 * (`(document.querySelector(sel) as HTMLElement)`, `state.el`) 같은 무음이
 * 세어지지 않았다. 이름이 아니라 식으로 비교하면 그 자리가 닫힌다. 값이
 * 같은지까지는 모른다 — 같은 글자를 두 번 부르는 식(`pick()`)은 실제로는 다른
 * 값일 수 있다. 이 게이트는 사람이 읽어 "같은 것을 보고 같은 것을 누른다" 고
 * 아는 자리까지만 말한다.
 */
function exprKey(node) {
	const n = unwrap(node);
	if (!n) return null;
	try {
		return n.getText().replace(/\s+/g, "");
	} catch {
		return null;
	}
}

/** `null`·`undefined`·`void 0` 처럼 "없음" 을 뜻하는 자리인가. */
function isNullish(node) {
	if (!node) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return true;
	if (ts.isIdentifier(node) && node.text === "undefined") return true;
	return ts.isVoidExpression(node);
}

/** `E`(어떤 식이든) 를 `null`/`undefined` 와 비교하는 식이면 그 `E`. */
function nullComparand(node) {
	const left = unwrap(node.left);
	const right = unwrap(node.right);
	if (isNullish(right) && !isNullish(left)) return left;
	if (isNullish(left) && !isNullish(right)) return right;
	return null;
}

/** `typeof E <op> "undefined"` 면 그 `E`. */
function typeofComparand(node) {
	const pick = (a, b) =>
		a &&
		ts.isTypeOfExpression(a) &&
		b &&
		(ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b)) &&
		b.text === "undefined"
			? unwrap(a.expression)
			: null;
	const left = unwrap(node.left);
	const right = unwrap(node.right);
	return pick(left, right) ?? pick(right, left);
}

/** `Boolean(E)` 면 그 `E`. */
function booleanCallArgument(node) {
	if (!node || !ts.isCallExpression(node)) return null;
	const callee = unwrap(node.expression);
	if (!callee || !ts.isIdentifier(callee) || callee.text !== "Boolean") return null;
	if (node.arguments.length !== 1) return null;
	return unwrap(node.arguments[0]);
}

/**
 * 조건이 "이 **식**이 있으면" 인가. 그렇다면 그 식.
 *
 * 존재를 묻는 방법은 여럿이고 셋 다 같은 뜻이다 — `E`, `!!E`, `E != null`,
 * `E !== undefined`, `Boolean(E)`, `typeof E !== "undefined"`. 형태를 하나씩
 * 열거하는 대신 "무엇이 보호되는가" 를 돌려주고, 누르는 쪽과 같은 식인지만
 * 본다.
 */
function presenceOf(condition) {
	const node = unwrap(condition);
	if (!node) return null;
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
		const inner = unwrap(node.operand);
		// `!!E` 만 있음이다. `!E` 는 없음이다.
		if (inner && ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken)
			return unwrap(inner.operand);
		return null;
	}
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		// `a && E && E.click()` — 마지막 조건이 보호하는 것이다.
		if (kind === ts.SyntaxKind.AmpersandAmpersandToken) return presenceOf(node.right);
		const notEqual =
			kind === ts.SyntaxKind.ExclamationEqualsToken ||
			kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
		if (!notEqual) return null;
		return nullComparand(node) ?? typeofComparand(node);
	}
	const boolean = booleanCallArgument(node);
	if (boolean) return boolean;
	return node;
}

/** 조건이 "이 **식**이 없으면" 인가. 그렇다면 그 식. */
function absenceOf(condition) {
	const node = unwrap(condition);
	if (!node) return null;
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
		const inner = unwrap(node.operand);
		if (!inner) return null;
		// `!!E` 는 있음이다.
		if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken)
			return null;
		return booleanCallArgument(inner) ?? inner;
	}
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		const equal =
			kind === ts.SyntaxKind.EqualsEqualsToken ||
			kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
		if (!equal) return null;
		return nullComparand(node) ?? typeofComparand(node);
	}
	return null;
}

/**
 * 값 없이 빠져나가는 가지인가.
 *
 * `return;`, `return undefined;`, `return void 0;`, `return void anything;`,
 * `continue;` 는 부르는 쪽에 아무것도 남기지 않는다는 점에서 같다.
 */
function exitsWithoutValue(statement) {
	if (!statement) return false;
	if (ts.isBlock(statement))
		return statement.statements.length > 0 && statement.statements.every(exitsWithoutValue);
	if (ts.isContinueStatement(statement)) return true;
	if (!ts.isReturnStatement(statement)) return false;
	if (!statement.expression) return true;
	const value = unwrap(statement.expression);
	if (ts.isVoidExpression(value)) return true;
	if (ts.isIdentifier(value) && value.text === "undefined") return true;
	return false;
}

/**
 * 멤버 접근의 이름. 리터럴 키(`E["click"]`)는 속성 접근(`E.click`)과 같다.
 *
 * 동적 키(`E[name]`)는 `null` 이다 — 실행할 때 정해지는 이름은 이 게이트의
 * 보증 밖이고, 그렇게 적힌 자리는 코드 리뷰가 본다.
 */
function memberName(node) {
	if (!node) return null;
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	if (ts.isElementAccessExpression(node)) {
		const key = unwrap(node.argumentExpression);
		if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)))
			return key.text;
	}
	return null;
}

/** 멤버 접근의 왼쪽 식. */
function memberBase(node) {
	if (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
		return node.expression;
	return null;
}

/**
 * 이 식이 **E 에 대한 `click` 멤버 호출** 이면 그 `E`.
 *
 * 열한 번째까지 판정은 `E.click(...)` 이라는 **속성 접근 한 형태**였다. 같은
 * 메서드를 부르는 다른 적는 법이 그대로 통과했다 — `E["click"]()` 은 같은
 * 메서드이고, `E.click.call(E)` 는 같은 호출이다(12회차 지적 7). 파괴 게이트는
 * 11회차에 `.call` 을 닫았는데 무음 클릭은 그 수리를 받지 않았다.
 *
 * 이제 묻는 것은 형태가 아니라 하나다 — 이 호출이 **어떤 식의 `click` 을
 * 부르는가**. 그래서 아래가 모두 같은 클릭이다.
 *
 *   - `E.click(...)`, `E?.click(...)`
 *   - `E["click"](...)` (리터럴 키)
 *   - `E.click.call(E, …)` · `E["click"].apply(E, …)` — 받는 쪽이 같은 식일 때만
 *
 * `void`·`await`·괄호·`as` 는 그대로 벗긴다.
 *
 * 보증 밖: 동적 키(`E[name]()`), `Reflect.apply`, `Function.prototype` 을 두 겹
 * 이상 거친 호출, 배열·객체를 거쳐 흘러간 함수. 그런 자리는 여기서 세지 않는다.
 */
function clickReceiver(node) {
	const call = unwrapDiscarded(node);
	if (!call || !ts.isCallExpression(call)) return null;
	const callee = unwrap(call.expression);
	const name = memberName(callee);
	if (name === "click") return unwrap(memberBase(callee));
	// `E.click.call(E, …)` / `.apply(E, …)` — 첫 인자가 받는 쪽이다. 그것이
	// 같은 식일 때만 같은 클릭이다. 남의 요소를 눌러 주는 자리는 다른 뜻이다.
	if (name === "call" || name === "apply") {
		const inner = unwrap(memberBase(callee));
		if (memberName(inner) !== "click") return null;
		const receiver = unwrap(memberBase(inner));
		const first = call.arguments[0];
		if (!receiver || !first) return null;
		return exprKey(receiver) === exprKey(first) ? receiver : null;
	}
	return null;
}

/** 이 문(statement) 이 곧바로 그 식을 누르는가. */
function isDirectClickStatement(statement, key) {
	if (!statement) return false;
	if (ts.isBlock(statement))
		return isDirectClickStatement(statement.statements[0], key);
	if (!ts.isExpressionStatement(statement)) return false;
	const receiver = clickReceiver(statement.expression);
	return !!receiver && exprKey(receiver) === key;
}

/** 이 노드 아래 어딘가에서 그 식을 누르는가. */
function clicksKey(node, key) {
	let found = false;
	const visit = (current) => {
		if (found || !current) return;
		if (ts.isCallExpression(current)) {
			const receiver = clickReceiver(current);
			if (receiver && exprKey(receiver) === key) {
				found = true;
				return;
			}
		}
		current.forEachChild(visit);
	};
	visit(node);
	return found;
}

/** 이름이 무엇이든 `x?.click(...)` 처럼 없으면 조용히 넘어가는 클릭인가. */
function isOptionalClick(node) {
	if (!ts.isCallExpression(node)) return false;
	const callee = node.expression;
	if (memberName(callee) !== "click") return false;
	return !!callee.questionDotToken || !!node.questionDotToken;
}

/**
 * 짧은회로 대입을 같은 뜻의 이항으로 읽는다.
 *
 * `E &&= f()` 는 `E && (E = f())` 이고, `E ||= f()` 는 `E || (E = f())` 이며,
 * `E ??= f()` 는 `E ?? (E = f())` 다. 오른쪽이 언제 도는가는 셋 다 같은 이름의
 * 이항과 똑같다 — 대입이라는 것만 다르다. 토큰을 세면 매 회차에 하나가 더
 * 온다(16회차 지적 6). 그래서 토큰을 같은 뜻으로 바꾼 뒤 한 규칙으로 읽는다.
 *
 * `??=` 는 여기서 `??` 가 되고, `??` 에는 있음 가드가 없다 — `E ??= E.click()`
 * 은 **없을 때** 오른쪽이 돌므로 무음 클릭이 아니라 그냥 깨지는 코드다.
 * 그 사실이 규칙에서 저절로 따라 나온다.
 */
function shortCircuitOf(kind) {
	if (kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken)
		return ts.SyntaxKind.AmpersandAmpersandToken;
	if (kind === ts.SyntaxKind.BarBarEqualsToken) return ts.SyntaxKind.BarBarToken;
	if (kind === ts.SyntaxKind.QuestionQuestionEqualsToken)
		return ts.SyntaxKind.QuestionQuestionToken;
	return kind;
}

/**
 * 이 식이 아무 값도 남기지 않는가.
 *
 * `undefined`, `null`, `void …` 는 부르는 쪽에 남는 것이 없다는 점에서 같다.
 * 삼항의 다른 갈래가 이것이면, 그 삼항은 "있으면 누르고 없으면 넘어간다" 다.
 * 값을 돌려주는 갈래(`false` 같은 것)는 다르다 — 못 눌렀다는 사실을 부르는
 * 쪽에 넘기는 것이고, 이 게이트가 권하는 형태다.
 */
function isValueless(node) {
	const value = unwrap(node);
	if (!value) return true;
	if (ts.isVoidExpression(value)) return true;
	if (value.kind === ts.SyntaxKind.NullKeyword) return true;
	if (ts.isIdentifier(value) && value.text === "undefined") return true;
	return false;
}

function isWaitForClickable(node) {
	if (!ts.isCallExpression(node)) return false;
	const callee = node.expression;
	if (ts.isIdentifier(callee)) return callee.text === "waitForClickable";
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text === "waitForClickable";
	return false;
}

/** 문(statement) 이 늘어선 자리. 조기 이탈 뒤에 무엇이 오는지 보려면 필요하다. */
function statementList(node) {
	const parent = node.parent;
	if (!parent) return null;
	if (ts.isBlock(parent) || ts.isSourceFile(parent)) return parent.statements;
	if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) return parent.statements;
	return null;
}

function findHits(file, source) {
	const tree = parse(file, source);
	const hits = [];
	const at = (node) => ({
		file,
		line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
	});

	const visit = (node) => {
		// 1) `if (el) el.click()` — 있으면 누르고 없으면 넘어간다
		if (ts.isIfStatement(node) && !node.elseStatement) {
			// 가지의 **첫 문**이 그 클릭일 때만 센다. 블록 안 어딘가를 다 세면
			// 판정 범위가 넓어져 지금까지 세지 않던 자리까지 한꺼번에 들어온다 —
			// 이 회차가 옮긴 것은 형태 열거이지 판정 범위가 아니다.
			const present = presenceOf(node.expression);
			const presentKey = present ? exprKey(present) : null;
			if (presentKey && isDirectClickStatement(node.thenStatement, presentKey))
				hits.push(at(node));

			// 2) `if (!el) return;` … 뒤에서 `el.click()` — 방향만 뒤집은 같은 무음
			const absent = absenceOf(node.expression);
			const absentKey = absent ? exprKey(absent) : null;
			if (absentKey && exitsWithoutValue(node.thenStatement)) {
				const list = statementList(node);
				if (list) {
					const index = list.indexOf(node);
					if (index >= 0) {
						for (let i = index + 1; i < list.length; i += 1) {
							if (clicksKey(list[i], absentKey)) {
								hits.push(at(node));
								break;
							}
						}
					}
				}
			}
		}

		// 3) 짧은회로 두 형태. 무엇이 같은가는 연산자가 아니라 **오른쪽이 언제
		//    도는가** 다.
		//      `el && el.click()`   — 왼쪽이 있음 검사이면 오른쪽은 있을 때만 돈다
		//      `!el || el.click()`  — 왼쪽이 없음 검사이면 오른쪽은 있을 때만 돈다
		//    둘은 드모르간으로 같은 문장이고, 없으면 왼쪽에서 끝나고 있으면
		//    누른다. `&&` 만 세고 `||` 를 빼 두면 부정 하나로 같은 무음이 셈에서
		//    사라진다(15회차 지적 5).
		if (ts.isBinaryExpression(node)) {
			const kind = shortCircuitOf(node.operatorToken.kind);
			const guard =
				kind === ts.SyntaxKind.AmpersandAmpersandToken
					? presenceOf(node.left)
					: kind === ts.SyntaxKind.BarBarToken
						? absenceOf(node.left)
						: null;
			const key = guard ? exprKey(guard) : null;
			const receiver = clickReceiver(node.right);
			if (key && receiver && exprKey(receiver) === key) hits.push(at(node));
		}

		// 3b) `el ? el.click() : undefined` — `el && el.click()` 과 같은 무음이다.
		//     조건이 있음 검사이고, 도는 갈래가 그 식을 누르고, 다른 갈래가
		//     아무 값도 남기지 않으면 셋은 같은 뜻이다. `&&` 만 세고 삼항을
		//     빼 두면, 물음표 하나로 같은 무음이 셈에서 사라진다(13회차 지적 6).
		//     방향을 뒤집은 `!el ? undefined : el.click()` 도 같다.
		if (ts.isConditionalExpression(node)) {
			const present = presenceOf(node.condition);
			const presentKey = present ? exprKey(present) : null;
			if (
				presentKey &&
				isValueless(node.whenFalse) &&
				clicksKey(node.whenTrue, presentKey)
			)
				hits.push(at(node));
			const absent = absenceOf(node.condition);
			const absentKey = absent ? exprKey(absent) : null;
			if (
				absentKey &&
				isValueless(node.whenTrue) &&
				clicksKey(node.whenFalse, absentKey)
			)
				hits.push(at(node));
		}

		// 4) `el?.click()`
		if (isOptionalClick(node)) hits.push(at(node));

		// 5) 리눅스 드라이버에서 반드시 시간을 다 쓰는 대기
		if (isWaitForClickable(node)) hits.push(at(node));

		node.forEachChild(visit);
	};
	visit(tree);
	return hits;
}

const files = [
	...tracked(`${SHELL}/e2e-tauri`, ".ts"),
	...tracked(`${SHELL}/e2e`, ".ts"),
];

const hits = [];
for (const file of files) {
	hits.push(...findHits(file, readFileSync(file, "utf8")));
}

console.log(
	`[silent-clicks] 요소가 없어도 조용히 넘어가는 클릭 ${hits.length} (baseline ${BASELINE})`,
);

if (hits.length > BASELINE) {
	// 어느 자리가 새것인지 순서로 가정하면 안 된다. 파일이 알파벳순으로
	// 읽히므로, 앞쪽 파일에 하나 더하면 뒤쪽의 멀쩡한 자리가 "새로 늘었다"
	// 로 지목된다 — 그러면 고치는 사람이 엉뚱한 파일을 판다.
	console.error(`\n늘었다(${hits.length} > ${BASELINE}). 지금 있는 자리를 파일별로 센다:`);
	const byFile = new Map();
	for (const hit of hits) byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
	for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
		console.error(`  ${String(count).padStart(3)} ${file}`);
	}
	console.error(
		"\n방금 만진 파일을 보라. 이 검사는 총수만 지키므로 어느 줄이 새것인지는 말하지 못한다.",
	);
	console.error(
		"\n눌렀는지 돌려주고 못 눌렀으면 그 자리에서 말하라 — 헬퍼의 clickElement 가 그렇게 한다.",
	);
	process.exit(1);
}

if (hits.length < BASELINE) {
	console.log(`  ✓ 줄었다(${hits.length}) — 이 파일의 BASELINE 도 함께 줄여라`);
} else {
	console.log("  ✓ 늘지 않았다");
}
