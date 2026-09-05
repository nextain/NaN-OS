/**
 * 호출부가 **어떤 것을 부르는지**를 이름이 아니라 바인딩으로 읽는 공용 모듈.
 *
 * 왜 따로 두는가: 열한 번의 교차 리뷰에서 같은 사고가 게이트마다 따로 났다.
 * 알림 판정은 `createElement` 라는 **글자**만 요소로 읽어 `import { createElement
 * as h }` 를 놓쳤고, 파괴 판정은 `invoke` 라는 바인딩까지는 따라갔지만
 * `invoke.bind(null)` 로 만든 별명을 호출부로 세지 않았다. 둘은 같은 결함이다 —
 * 판정의 단위가 **부르는 값**이 아니라 **적힌 이름**이었다.
 *
 * 그래서 여기서 정하는 것은 하나뿐이다: 이 호출식의 callee 는 어느 모듈의 어느
 * export 를 가리키는가. 이름은 그 답의 일부가 아니다. 호출자는 답을 받아
 * "그 모듈의 그 이름인가" 를 자기 기준으로 물으면 된다.
 *
 * 무엇을 따라가는가:
 *   - 직접 식별자 (`invoke(...)`, `createElement(...)`)
 *   - default·namespace import 의 멤버 (`React.createElement(...)`, `api.invoke(...)`)
 *   - 같은 파일 const 별명 (`const h = createElement; h(...)`)
 *   - 구조분해 별명 (`const { createElement } = React;`)
 *   - `.bind` 로 만든 별명 (`const call = invoke.bind(null); call(...)`)
 *   - 호출부에서 곧바로 `.call`/`.apply` (`invoke.call(null, "cmd")`)
 *   - 상대 경로 import 로 건너간 파일의 const 별명 (`env` 를 넘겼을 때)
 *
 * 무엇을 모른다고 말하는가: 못 푸는 자리는 `null` 이다. 그리고 인자 자리가
 * 어긋나는 경우(`.apply`, 인자를 미리 먹인 `.bind`)는 `argsUnknown` 으로
 * 알린다. 호출자가 "모른다" 를 "그 인자가 없다" 로 읽으면, 인자를 한 겹
 * 숨기는 것만으로 검사를 통과하는 자리가 생긴다.
 *
 * 무엇을 보증하지 않는가: 같은 이름이 다시 대입되는 `let`/`var` 별명은 따라가지
 * 않는다(재대입이 있는 이름은 아예 풀지 않는다). 동적 `require`/`await import`
 * 로 받은 값, 배열·객체를 거쳐 흘러간 함수, 고차 함수가 돌려준 함수도 모른다.
 */

import ts from "typescript";

const MAX_DEPTH = 6;

/** 괄호·단언 껍데기를 벗긴다. */
function unwrap(node) {
	let cur = node;
	for (let i = 0; i < 8 && cur; i += 1) {
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
		break;
	}
	return cur ?? null;
}

/**
 * 이 파일의 import 선언이 만드는 지역 이름 전부.
 *
 * `localName → { module, imported, kind }`. `imported` 는 그 모듈에서 가져온
 * export 이름이고, default 는 `"default"`, namespace 는 `"*"` 다. 별명
 * (`{ createElement as h }`)은 지역 이름이 `h`, `imported` 가 `createElement` 다 —
 * 판정은 언제나 `imported` 쪽으로 한다.
 */
export function importBindings(sf) {
	const out = new Map();
	if (!sf || !sf.statements) return out;
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!stmt.importClause || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const module = stmt.moduleSpecifier.text;
		const clause = stmt.importClause;
		if (clause.name)
			out.set(clause.name.text, { module, imported: "default", kind: "default" });
		const named = clause.namedBindings;
		if (named && ts.isNamespaceImport(named))
			out.set(named.name.text, { module, imported: "*", kind: "namespace" });
		if (named && ts.isNamedImports(named)) {
			for (const el of named.elements) {
				out.set(el.name.text, {
					module,
					imported: el.propertyName ? el.propertyName.text : el.name.text,
					kind: "named",
				});
			}
		}
	}
	return out;
}

