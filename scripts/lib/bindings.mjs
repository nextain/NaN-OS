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
 *     `export { x as y } from "mod"`, `export * from "mod"`, 그리고 **default**
 *     (`export default x`, `export { x as default }`, `import h from "./x"`)를
 *     모두 따라간다. 네임스페이스로 가져온 멤버(`import * as R from "./x"` 뒤의
 *     `R.createElement`)도 그 파일의 export 로 이어 푼다.
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
 * 겹의 수는 한계가 아니다. 별명이 몇 겹이든 따라가고, 끝나는 이유는 깊이를
 * 세는 것이 아니라 (파일, 이름)을 두 번 지나지 않는 것이다. 숫자 한계는
 * "몇 겹을 더 쌓으면 통과하는가" 를 알려 주는 눈금이었다(13회차 지적 4).
 *
 * 이 경계 **안쪽** 형태는 새 모양이 와도 같은 규칙으로 잡힌다 — 껍데기는
 * `unwrap` 하나가 벗기고, 이름은 언제나 바인딩으로 되돌려 읽는다. 형태를
 * 하나씩 열거하지 않는 것이 이 모듈의 설계다.
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
import { unwrapExpression } from "./unwrap.mjs";


/** 전역이 담겨 있는 뿌리 이름. 이 멤버는 그 이름의 전역과 같다. */
const GLOBAL_ROOTS = new Set(["globalThis", "window", "self", "global"]);

/**
 * 껍데기를 벗겨 알맹이 식을 돌려준다.
 *
 * 규칙은 `scripts/lib/unwrap.mjs` 하나뿐이다 — 이 모듈은 그것을 그대로 내보내
 * 호출자가 어디서 부르든 같은 답을 받게 한다. 껍데기를 벗기는 코드를 여기에
 * 다시 적으면, 다음 회차에 한쪽만 고쳐진 자리로 결함이 들어온다(13회차 지적 1).
 */
export const unwrap = unwrapExpression;

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
/**
 * **모듈 바인딩을 만드는 선언**은 TypeScript 에 두 종뿐이다.
 *
 *   - `ts.isImportDeclaration` — `import … from "mod"`
 *   - `ts.isImportEqualsDeclaration` — `import h = require("mod")`,
 *     `import x = ns.member`
 *
 * 형태를 열거하지 않고 이 두 술어로 묻는다. 앞엣것만 보면 `import h =
 * require("react")` 가 import 가 아니게 되고, 그러면 `h` 는 선언 없는 자유
 * 식별자로 읽혀 전역이 된다 — 요소 판정이 통째로 갈린다(15회차 지적 8).
 * 이것은 **정적** 선언이고, 보증 밖인 동적 `import()`/`require()` **호출**과
 * 다르다.
 */
export function isModuleBindingDeclaration(node) {
	return !!node && (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node));
}

const IMPORTS = new WeakMap();

