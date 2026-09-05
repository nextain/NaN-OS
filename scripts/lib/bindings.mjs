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
 *     — 리터럴 키로 적은 같은 멤버(`React["createElement"]`)도 같다
 *   - 같은 파일 const 별명 (`const h = createElement; h(...)`)
 *   - 구조분해 별명 (`const { createElement } = React;`)
 *   - `.bind` 로 만든 별명 (`const call = invoke.bind(null); call(...)`)
 *   - 호출부에서 곧바로 `.call`/`.apply` (`invoke.call(null, "cmd")`)
 *   - 껍데기로 싼 callee: 괄호, `as`/`satisfies`, `!`, 그리고 쉼표식의 마지막 항
 *     (`(0, invoke)("cmd")` 는 `invoke("cmd")` 다)
 *   - 상대 경로 import 로 건너간 파일의 const 별명·재수출 (`env` 를 넘겼을 때).
 *     재수출은 `export const y = x`, `export { x as y }`,
 *     `export { x as y } from "mod"`, `export * from "mod"` 를 모두 따라간다.
 *   - **전역 바인딩**: 이 파일 어디에도 선언이 없는 자유 식별자(`fetch`)와
 *     전역 뿌리의 멤버(`globalThis.fetch`, `window.fetch`, `self["fetch"]`),
 *     그리고 그것으로 만든 const 별명·구조분해(`const get = fetch`,
 *     `const { fetch: f } = globalThis`). 이때는 `module`/`imported` 가 아니라
 *     `{ global: "fetch" }` 로 답한다 — 전역은 어느 모듈에서 온 것이 아니다.
 *
 * 무엇을 모른다고 말하는가: 못 푸는 자리는 `null` 이다. 그리고 인자 자리가
 * 어긋나는 경우(`.apply`, 인자를 미리 먹인 `.bind`)는 `argsUnknown` 으로
 * 알린다. 호출자가 "모른다" 를 "그 인자가 없다" 로 읽으면, 인자를 한 겹
 * 숨기는 것만으로 검사를 통과하는 자리가 생긴다.
 *
 * ## 이 모듈이 따라가지 않는 것 (보증 밖)
 *
 * 아래는 **일부러** 보지 않는다. 정적으로 답을 정할 수 없거나, 답을 정하려면
 * 프로그램을 실행해야 하는 자리다. 여기 적힌 것은 게이트의 구멍이 아니라
 * 게이트의 **경계**이며, 그 바깥은 코드 리뷰의 몫이다.
 *
 *   - 동적 속성 이름 — `obj[name]`, `obj[key()]` 처럼 키가 리터럴이 아닌 접근.
 *     리터럴 키(`obj["fetch"]`)는 경계 **안**이다.
 *   - `eval`, `new Function`, `Reflect.apply`, `Function.prototype.call/apply/bind`
 *     를 **두 겹 이상** 거친 호출(`f.call.call(...)`, `Reflect.apply(f, …)`).
 *     한 겹의 `f.call(…)`/`f.apply(…)`/`f.bind(…)` 는 경계 안이다.
 *   - 고차 함수가 돌려준 함수 — `const f = make(); f()` 의 `make` 안쪽.
 *   - 배열·객체·`Map` 을 거쳐 흘러간 함수 — `handlers[0]()`, `table.get(k)()`.
 *   - 동적 `import()`/`require()` 의 결과 — `const { invoke } = await
 *     import("…")`. 정적 `import` 선언만 따라간다.
 *   - 실행할 때 조립되는 문자열로 정해지는 것.
 *   - 같은 이름이 다시 대입되는 `let`/`var` 별명(재대입이 있는 이름은 아예
 *     풀지 않는다).
 *
 * 이 경계 **안쪽** 형태는 새 모양이 와도 같은 규칙으로 잡힌다 — 껍데기는
 * `unwrap` 하나가 벗기고, 이름은 언제나 바인딩으로 되돌려 읽는다. 형태를
 * 하나씩 열거하지 않는 것이 이 모듈의 설계다.
 */

