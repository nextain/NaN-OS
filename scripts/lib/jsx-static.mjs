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
 */

import ts from "typescript";

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

/** 괄호·단언·JSX 식 껍데기를 모두 벗긴다. 값이 없는 `{}` 는 null. */
export function unwrapAll(node) {
	let cur = node;
	for (;;) {
		if (!cur) return null;
		if (
			ts.isParenthesizedExpression(cur) ||
			ts.isAsExpression(cur) ||
			ts.isNonNullExpression(cur) ||
			(ts.isSatisfiesExpression?.(cur) ?? false) ||
			cur.kind === ts.SyntaxKind.TypeAssertionExpression
		) {
			cur = cur.expression;
			continue;
		}
		if (ts.isJsxExpression(cur)) {
			if (!cur.expression) return null;
			cur = cur.expression;
			continue;
		}
		return cur;
	}
}

/* ─────────────── 요소와 속성 ─────────────── */

export function isCreateElementCall(node) {
	if (!node || !ts.isCallExpression(node)) return false;
	const callee = node.expression;
	if (ts.isIdentifier(callee)) return callee.text === "createElement";
	if (ts.isPropertyAccessExpression(callee))
		return callee.name.text === "createElement";
	return false;
}

export function isElementNode(node) {
	return (
		!!node &&
		(ts.isJsxElement(node) ||
			ts.isJsxSelfClosingElement(node) ||
			isCreateElementCall(node))
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
	const props = [];
	let unknownSpread = false;

	// `home` 은 지금 읽고 있는 객체가 적혀 있는 파일이다. 파일을 건너갈 때마다
	// 함께 옮겨 간다.
	const fromObject = (expr, depth, home) => {
		const obj = unwrapAll(expr);
		if (!obj) {
			unknownSpread = true;
			return;
		}
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
					if (depth >= 4) unknownSpread = true;
					else fromObject(p.expression, depth + 1, home);
				} else {
					unknownSpread = true;
				}
			}
			return;
		}
		if (ts.isIdentifier(obj) && depth < 4) {
			const bound = constValue(obj.text, home, env);
			if (bound) {
				fromObject(bound.node, depth + 1, bound.sf);
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
				fromObject(a.expression, 0, sf);
			} else {
				unknownSpread = true;
			}
		}
		return { props, unknownSpread };
	}
	if (isCreateElementCall(node)) {
		if (node.arguments.length >= 2) fromObject(node.arguments[1], 0, sf);
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
export function elementChildren(node) {
	const meaningfulJsx = (c) => !ts.isJsxText(c) || c.getText().trim().length > 0;
	if (ts.isJsxElement(node) || ts.isJsxFragment(node))
		return node.children.filter(meaningfulJsx);
	if (isCreateElementCall(node))
		return node.arguments.slice(2).filter((a) => {
			const arg = unwrapAll(a);
			if (!arg) return false;
			if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
				return arg.text.trim().length > 0;
			return true;
		});
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
export function jsxElementsIn(node, sf) {
	const out = [];
	const visit = (n) => {
		if (!n) return;
		if (isElementNode(n)) out.push(n);
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

/** `import { X } from "./y"` 를 따라간다. */
function importedBinding(name, sf, env) {
	if (!env) return null;
	let found = null;
	const visit = (n) => {
		if (found) return;
		if (ts.isImportDeclaration(n) && n.importClause && ts.isStringLiteral(n.moduleSpecifier)) {
			const clause = n.importClause;
			const named = clause.namedBindings;
			let exported = null;
			if (clause.name && clause.name.text === name) exported = "default";
			if (named && ts.isNamedImports(named)) {
				for (const el of named.elements) {
					if (el.name.text !== name) continue;
					exported = el.propertyName ? el.propertyName.text : el.name.text;
				}
			}
			if (exported) {
				const path = env.resolve(sf.fileName, n.moduleSpecifier.text);
				const target = path ? env.sourceFile(path) : null;
				if (target) found = { name: exported, sf: target };
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return found;
}

/** `const NAME = <식>` 의 그 식. import 도 한 번 따라간다. */
export function constValue(name, sf, env, depth = 0) {
	if (depth > 3) return null;
	for (const hit of declarationSites(name, sf)) {
		if (hit.kind === "var" && hit.decl.initializer)
			return { node: hit.decl.initializer, sf };
	}
	const imported = importedBinding(name, sf, env);
	if (imported) return constValue(imported.name, imported.sf, env, depth + 1);
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
export function typeStrings(typeNode, sf, env, depth = 0) {
	const values = new Set();
	let complete = true;
	if (!typeNode || depth > 4) return { values, complete: false };
	if (ts.isParenthesizedTypeNode(typeNode))
		return typeStrings(typeNode.type, sf, env, depth + 1);
	if (ts.isUnionTypeNode(typeNode)) {
		for (const member of typeNode.types) {
			const r = typeStrings(member, sf, env, depth + 1);
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
		if (alias) return typeStrings(alias.type, sf, env, depth + 1);
		const imported = importedBinding(name, sf, env);
		if (imported) {
			let target = null;
			const seek = (n) => {
				if (target) return;
				if (ts.isTypeAliasDeclaration(n) && n.name.text === imported.name) target = n;
				ts.forEachChild(n, seek);
			};
			seek(imported.sf);
			if (target) return typeStrings(target.type, imported.sf, env, depth + 1);
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
 * 이 식이 **언제나** 참인가. 영구히 꺼 둔 조작의 정의다.
 *
 * `disabled={true}` 만 영구로 보면, 같은 뜻인 `disabled={off}`(위에서
 * `const off = true`)나 `disabled={true && true}` 는 열린 것으로 읽힌다.
 * React 에서 셋 다 누를 수 없는 버튼이다.
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
	if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
		return alwaysFalsy(n.operand, sf, env, seen);
	if (ts.isConditionalExpression(n))
		return (
			alwaysTruthy(n.whenTrue, sf, env, seen) &&
			alwaysTruthy(n.whenFalse, sf, env, seen)
		);
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
		// `a ?? b` 는 다르다. `false ?? true` 는 거짓이다.
		if (kind === ts.SyntaxKind.QuestionQuestionToken)
			return alwaysTruthy(n.left, sf, env, seen);
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
	return false;
}

function alwaysFalsy(node, sf, env, seen) {
	const n = unwrapAll(node);
	if (!n) return false;
	if (n.kind === ts.SyntaxKind.FalseKeyword) return true;
	if (n.kind === ts.SyntaxKind.NullKeyword) return true;
	if (ts.isIdentifier(n) && n.text === "undefined") return true;
	if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
		return n.text.length === 0;
	if (ts.isNumericLiteral(n)) return Number(n.text) === 0;
	if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
		return alwaysTruthy(n.operand, sf, env, new Set(seen));
	if (ts.isIdentifier(n)) {
		for (const hit of declarationSites(n.text, sf)) {
			if (hit.kind !== "var" || !hit.decl.initializer) continue;
			if (!isConstDeclaration(hit.decl)) continue;
			if (isReassigned(n.text, sf)) continue;
			if (alwaysFalsy(hit.decl.initializer, sf, env, seen)) return true;
		}
	}
	return false;
}