export function importBindings(sf) {
	if (sf && IMPORTS.has(sf)) return IMPORTS.get(sf);
	const out = new Map();
	if (!sf || !sf.statements) return out;
	IMPORTS.set(sf, out);
	for (const stmt of sf.statements) {
		if (!isModuleBindingDeclaration(stmt)) continue;
		if (ts.isImportEqualsDeclaration(stmt)) {
			const ref = stmt.moduleReference;
			// `import h = require("react")` — 그 모듈 전체를 한 이름에 묶는다.
			// 네임스페이스 import 와 같은 뜻이라 같은 답을 준다.
			if (
				ts.isExternalModuleReference(ref) &&
				ref.expression &&
				ts.isStringLiteral(ref.expression)
			)
				out.set(stmt.name.text, {
					module: ref.expression.text,
					imported: "*",
					kind: "import-equals",
				});
			// `import x = ns.member` — 이름을 다른 이름에 붙인 것이다. 값이
			// 무엇인지는 그 이름을 풀어야 안다.
			else if (ts.isQualifiedName(ref) || ts.isIdentifier(ref))
				out.set(stmt.name.text, {
					module: null,
					imported: null,
					kind: "import-equals-entity",
					entity: ref,
				});
			continue;
		}
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
	/** `export * as ns from "mod"` — 내보낸 이름 → 그 모듈. */
	const namespaces = new Map();
	if (!sf || !sf.statements) return { named, stars, namespaces };
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
		// `export * as ns from "mod"` — 그 모듈 전체를 한 이름으로 내준다.
		// 정적 재수출이고, 보증 밖 목록(동적 import·고차 함수·배열/객체)에 없다.
		// 여기서 버리면 재수출 **형태** 한 겹만 바꿔 알림·꺼짐·파괴가 같이
		// 열린다(15회차 지적 1).
		if (ts.isNamespaceExport(stmt.exportClause)) {
			if (module) namespaces.set(stmt.exportClause.name.text, module);
			continue;
		}
		for (const el of stmt.exportClause.elements) {
			named.set(el.name.text, {
				module,
				imported: el.propertyName ? el.propertyName.text : el.name.text,
			});
		}
	}
	return { named, stars, namespaces };
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
				ts.isImportEqualsDeclaration(n) ||
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

const DECLARED_TYPES = new WeakMap();

/**
 * 타입 자리의 선언 이름(별칭·인터페이스·열거).
 *
 * 값 이름과 따로 든다. 타입과 값은 서로 다른 이름 공간이라, 타입 별칭 하나가
 * 같은 이름의 **전역 값**을 가리게 하면 안 된다 — `type fetch = …` 는
 * `fetch(…)` 를 가리지 않는다. 반대로 파일이 그 이름으로 무엇을 내주는지
 * 물을 때는 타입도 답이 된다.
 */
function declaredTypeNames(sf) {
	const cached = DECLARED_TYPES.get(sf);
	if (cached) return cached;
	const names = new Set();
	const visit = (n) => {
		if (!n) return;
		if (
			(ts.isTypeAliasDeclaration(n) ||
				ts.isInterfaceDeclaration(n) ||
				ts.isEnumDeclaration(n) ||
				ts.isModuleDeclaration(n)) &&
			n.name &&
			ts.isIdentifier(n.name)
		)
			names.add(n.name.text);
		ts.forEachChild(n, visit);
	};
	visit(sf);
	DECLARED_TYPES.set(sf, names);
	return names;
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

/**
 * 이름을 따라가며 이미 지난 (파일, 이름) 자리.
 *
 * 예전에는 깊이를 여섯까지 세었다. 그 숫자는 한계가 아니라 **눈금**이었다 —
 * 별명을 일곱 겹 쌓으면 부르는 값이 그대로 `createElement` 인데도 요소가
 * 아니게 되고, 막다른 오류 화면이 초록 안에 숨었다(13회차 지적 4). 200자
 * 창·속성 64개와 같은 종류의 자리다.
 *
 * 끝나는 이유는 세는 것이 아니라 **다시 가지 않는 것**이다. 이름을 풀 때마다
 * (파일, 이름)을 적어 두고 같은 자리에 두 번째로 닿으면 모른다로 답한다.
 * 그래서 `const a = b; const b = a;` 같은 순환은 끊기고, 겹은 몇이든 따라간다.
 */
function visitKey(sf, name) {
	return `${sf && sf.fileName ? sf.fileName : "?"}\u0000${name}`;
}

function newSeen(state) {
	return state instanceof Set ? state : new Set();
}

/** 상대 경로 import 를 건너가 그 파일의 별명·재수출까지 이어 푼다. */
function crossFile(hit, sf, env, seen) {
	if (!env || typeof env.resolve !== "function" || typeof env.sourceFile !== "function")
		return null;
	if (hit.imported === "*") return null;
	const path = env.resolve(sf.fileName, hit.module);
	if (!path) return null;
	const target = env.sourceFile(path);
	if (!target || target === sf) return null;
	return resolveExported(hit.imported, target, env, seen);
}

/**
 * 이 파일이 그 이름으로 내보내는 것의 바인딩.
 *
 * `default` 도 이름이다(13회차 지적 3). `export default createElement`,
 * `export { createElement as default }`, `export { x as default } from "mod"`
 * 는 모두 정적 재수출이고, 보증 밖 목록(동적 `import`, 고차 함수, 배열·객체)에
 * 없다. 여기서 멈추면 `import h from "./shim"` 한 줄로 요소 판정이 열린다.
 */
function resolveExported(name, target, env, seen) {
	const key = visitKey(target, name);
	if (seen.has(key)) return null;
	seen.add(key);
	// `export default createElement` — 이름 없는 자리라 별명·import 로는 안 잡힌다.
	if (name === "default") {
		for (const stmt of target.statements) {
			if (!ts.isExportAssignment(stmt) || stmt.isExportEquals) continue;
			const resolved = resolveBinding(stmt.expression, target, env, seen);
			if (resolved) return resolved;
		}
	}
	// `export const ghostCreate = createElement`
	const alias = constAlias(name, target);
	if (alias) {
		const resolved = resolveIn(alias, target, env, seen);
		if (resolved) return resolved;
	}
	// `import { createElement } from "react"; export { createElement as ghostCreate }`
	const again = importBindings(target).get(name);
	if (again) {
		const crossed = crossFile(again, target, env, seen);
		if (crossed) return crossed;
		return {
			module: again.module,
			imported: again.imported,
			local: name,
			via: "import",
			boundArgs: 0,
		};
	}
	const { named, stars, namespaces } = reexportBindings(target);
	// `export * as GhostReact from "react"` — 그 이름은 그 모듈 전체다.
	const asNamespace = namespaces.get(name);
	if (asNamespace)
		return {
			module: asNamespace,
			imported: "*",
			local: name,
			via: "reexport-namespace",
			boundArgs: 0,
		};
	// `export { createElement as ghostCreate } from "react"` / `export { h as ghostCreate }`
	const re = named.get(name);
	if (re) {
		if (re.module) {
			const crossed = crossFile(
				{ module: re.module, imported: re.imported },
				target,
				env,
				seen,
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
		return resolveExported(re.imported, target, env, seen);
	}
	// `export * from "mod"` — 이름을 바꾸지 않고 지나간다.
	for (const module of stars) {
		const crossed = crossFile({ module, imported: name }, target, env, seen);
		if (crossed) return crossed;
		if (!module.startsWith("."))
			return { module, imported: name, local: name, via: "reexport", boundArgs: 0 };
	}
	return null;
}

function resolveIn(alias, sf, env, seen) {
	if (alias.kind === "value") return resolveBinding(alias.node, sf, env, seen);
	// `const { createElement } = React` — 오른쪽이 default/namespace 일 때만 뜻이 정해진다.
	const base = resolveBinding(alias.node, sf, env, seen);
	if (!base) return null;
	// `const { fetch: f } = globalThis` — 전역 뿌리의 구조분해도 같은 전역이다.
	if (base.global && GLOBAL_ROOTS.has(base.global)) return globalBinding(alias.property);
	if (base.imported === "*" || base.imported === "default") {
		const through = memberOfModule(base, alias.property, sf, env, seen);
		if (through) return through;
		return {
			module: base.module,
			imported: alias.property,
			local: null,
			via: "destructure",
			boundArgs: 0,
		};
	}
	return null;
}

/**
 * 네임스페이스·default 로 가져온 것의 멤버를 **그 파일의 export** 로 이어 푼다.
 *
 * `import * as R from "./shim"` 뒤의 `R.createElement(...)` 는 `./shim` 의
 * `createElement` 이고, 그 파일이 `export * from "react"` 라면 결국 react 의
 * 것이다. 여기서 멈추면 같은 화면이 네임스페이스 한 겹으로 요소가 아니게 된다.
 * 저장소 안 파일로 풀리지 않는 모듈(`react` 같은 것)은 그대로 둔다.
 */
function memberOfModule(base, name, sf, env, seen) {
	if (!base || !base.module) return null;
	if (!env || typeof env.resolve !== "function" || typeof env.sourceFile !== "function")
		return null;
	const path = env.resolve(sf.fileName, base.module);
	if (!path) return null;
	const target = env.sourceFile(path);
	if (!target) return null;
	return resolveExported(name, target, env, seen);
}

/**
 * 이 이름이 가리키는 값이 **어느 파일의 어느 이름**인가.
 *
 * `resolveBinding` 은 "어느 모듈의 어느 export" 를 답한다. 값을 실제로 읽으려는
 * 쪽(영구 꺼짐·문자열 후보 판정)은 그것 말고 **파일과 이름**이 필요하다.
 * 예전에는 그 일이 `jsx-static.mjs` 안에 따로 있었고, named·default import 만
 * 보고 재수출과 네임스페이스는 몰랐다 — import 형태 한 겹만 바꾸면 영구히 꺼 둔
 * 버튼이 열린 것으로 읽혔다(14회차 지적 2). 이제 import 선언을 읽는 자리는
 * 이 모듈 하나다.
 *
 * 돌려주는 것:
 *   - `{ sf, name }` — 그 파일에 그 이름으로 선언돼 있다
 *   - `{ sf, namespace: true }` — 그 파일 전체가 네임스페이스다
 *   - `{ sf, defaultNode }` — `export default <식>` 의 그 식
 *   - `null` — 모른다
 */
export function importedValueSite(name, sf, env, state) {
	if (!env || typeof env.resolve !== "function" || typeof env.sourceFile !== "function")
		return null;
	const seen = newSeen(state);
	const hit = importBindings(sf).get(name);
	if (!hit) return null;
	const path = env.resolve(sf.fileName, hit.module);
	if (!path) return null;
	const target = env.sourceFile(path);
	if (!target) return null;
	return exportedValueSite(hit.imported, target, env, seen);
}

/** 이 파일이 그 이름으로 내주는 값의 자리. `importedValueSite` 와 같은 모양이다. */
export function exportedValueSite(name, target, env, state) {
	const seen = newSeen(state);
	if (!target) return null;
	const key = visitKey(target, `site:${name}`);
	if (seen.has(key)) return null;
	seen.add(key);
	if (name === "*") return { sf: target, namespace: true };
	if (name === "default") {
		for (const stmt of target.statements) {
			if (ts.isExportAssignment(stmt) && !stmt.isExportEquals)
				return { sf: target, defaultNode: stmt.expression };
		}
	}
	// 그 파일에 그 이름의 선언이 있으면 여기가 값의 자리다.
	if (
		name !== "default" &&
		(declaredNames(target).has(name) || declaredTypeNames(target).has(name))
	)
		return { sf: target, name };
	const hop = (module, exported) => {
		if (!env || typeof env.resolve !== "function") return null;
		const path = env.resolve(target.fileName, module);
		if (!path) return null;
		const next = env.sourceFile(path);
		if (!next || next === target) return null;
		return exportedValueSite(exported, next, env, seen);
	};
	// `import { off } from "./inner"; export { off }` 와 `import * as ns` 재수출
	const again = importBindings(target).get(name);
	if (again) return hop(again.module, again.imported);
	const { named, stars, namespaces } = reexportBindings(target);
	// `export * as flags from "./logger"` — 그 이름은 저 파일 전체다.
	const asNamespace = namespaces.get(name);
	if (asNamespace) {
		const through = hop(asNamespace, "*");
		if (through) return through;
		return null;
	}
	const re = named.get(name);
	if (re) {
		if (re.module) return hop(re.module, re.imported);
		return exportedValueSite(re.imported, target, env, seen);
	}
	for (const module of stars) {
		const through = hop(module, name);
		if (through) return through;
	}
	return null;
}

/**
 * `import x = a.b.c` 의 오른쪽(EntityName)을 푼다.
 *
 * 식이 아니라 이름 경로라 `resolveBinding` 이 그대로 받지 못한다. 왼쪽 끝을
 * 이름으로 풀고, 그 뒤 마디를 멤버로 하나씩 적용한다 — 멤버 규칙은 속성 접근과
 * 같다(default·네임스페이스만 그 모듈의 export 로 읽는다).
 */
function resolveEntityName(entity, sf, env, seen) {
	if (!entity) return null;
	if (ts.isIdentifier(entity)) return resolveBinding(entity, sf, env, seen);
	if (!ts.isQualifiedName(entity)) return null;
	const base = resolveEntityName(entity.left, sf, env, seen);
	if (!base) return null;
	const name = entity.right.text;
	if (base.global) return GLOBAL_ROOTS.has(base.global) ? globalBinding(name) : null;
	if (base.imported === "*" || base.imported === "default") {
		const through = memberOfModule(base, name, sf, env, seen);
		if (through) return through;
		return { module: base.module, imported: name, local: null, via: "member", boundArgs: 0 };
	}
	return null;
}

/**
 * 이 **식**이 함수로서 가리키는 import 바인딩.
 *
 * 호출식이 아니라 값이다 — `f`, `React.createElement`, `f.bind(null)` 처럼
 * "부르면 그 함수가 도는" 식을 받는다. 부른 **결과**(`f()`)는 값이 무엇인지
 * 정적으로 모르므로 `null` 이다.
 */
export function resolveBinding(expr, sf, env, state) {
	if (!sf) return null;
	const seen = newSeen(state);
	const node = unwrap(expr);
	if (!node) return null;

	if (ts.isIdentifier(node)) {
		const key = visitKey(sf, node.text);
		if (seen.has(key)) return null;
		seen.add(key);
		const hit = importBindings(sf).get(node.text);
		// `import x = ns.member` — 이름을 이름에 붙인 것이다. 그 이름을 푼다.
		if (hit && hit.kind === "import-equals-entity")
			return resolveEntityName(hit.entity, sf, env, seen);
		if (hit) {
			const crossed = crossFile(hit, sf, env, seen);
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
			const resolved = resolveIn(alias, sf, env, seen);
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
		const base = resolveBinding(memberBase(node), sf, env, seen);
		if (!base) return null;
		// `globalThis.fetch` · `window["fetch"]` 는 전역 `fetch` 다.
		if (base.global) return GLOBAL_ROOTS.has(base.global) ? globalBinding(name) : null;
		// default·namespace 만 멤버를 그 모듈의 export 로 읽는다. 이름으로 가져온
		// 객체의 속성(`import { core } from "x"; core.invoke`)은 `x` 의 export 가
		// 아니므로 모른다고 말한다.
		if (base.imported === "*" || base.imported === "default") {
			// 저장소 안 파일로 풀리는 모듈이면 그 파일의 export 까지 이어 푼다 —
			// `import * as R from "./shim"` 의 `R.createElement` 는 shim 이
			// 재수출한 react 의 것이다.
			const through = memberOfModule(base, name, sf, env, seen);
			if (through) return through;
			return {
				module: base.module,
				imported: name,
				local: null,
				via: "member",
				boundArgs: 0,
			};
		}
		return null;
	}

	if (ts.isCallExpression(node)) {
		const callee = unwrap(node.expression);
		if (callee && memberName(callee) === "bind") {
			const base = resolveBinding(memberBase(callee), sf, env, seen);
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
		const base = resolveBinding(memberBase(callee), source, env, new Set());
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

	const direct = resolveBinding(callee, source, env, new Set());
	if (!direct) return null;
	return { ...direct, argShift: 0, argsUnknown: direct.boundArgs > 0 };
}

/** `{ module, imported }` 가 이 목록 안인가. 호출자가 판정을 한 줄로 적을 때 쓴다. */
export function bindingIsOneOf(binding, modules, names) {
	if (!binding || !binding.module) return false;
	return modules.has(binding.module) && names.has(binding.imported);
}
