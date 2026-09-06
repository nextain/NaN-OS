/**
 * 의존이 죽었을 때 화면이 다음에 무엇을 하라고 말하는지 본다.
 *
 * 왜 필요한가: 안정성 축은 문서에 세 질문으로 적혀 있었다 — 재시작 뒤 상태가
 * 남는가, 동시에 만졌을 때 깨지는가, **의존이 죽었을 때 무엇이 보이는가**.
 * 앞의 둘은 재는 자리가 있었지만 셋째는 검증 수단이 어디에도 지목돼 있지
 * 않았다. 넘으면 실패하는 수치가 없으면 그 축은 이름만 있는 것이다.
 *
 * 무엇을 재는가: 실패를 사용자에게 알리는 자리마다 **복구 행동이 함께 있는가**.
 * 오류를 띄우고 끝나면 사용자는 앱을 껐다 켜는 것 말고 할 수 있는 일이 없다.
 *
 * 어디를 보는가: **막다른 화면**만 본다. 즉 실패했을 때 그 알림이 화면을
 * 통째로 대신하는 자리다(`if (error) return <... role="alert">`). 알림 역할은
 * `alert` 와 `alertdialog` 둘이다 — WAI-ARIA 에서 뒤엣것은 앞엣것의 하위
 * 역할이고, 사용자의 응답을 요구한다는 것만 다르다. 응답을 요구하면서 빠져
 * 나갈 길을 안 주는 화면이 더 나쁘므로 같이 본다. 알림이
 * 다른 내용과 나란히 뜨는 경우는 대개 원래 화면의 버튼이 그대로 남아 있어
 * 사용자가 다시 시도할 수 있다 — 그런 자리까지 세면 과탐지가 되고, 과탐지가
 * 많은 게이트는 곧 꺼진다.
 *
 * 복구 행동으로 보는 것은 버튼·링크, 재시도/시작 계열 키, 그리고 실패해도
 * 사용자가 쓸 수 있는 대체 내용(원문 표시 같은 것)이다.
 *
 * 무엇을 재지 않는가: 그 행동이 실제로 복구시키는지는 정적으로 알 수 없다.
 * 이 게이트는 "빠져나갈 길을 보여주기라도 하는가" 까지만 말한다.
 *
 * ── 10회차에 고친 것 ──────────────────────────────────────────────
 * 아홉 번째까지 "화면을 통째로 대신하는가" 를 **돌려주는 것이 JSX 요소
 * 하나인가** 로 물었다. 그래서 React 에서 가장 흔한 네 가지 return 모양이
 * 알림으로도 세어지지 않았다 — `cond && <alert/>`, `cond ? <alert/> : null`,
 * `createElement("div", { role: "alert" })`, 그리고 자식이 `{cond && <alert/>}`
 * 인 컨테이너. 넷 다 화면에는 그 알림 하나만 뜬다.
 *
 * 이제 묻는 것은 모양이 아니라 **그 return 이 화면에 올리는 것이 이 알림
 * 하나뿐인가** 이다. `&&`·삼항·`createElement`·`{cond && …}` 자식을 뚫고
 * 내려가되, 어느 층에서든 형제가 둘 이상이면 거기서 멈춘다. 그래야 설정
 * 화면 한복판의 오류 줄(형제가 열 개인 자리)이 막다른 화면으로 오르지 않는다.
 *
 * 형제 규칙은 그대로다: 복구 행동은 **알림 요소의 하위 트리 안에서만** 센다.
 * 상위 컨테이너에 남아 있는 형제 버튼은 세지 않는다 — 알림이 화면을 통째로
 * 대신하는 자리에서는 그 형제가 애초에 없다.
 *
 * 속성은 `scripts/lib/jsx-static.mjs` 하나로 읽는다. spread(`{...{ role:
 * "alert" }}`)와 `createElement` 의 props 가 같은 목록으로 온다. 다만 함수
 * 인자나 import 된 객체를 펼친 spread 는 정적으로 알 수 없다 — 그런 요소는
 * 알림으로 세지 않는다(놓치는 쪽으로 틀린다). 값을 못 읽는 것을 알림으로
 * 세면 화면 전체가 알림이 되어 게이트가 곧 꺼진다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
	elementCallShape,
	elementChildren,
	elementOpening,
	elementProps,
	isElementNode,
	jsxElementsIn,
	makeEnv,
	parseSource,
	staticChunks,
	unwrapAll,
} from "./lib/jsx-static.mjs";

const SHELL = "packages/shell";

/**
 * 다음 행동을 주는 표시.
 *
 * `<pre>` 와 `<code>` 를 한때 인정했다 — 원문을 대신 보여 주는 화면이 있어서다.
 * 그런데 그러면 오류 문자열을 코드 블록으로 예쁘게 감싸기만 해도 "빠져나갈
 * 길이 있다" 로 세어진다. 읽을 것을 주는 것과 할 것을 주는 것은 다르다.
 * 대체 내용으로 인정하려면 사용자가 그것으로 무언가 할 수 있어야 한다
 * (복사, 편집, 이동).
 *
 * ── 11회차에 고친 것 ──────────────────────────────────────────────
 * 열 번째까지 이 판정은 알림 요소의 **원문 전체**에 정규식을 대는 것이었다.
 * 그래서 `Start` 를 부분문자열로 인정하던 시절에는 "Start-up failed" 라는
 * 문구가 복구 수단이었고, 그 한 단어를 지운 뒤에도 같은 자리가 남아 있었다 —
 * 자식 텍스트에 `install failed (missing onClick=)` 라고 적기만 하면 버튼 없는
 * 막다른 화면이 빠져나갈 길이 있는 것으로 세어졌다. 문구 하나를 막으면 다음
 * 회차에 다른 문구가 왔다.
 *
 * 이제 문구는 **어떤 경우에도 근거가 아니다.** 알림 요소의 하위 트리를 파서로
 * 걸어 실제 요소를 찾고, 그 요소가 조작인지만 묻는다 — 누를 것(`button`,
 * `onClick`, `role="button"`), 갈 곳(`a`, `Link` 류, `href`, `to`,
 * `role="link"`), 고쳐 쓸 곳(`textarea`), 복사할 것(`onCopy`). JSX 로 적었든
 * `createElement`/`jsx` 로 적었든 같은 목록으로 온다.
 */

