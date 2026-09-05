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
 * 이제 TypeScript 파서로 뜻을 읽는다.
 *
 *   - 조건이 **어떤 이름의 있음/없음** 인가 (`el`, `!el`, `el == null`,
 *     `el !== undefined` …).
 *   - 없음일 때 그 가지가 **값 없이 빠져나가는가** (`return`, `return undefined`,
 *     `return void …`, `continue`). 값을 돌려주는 `return false` 는 다르다 —
 *     못 눌렀다는 사실을 부르는 쪽에 넘기는 것이고, 이 게이트가 권하는 형태다.
 *   - 그 뒤 같은 블록에서 **그 이름을** 누르는가.
 *
 * `void 0`·`void expr`·`undefined` 는 파서에게 모두 "값 없이 나간다" 로 보이므로,
 * 셋을 따로 적어 둘 자리가 없다.
 *
 * 무엇을 재지 않는가: 이름이 아니라 값이 흘러 들어온 경우(`const el = pick();`
 * 의 `pick` 안쪽)는 보지 않는다. 이 게이트는 한 함수 안에서 사람이 읽어 알 수
 * 있는 자리까지만 말한다.
 *
 * 지금 있는 것은 baseline 으로 잠그고 늘어나는 것만 막는다. 한 번에 고치면
 * 그 커밋을 아무도 검토할 수 없다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

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

/** `await x` · `(x)` · `x as T` 를 벗겨 알맹이를 돌려준다. */
function unwrap(node) {
	let current = node;
	for (let i = 0; i < 8 && current; i += 1) {
		if (ts.isParenthesizedExpression(current)) current = current.expression;
		else if (ts.isAwaitExpression(current)) current = current.expression;
		else if (ts.isAsExpression(current) || ts.isNonNullExpression(current))
			current = current.expression;
		else break;
	}
	return current;
}

/** 조건이 "이 이름이 **있으면**" 인가. 그렇다면 그 이름. */
function presenceOf(condition) {
	const node = unwrap(condition);
	if (ts.isIdentifier(node)) return node.text;
	// `!!el`
	if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === ts.SyntaxKind.ExclamationToken
	) {
		const inner = unwrap(node.operand);
		if (
			ts.isPrefixUnaryExpression(inner) &&
			inner.operator === ts.SyntaxKind.ExclamationToken &&
			ts.isIdentifier(unwrap(inner.operand))
		)
			return unwrap(inner.operand).text;
		return null;
	}
	// `el !== null` · `el != undefined`
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		const notEqual =
			kind === ts.SyntaxKind.ExclamationEqualsToken ||
			kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
		if (!notEqual) return null;
		return nullComparisonName(node);
	}
	return null;
}

/** 조건이 "이 이름이 **없으면**" 인가. 그렇다면 그 이름. */
function absenceOf(condition) {
	const node = unwrap(condition);
	// `!el`
	if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === ts.SyntaxKind.ExclamationToken
	) {
		const inner = unwrap(node.operand);
		return ts.isIdentifier(inner) ? inner.text : null;
	}
	// `el == null` · `el === undefined`
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		const equal =
			kind === ts.SyntaxKind.EqualsEqualsToken ||
			kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
		if (!equal) return null;
		return nullComparisonName(node);
	}
	return null;
}

/** `el` 과 `null`/`undefined` 를 비교하는 식이면 그 이름. 어느 쪽에 있든 같다. */
function nullComparisonName(node) {
	const left = unwrap(node.left);
	const right = unwrap(node.right);
	const isNullish = (n) =>
		n.kind === ts.SyntaxKind.NullKeyword ||
		(ts.isIdentifier(n) && n.text === "undefined");
	if (ts.isIdentifier(left) && isNullish(right)) return left.text;
	if (ts.isIdentifier(right) && isNullish(left)) return left.text && null;
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

/** 이 문(statement) 이 곧바로 `name.click(...)` 인가. */
function isDirectClickStatement(statement, name) {
	if (!statement) return false;
	if (ts.isBlock(statement))
		return isDirectClickStatement(statement.statements[0], name);
	if (!ts.isExpressionStatement(statement)) return false;
	return isClickCall(unwrap(statement.expression), name);
}

/** `name.click(...)` 호출 그 자체인가. */
function isClickCall(node, name) {
	if (!node || !ts.isCallExpression(node)) return false;
	const callee = node.expression;
	return (
		ts.isPropertyAccessExpression(callee) &&
		callee.name.text === "click" &&
		ts.isIdentifier(unwrap(callee.expression)) &&
		unwrap(callee.expression).text === name
	);
}

/** 이 노드 아래 어딘가에서 `name.click(...)` 을 부르는가. */
function clicksName(node, name) {
	let found = false;
	const visit = (current) => {
		if (found || !current) return;
		if (ts.isCallExpression(current)) {
			const callee = current.expression;
			if (
				ts.isPropertyAccessExpression(callee) &&
				callee.name.text === "click" &&
				ts.isIdentifier(unwrap(callee.expression)) &&
				unwrap(callee.expression).text === name
			) {
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
	if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "click") return false;
	return !!callee.questionDotToken || !!node.questionDotToken;
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
			if (present && isDirectClickStatement(node.thenStatement, present))
				hits.push(at(node));

			// 2) `if (!el) return;` … 뒤에서 `el.click()` — 방향만 뒤집은 같은 무음
			const absent = absenceOf(node.expression);
			if (absent && exitsWithoutValue(node.thenStatement)) {
				const list = statementList(node);
				if (list) {
					const index = list.indexOf(node);
					if (index >= 0) {
						for (let i = index + 1; i < list.length; i += 1) {
							if (clicksName(list[i], absent)) {
								hits.push(at(node));
								break;
							}
						}
					}
				}
			}
		}

		// 3) `el && el.click()`
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
		) {
			const left = unwrap(node.left);
			if (ts.isIdentifier(left) && isClickCall(unwrap(node.right), left.text))
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