import ts from "typescript";

const MAX_DEPTH = 6;

/** 전역이 담겨 있는 뿌리 이름. 이 멤버는 그 이름의 전역과 같다. */
const GLOBAL_ROOTS = new Set(["globalThis", "window", "self", "global"]);

/**
 * 껍데기를 벗겨 알맹이 식을 돌려준다.
 *
 * 괄호·`as`/`satisfies`·`!`·타입 단언, 그리고 **쉼표식의 마지막 항**이다.
 * `(0, invoke)("cmd")` 는 가져온 함수를 `this` 없이 부르는 JavaScript 의 흔한
 * 호출이고, 값은 그대로 `invoke` 다. 여기서 벗기지 않으면 두 게이트가 같은
 * 자리에서 따로 뚫린다 — 그래서 껍데기를 벗기는 자리는 이 함수 하나다.
 */
export function unwrap(node) {
	let cur = node;
	for (let i = 0; i < 16 && cur; i += 1) {
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
		// `(a, b, c)` — 값은 마지막 항이다. 파서는 이것을 왼쪽으로 접힌
		// 쉼표 이항식으로도, `CommaListExpression` 으로도 준다.
		if (ts.isCommaListExpression?.(cur)) {
			cur = cur.elements[cur.elements.length - 1];
			continue;
		}
		if (
			ts.isBinaryExpression(cur) &&
			cur.operatorToken.kind === ts.SyntaxKind.CommaToken
		) {
			cur = cur.right;
			continue;
		}
		break;
	}
	return cur ?? null;
}

/** 리터럴 키로 적은 멤버 접근의 이름. 동적 키는 `null` — 보증 밖이다. */
function memberName(node) {
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	if (ts.isElementAccessExpression(node)) {
		const key = unwrap(node.argumentExpression);
		if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)))
			return key.text;
	}
	return null;
}

/** 멤버 접근(속성이든 리터럴 키든)의 왼쪽 식. */
function memberBase(node) {
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
		return node.expression;
	return null;
}

/**
 * 이 파일의 import 선언이 만드는 지역 이름 전부.
 *
 * `localName → { module, imported, kind }`. `imported` 는 그 모듈에서 가져온
 * export 이름이고, default 는 `"default"`, namespace 는 `"*"` 다. 별명
 * (`{ createElement as h }`)은 지역 이름이 `h`, `imported` 가 `createElement` 다 —
 * 판정은 언제나 `imported` 쪽으로 한다.
 */
const IMPORTS = new WeakMap();