/** 그 자체로 조작인 요소. 태그 이름의 마지막 마디로 본다. */
const ACTION_TAGS = /^(?:button|a|textarea)$/;
/** 이동을 뜻하는 컴포넌트. `Link`, `NavLink`, `AppLink` 처럼 쓴다. */
const LINK_COMPONENT = /^[A-Z]\w*Link$|^Link$/;
/** 그 요소를 조작으로 만드는 속성. */
const ACTION_PROPS = new Set(["onClick", "onPress", "onCopy", "href", "to"]);
/** 조작이라고 스스로 밝힌 역할. */
const ACTION_ROLES = new Set(["button", "link"]);

/** 이 요소의 태그 이름 후보. `createElement("button", …)` 도 같은 답을 준다. */
function tagNames(element, sf) {
	if (
		ts.isJsxElement(element) ||
		ts.isJsxSelfClosingElement(element) ||
		ts.isJsxOpeningElement(element)
	) {
		return [elementOpening(element).tagName.getText(sf)];
	}
	const shape = elementCallShape(element, env);
	// 인자 자리는 바인딩이 알려 준 만큼 민다. `createElement.call(null, "button",
	// …)` 의 태그는 0 번이 아니라 1 번이다.
	if (shape.factory && !shape.argsUnknown && element.arguments.length > shape.argShift) {
		const type = unwrapAll(element.arguments[shape.argShift]);
		if (!type) return [];
		if (ts.isIdentifier(type)) return [type.text];
		if (ts.isPropertyAccessExpression(type)) return [type.name.text];
		return staticChunks(type, sf, env);
	}
	return [];
}