/** 이 이름이 파일 어딘가에서 다시 대입되는가. 그렇다면 값을 따라가지 않는다. */
function isReassigned(name, sf) {
	let hit = false;
	const visit = (n) => {
		if (hit) return;
		if (
			ts.isBinaryExpression(n) &&
			(n.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
				n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
				n.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken ||
				n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken) &&
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
 * 같은 파일에서 이 이름을 묶는 `const` 선언.
 *
 * `const h = createElement` 는 `{ kind: "value", node }`,
 * `const { createElement } = React` 는 `{ kind: "property", node: React, property }` 다.
 * 재대입이 있는 이름과 `const` 가 아닌 선언은 따라가지 않는다.
 */
function constAlias(name, sf) {
	let found = null;
	const visit = (n) => {
		if (found) return;
		if (ts.isVariableDeclaration(n) && n.initializer && isConstDeclaration(n)) {
			if (ts.isIdentifier(n.name) && n.name.text === name) {
				found = { kind: "value", node: n.initializer };
			} else if (ts.isObjectBindingPattern(n.name)) {
				for (const el of n.name.elements) {
					if (!ts.isIdentifier(el.name) || el.name.text !== name) continue;
					const property =
						el.propertyName && ts.isIdentifier(el.propertyName)
							? el.propertyName.text
							: el.name.text;
					found = { kind: "property", node: n.initializer, property };
				}
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	if (found && isReassigned(name, sf)) return null;
	return found;
}

/** 상대 경로 import 를 건너가 그 파일의 별명까지 이어 푼다. */
function crossFile(hit, sf, env, depth) {
	if (!env || typeof env.resolve !== "function" || typeof env.sourceFile !== "function")
		return null;
	if (hit.imported === "*" || hit.imported === "default") return null;
	const path = env.resolve(sf.fileName, hit.module);
	if (!path) return null;
	const target = env.sourceFile(path);
	if (!target || target === sf) return null;
	const alias = constAlias(hit.imported, target);
	if (alias) return resolveIn(alias, target, env, depth + 1);
	const again = importBindings(target).get(hit.imported);
	if (again)
		return {
			module: again.module,
			imported: again.imported,
			local: hit.imported,
			via: "import",
			boundArgs: 0,
		};
	return null;
}

function resolveIn(alias, sf, env, depth) {
	if (alias.kind === "value") return resolveBinding(alias.node, sf, env, depth);
	// `const { createElement } = React` — 오른쪽이 default/namespace 일 때만 뜻이 정해진다.
	const base = resolveBinding(alias.node, sf, env, depth);
	if (base && (base.imported === "*" || base.imported === "default"))
		return {
			module: base.module,
			imported: alias.property,
			local: null,
			via: "destructure",
			boundArgs: 0,
		};
	return null;
}

/**
 * 이 **식**이 함수로서 가리키는 import 바인딩.
 *
 * 호출식이 아니라 값이다 — `f`, `React.createElement`, `f.bind(null)` 처럼
 * "부르면 그 함수가 도는" 식을 받는다. 부른 **결과**(`f()`)는 값이 무엇인지
 * 정적으로 모르므로 `null` 이다.
 */
export function resolveBinding(expr, sf, env, depth = 0) {
	if (depth > MAX_DEPTH || !sf) return null;
	const node = unwrap(expr);
	if (!node) return null;

	if (ts.isIdentifier(node)) {
		const hit = importBindings(sf).get(node.text);
		if (hit) {
			const crossed = crossFile(hit, sf, env, depth);
			if (crossed) return crossed;
			return {
				module: hit.module,
				imported: hit.imported,
				local: node.text,
				via: "import",
				boundArgs: 0,
			};
		}
		const alias = constAlias(node.text, sf);
		if (alias) {
			const resolved = resolveIn(alias, sf, env, depth + 1);
			if (resolved) return { ...resolved, local: node.text, via: resolved.via === "destructure" ? "destructure" : "alias" };
		}
		return null;
	}

	if (ts.isPropertyAccessExpression(node)) {
		const base = resolveBinding(node.expression, sf, env, depth + 1);
		// default·namespace 만 멤버를 그 모듈의 export 로 읽는다. 이름으로 가져온
		// 객체의 속성(`import { core } from "x"; core.invoke`)은 `x` 의 export 가
		// 아니므로 모른다고 말한다.
		if (base && (base.imported === "*" || base.imported === "default"))
			return {
				module: base.module,
				imported: node.name.text,
				local: null,
				via: "member",
				boundArgs: 0,
			};
		return null;
	}

	if (ts.isCallExpression(node)) {
		const callee = unwrap(node.expression);
		if (callee && ts.isPropertyAccessExpression(callee) && callee.name.text === "bind") {
			const base = resolveBinding(callee.expression, sf, env, depth + 1);
			if (base && base.imported !== "*" && base.imported !== "default")
				return {
					...base,
					via: "bind",
					// `bind` 의 첫 인자는 this 다. 그 뒤에 미리 먹인 인자가 있으면
					// 호출부의 인자 번호가 밀린다.
					boundArgs: base.boundArgs + Math.max(0, node.arguments.length - 1),
				};
		}
		return null;
	}

	return null;
}

/**
 * 이 **호출식**이 부르는 import 바인딩.
 *
 * 돌려주는 것: `{ module, imported, local, via, boundArgs, argShift, argsUnknown }`.
 *   - `module`/`imported` 로 판정한다. 이름(`local`)은 근거가 아니다.
 *   - `argShift` 는 호출부 인자 중 대상 함수의 것이 아닌 앞자리 수다
 *     (`f.call(this, a)` 면 1).
 *   - `argsUnknown` 이 참이면 인자 자리를 신뢰하면 안 된다(`f.apply`, 인자를
 *     미리 먹인 `.bind`). 인자를 보고 판정하는 호출자는 이 경우를 "그 인자가
 *     없다" 로 읽지 말고 모른다로 다뤄야 한다.
 */
export function resolveCallee(node, sf, env) {
	if (!node || !ts.isCallExpression(node)) return null;
	const source = sf ?? (typeof node.getSourceFile === "function" ? node.getSourceFile() : null);
	if (!source) return null;
	const callee = unwrap(node.expression);
	if (!callee) return null;

	// `f.call(this, …)` · `f.apply(this, [...])` 는 f 를 부르는 것이다.
	if (ts.isPropertyAccessExpression(callee) && /^(?:call|apply)$/.test(callee.name.text)) {
		const base = resolveBinding(callee.expression, source, env, 0);
		if (base && base.imported !== "*" && base.imported !== "default") {
			const viaApply = callee.name.text === "apply";
			return {
				...base,
				via: callee.name.text,
				argShift: viaApply ? 0 : 1,
				argsUnknown: viaApply || base.boundArgs > 0,
			};
		}
	}

	const direct = resolveBinding(callee, source, env, 0);
	if (!direct) return null;
	return { ...direct, argShift: 0, argsUnknown: direct.boundArgs > 0 };
}

/** `{ module, imported }` 가 이 목록 안인가. 호출자가 판정을 한 줄로 적을 때 쓴다. */
export function bindingIsOneOf(binding, modules, names) {
	if (!binding) return false;
	return modules.has(binding.module) && names.has(binding.imported);
}