export function importBindings(sf) {
	if (sf && IMPORTS.has(sf)) return IMPORTS.get(sf);
	const out = new Map();
	if (!sf || !sf.statements) return out;
	IMPORTS.set(sf, out);
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

/**
 * 이 파일이 **다시 내보내는** 이름들.
 *
 * `export { createElement as ghostCreate } from "react"` 는 그 파일에 `const`
 * 선언도 `import` 선언도 없다. 그래서 별명과 import 만 따라가면 파일 하나를
 * 건너간 것만으로 원래 모듈을 잃는다 — 화면 요소가 요소가 아니게 되고,
 * 게이트는 그 화면을 아예 세지 않는다(12회차 지적 3).
 *
 * `exportedName → { module, imported }` 를 준다. `module` 이 `null` 이면 같은
 * 파일 안의 이름을 다시 내보낸 것(`export { h as ghostCreate }`)이다.
 * `export * from "mod"` 는 이름을 바꾸지 않으므로 따로 `stars` 로 준다.
 */
export function reexportBindings(sf) {
	const named = new Map();
	const stars = [];
	if (!sf || !sf.statements) return { named, stars };
	for (const stmt of sf.statements) {
		if (!ts.isExportDeclaration(stmt)) continue;
		const module =
			stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
				? stmt.moduleSpecifier.text
				: null;
		if (!stmt.exportClause) {
			// `export * from "mod"` — 이름은 그대로 지나간다.
			if (module) stars.push(module);
			continue;
		}
		if (ts.isNamespaceExport(stmt.exportClause)) continue;
		for (const el of stmt.exportClause.elements) {
			named.set(el.name.text, {
				module,
				imported: el.propertyName ? el.propertyName.text : el.name.text,
			});
		}
	}
	return { named, stars };
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
 * 이 파일 어딘가에 그 이름의 **선언**이 있는가.
 *
 * 전역 바인딩의 정의가 이것이다 — 선언이 없는 자유 식별자만 전역이다.
 * 파일 안에서 만든 이름(`function fetch() {}`, 매개변수 `fetch`)을 전역으로
 * 읽으면, 이름이 같다는 이유로 남의 함수가 바깥 통신으로 세어진다.
 */
const DECLARED = new WeakMap();

function declaredNames(sf) {
	const cached = DECLARED.get(sf);
	if (cached) return cached;
	const names = new Set();
	const add = (bindingName) => {
		if (!bindingName) return;
		if (ts.isIdentifier(bindingName)) names.add(bindingName.text);
		else if (
			ts.isObjectBindingPattern(bindingName) ||
			ts.isArrayBindingPattern(bindingName)
		)
			for (const el of bindingName.elements)
				if (ts.isBindingElement(el)) add(el.name);
	};
	const visit = (n) => {
		if (!n) return;
		if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n))
			add(n.name);
		else if (
			(ts.isFunctionDeclaration(n) ||
				ts.isClassDeclaration(n) ||
				ts.isImportSpecifier(n) ||
				ts.isImportClause(n) ||
				ts.isNamespaceImport(n) ||
				ts.isFunctionExpression(n)) &&
			n.name &&
			ts.isIdentifier(n.name)
		)
			names.add(n.name.text);
		ts.forEachChild(n, visit);
	};
	visit(sf);
	DECLARED.set(sf, names);
	return names;
}

function isDeclaredLocally(name, sf) {
	return declaredNames(sf).has(name);
}