/** 값이 대놓고 없는 속성은 조작이 아니다. `onClick={undefined}` 는 죽은 것이다. */
function hasLiveValue(prop) {
	if (prop.bare) return true;
	const value = unwrapAll(prop.value);
	if (!value) return false;
	if (value.kind === ts.SyntaxKind.NullKeyword) return false;
	if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (ts.isIdentifier(value) && value.text === "undefined") return false;
	return true;
}

/** 이 요소 하나가 조작인가. */
function isActionElement(element, sf) {
	for (const tag of tagNames(element, sf)) {
		const last = tag.split(".").pop() ?? tag;
		if (ACTION_TAGS.test(last)) return true;
		if (LINK_COMPONENT.test(last)) return true;
	}
	const { props } = elementProps(element, sf, env);
	for (const prop of props) {
		if (ACTION_PROPS.has(prop.name) && hasLiveValue(prop)) return true;
		if (prop.name === "role") {
			for (const role of staticChunks(prop.value, prop.sf ?? sf, env))
				if (ACTION_ROLES.has(role)) return true;
		}
	}
	return false;
}

/**
 * 이 알림의 하위 트리 어딘가에 복구 조작이 있는가.
 *
 * 텍스트 노드는 보지 않는다 — 자식 글자에 속성 이름을 적어 두는 것으로
 * 빠져나가던 자리가 여기다.
 */
function hasRecovery(element, sf) {
	return jsxElementsIn(element, sf, env).some((node) => isActionElement(node, sf));
}

/**
 * 실패를 알리지만 복구 행동을 확인하지 못한 자리. 숫자가 아니라 자리로
 * 적는다 — 무엇이 면제됐는지 드러나야 한다.
 */
const ACKNOWLEDGED = new Map();

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

const files = [...tracked(`${SHELL}/src`, ".tsx")].filter(
	(f) => !/\.test\.tsx$/.test(f) && !f.includes("__tests__"),
);

/** 이름을 파일 너머로 따라갈 때 쓰는 환경. `const role = ALERT` 같은 자리다. */
const env = makeEnv(
	new Map(
		[...tracked(`${SHELL}/src`, ".tsx"), ...tracked(`${SHELL}/src`, ".ts")]
			.filter((f) => !/\.test\.|__tests__/.test(f))
			.map((f) => [f, readFileSync(f, "utf8")]),
	),
);

/**
 * 이 식이 화면에 통째로 올리는 요소 후보.
 *
 * `&&` 의 오른쪽, 삼항의 두 갈래, `||`·`??` 의 양쪽은 각각 그 자리에 홀로
 * 오르는 화면이다. 값이 없는 갈래(`null`)는 화면을 만들지 않으므로 세지
 * 않는다 — 그래서 `cond ? <alert/> : null` 은 후보가 하나다.
 */
function screenElements(expr, sf) {
	const node = unwrapAll(expr);
	if (!node) return [];
	if (isElementNode(node, env)) return [node];
	if (ts.isJsxFragment(node)) {
		const kids = elementChildren(node, env);
		return kids.length === 1 ? screenElements(kids[0], sf) : [];
	}
	if (ts.isConditionalExpression(node))
		return [
			...screenElements(node.whenTrue, sf),
			...screenElements(node.whenFalse, sf),
		];
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		if (kind === ts.SyntaxKind.AmpersandAmpersandToken)
			return screenElements(node.right, sf);
		if (
			kind === ts.SyntaxKind.BarBarToken ||
			kind === ts.SyntaxKind.QuestionQuestionToken
		)
			return [
				...screenElements(node.left, sf),
				...screenElements(node.right, sf),
			];
	}
	return [];
}

/**
 * 실패를 알리는 역할.
 *
 * WAI-ARIA 에서 `alertdialog` 는 `alert` 의 **하위 역할**이다 — 같은 알림인데
 * 사용자의 응답을 요구한다는 것만 다르다. 그러니 막다른 화면 판정에서 둘을
 * 가르면, 역할 글자 하나로 같은 화면이 셈에서 빠진다(15회차, 번호 없는 지적).
 * 응답을 요구하는 알림이 빠져나갈 길을 안 주면 더 나쁘다.
 */
const ALERT_ROLES = new Set(["alert", "alertdialog"]);

/** 이 요소가 실패 알림인가. `role` 이 될 수 있는 값 중에 알림 역할이 있는가. */
function isAlert(element, sf) {
	const { props } = elementProps(element, sf, env);
	// 값은 그 값이 적혀 있는 파일의 트리로 푼다. spread 가 다른 파일의 상수를
	// 펼친 것이면, 불러온 쪽 트리로 풀 때 그 이름이 없어 알림이 사라진다.
	return props.some(
		(p) =>
			p.name === "role" &&
			staticChunks(p.value, p.sf ?? sf, env).some((role) => ALERT_ROLES.has(role)),
	);
}

/**
 * 알림 화면을 파서로 찾는다.
 *
 * 정규식으로 `role="alert"` 를 찾는 동안 지적이 매번 같은 모양이었다 —
 * `role={"alert"}`, `role={role}`, `role = "alert"`, 그리고 600자 창을
 * 넘기는 것. 형태를 세는 한 하나가 더 온다.
 *
 * 파서에게 물으면 세 가지가 한꺼번에 정해진다. 이 속성의 값이 "alert" 인가,
 * 이 요소가 **return 이 화면에 올리는 전부**인가, 그 안에 행동이 있는가.
 */
function alertReturns(file, text) {
	const tree = parseSource(file, text);
	const out = [];
	const visit = (node) => {
		if (ts.isReturnStatement(node) && node.expression) {
			const seen = new Set();
			const stack = screenElements(node.expression, tree);
			while (stack.length) {
				const element = stack.pop();
				if (seen.has(element)) continue;
				seen.add(element);
				if (isAlert(element, tree)) {
					out.push({
						element,
						tree,
						// 자리는 알림 요소의 줄로 적는다. return 줄로 적으면 껍데기를
						// 하나 씌우는 것만으로 면제 키가 어긋난다.
						line: text
							.slice(0, elementOpening(element).getStart(tree))
							.split("\n").length,
					});
					continue;
				}
				// 형제가 있으면 알림은 화면의 일부이지 전부가 아니다. 한 자식만
				// 있는 동안 계속 내려가서 알림에 닿으면 그것이 화면을 통째로
				// 대신한 것이다.
				const kids = elementChildren(element, env);
				if (kids.length !== 1) continue;
				stack.push(...screenElements(kids[0], tree));
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return out;
}

const stranded = [];
let surfaces = 0;

for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const block of alertReturns(file, source)) {
		surfaces += 1;
		if (hasRecovery(block.element, block.tree)) continue;
		stranded.push({ file, line: block.line });
	}
}

console.log(
	`[recovery] 실패가 화면을 통째로 대신하는 자리 ${surfaces}곳 / 다음 행동이 없는 곳 ${stranded.length}`,
);

const unexpected = stranded.filter(
	(hit) => !ACKNOWLEDGED.has(`${hit.file}:${hit.line}`),
);
// 걸리지 않게 된 면제는 알리바이다. 남겨 두면 다음 결함이 그 자리로 들어와도
// 조용히 지나간다.
const staleAllowances = [...ACKNOWLEDGED.keys()].filter(
	(key) => !stranded.some((hit) => `${hit.file}:${hit.line}` === key),
);
if (staleAllowances.length > 0) {
	console.error("\n걸리지 않는 면제가 남아 있다:");
	for (const key of staleAllowances) console.error(`  ${key}`);
	console.error("\nACKNOWLEDGED 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (unexpected.length > 0) {
	console.error("\n실패를 알리면서 다음에 할 일을 주지 않는 자리:");
	for (const hit of unexpected) console.error(`  ${hit.file}:${hit.line}`);
	console.error(
		"\n재시도 버튼이나 설정으로 가는 길처럼, 사용자가 스스로 빠져나갈 수단을 함께 두어라.",
	);
	console.error(
		"정말 할 수 있는 일이 없는 자리라면 ACKNOWLEDGED 에 이유와 함께 적어라.",
	);
	process.exit(1);
}

console.log("  ✓ 모든 실패 알림에 다음 행동이 있다");