function globalBinding(name) {
	return {
		module: null,
		imported: null,
		global: name,
		local: name,
		via: "global",
		boundArgs: 0,
	};
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

/** 상대 경로 import 를 건너가 그 파일의 별명·재수출까지 이어 푼다. */
function crossFile(hit, sf, env, depth) {
	if (depth > MAX_DEPTH) return null;
	if (!env || typeof env.resolve !== "function" || typeof env.sourceFile !== "function")
		return null;
	if (hit.imported === "*" || hit.imported === "default") return null;
	const path = env.resolve(sf.fileName, hit.module);
	if (!path) return null;
	const target = env.sourceFile(path);
	if (!target || target === sf) return null;
	return resolveExported(hit.imported, target, env, depth + 1);
}

/** 이 파일이 그 이름으로 내보내는 것의 바인딩. */
function resolveExported(name, target, env, depth) {
	if (depth > MAX_DEPTH) return null;
	// `export const ghostCreate = createElement`
	const alias = constAlias(name, target);
	if (alias) {
		const resolved = resolveIn(alias, target, env, depth);
		if (resolved) return resolved;
	}
	// `import { createElement } from "react"; export { createElement as ghostCreate }`
	const again = importBindings(target).get(name);
	if (again) {
		const crossed = crossFile(again, target, env, depth);
		if (crossed) return crossed;
		return {
			module: again.module,
			imported: again.imported,
			local: name,
			via: "import",
			boundArgs: 0,
		};
	}
	const { named, stars } = reexportBindings(target);
	// `export { createElement as ghostCreate } from "react"` / `export { h as ghostCreate }`
	const re = named.get(name);
	if (re) {
		if (re.module) {
			const crossed = crossFile(
				{ module: re.module, imported: re.imported },
				target,
				env,
				depth,
			);
			if (crossed) return crossed;
			return {
				module: re.module,
				imported: re.imported,
				local: name,
				via: "reexport",
				boundArgs: 0,
			};
		}
		return resolveExported(re.imported, target, env, depth + 1);
	}
	// `export * from "mod"` — 이름을 바꾸지 않고 지나간다.
	for (const module of stars) {
		const crossed = crossFile({ module, imported: name }, target, env, depth);
		if (crossed) return crossed;
		if (!module.startsWith("."))
			return { module, imported: name, local: name, via: "reexport", boundArgs: 0 };
	}
	return null;
}

function resolveIn(alias, sf, env, depth) {
	if (alias.kind === "value") return resolveBinding(alias.node, sf, env, depth);
	// `const { createElement } = React` — 오른쪽이 default/namespace 일 때만 뜻이 정해진다.
	const base = resolveBinding(alias.node, sf, env, depth);
	if (!base) return null;
	// `const { fetch: f } = globalThis` — 전역 뿌리의 구조분해도 같은 전역이다.
	if (base.global && GLOBAL_ROOTS.has(base.global)) return globalBinding(alias.property);
	if (base.imported === "*" || base.imported === "default")
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
			if (resolved)
				return {
					...resolved,
					local: node.text,
					via: resolved.global
						? resolved.via
						: resolved.via === "destructure"
							? "destructure"
							: "alias",
				};
			return null;
		}
		// 선언이 어디에도 없는 자유 식별자는 전역이다. `fetch("…")` 가 그것이다.
		if (!isDeclaredLocally(node.text, sf)) return globalBinding(node.text);
		return null;
	}

	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		const name = memberName(node);
		if (name === null) return null; // 동적 키 — 보증 밖이다.
		const base = resolveBinding(memberBase(node), sf, env, depth + 1);
		if (!base) return null;
		// `globalThis.fetch` · `window["fetch"]` 는 전역 `fetch` 다.
		if (base.global) return GLOBAL_ROOTS.has(base.global) ? globalBinding(name) : null;
		// default·namespace 만 멤버를 그 모듈의 export 로 읽는다. 이름으로 가져온
		// 객체의 속성(`import { core } from "x"; core.invoke`)은 `x` 의 export 가
		// 아니므로 모른다고 말한다.
		if (base.imported === "*" || base.imported === "default")
			return {
				module: base.module,
				imported: name,
				local: null,
				via: "member",
				boundArgs: 0,
			};
		return null;
	}

	if (ts.isCallExpression(node)) {
		const callee = unwrap(node.expression);
		if (callee && memberName(callee) === "bind") {
			const base = resolveBinding(memberBase(callee), sf, env, depth + 1);
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
 * 이 **호출식**이 부르는 바인딩.
 *
 * 돌려주는 것: `{ module, imported, global, local, via, boundArgs, argShift, argsUnknown }`.
 *   - `module`/`imported` 로 판정한다. 이름(`local`)은 근거가 아니다.
 *   - `global` 이 있으면 모듈에서 온 것이 아니라 전역(`fetch`)이다.
 *   - `argShift` 는 호출부 인자 중 대상 함수의 것이 아닌 앞자리 수다
 *     (`f.call(this, a)` 면 1). **호출자는 인자를 읽을 때 반드시 이 값만큼
 *     자리를 옮겨야 한다.** 옮기지 않으면 `createElement.call(null, "div",
 *     { role: "alert" })` 의 props 자리에서 `"div"` 를 읽고, 같은 화면이
 *     `.call` 한 겹으로 검사를 빠져나간다(12회차 지적 2).
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
	const shape = memberName(callee);
	if (shape === "call" || shape === "apply") {
		const base = resolveBinding(memberBase(callee), source, env, 0);
		if (base && base.imported !== "*" && base.imported !== "default") {
			const viaApply = shape === "apply";
			return {
				...base,
				via: shape,
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
	if (!binding || !binding.module) return false;
	return modules.has(binding.module) && names.has(binding.imported);
}
