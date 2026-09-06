// 기본 설정을 상속하면서 훅을 갈아 끼우는 설정이, 그 훅에 실려 있던 계약을 잃지 않는가.
//
// 상속은 조용히 반쪽이 된다. `wdio.conf.chat.ts` 는 `wdio.conf.ts` 를 펼쳐 쓰면서
// `before()` 와 `afterSession()` 만 자기 것으로 바꾼다. 그러면 모듈 최상위에 있는
// 것(격리 워크스페이스 시딩)은 그대로 상속되는데, 훅 안에 있는 것(게이트웨이 키
// 전달, 고아 agent 회수)은 통째로 사라진다. 심은 공급자는 쓰면서 키는 안 실리는
// 상태가 되고, 증상은 게이트웨이 401 로 나타난다 — 2026-09-05 실측에서
// `90-glm-newcore-chat` 이 정확히 그랬다.
//
// 글자를 세지 않고 노드로 잰다. 호출을 지우고 주석으로 남겨도 참이 되면 이
// 테스트가 막겠다는 그 사고를 그대로 통과시키는 셈이다.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const E2E_DIR = fileURLToPath(
	new URL("../../packages/shell/e2e-tauri/", import.meta.url),
);

function parse(path: string): ts.SourceFile {
	return ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
}

/** 이 파일이 기본 설정을 펼쳐 쓰는가. */
function inheritsBaseConf(tree: ts.SourceFile): boolean {
	let found = false;
	const visit = (node: ts.Node): void => {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "./wdio.conf.js"
		) {
			found = true;
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return found;
}

/** `config` 객체가 직접 정의한 훅의 몸통. 없으면 undefined(= 상속한다). */
function ownHookBody(tree: ts.SourceFile, hook: string): ts.Node | undefined {
	let body: ts.Node | undefined;
	const visit = (node: ts.Node): void => {
		if (
			(ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
			ts.isIdentifier(node.name) &&
			node.name.text === hook
		) {
			if (ts.isMethodDeclaration(node) && node.body) body ??= node.body;
			if (
				ts.isPropertyAssignment(node) &&
				(ts.isFunctionExpression(node.initializer) ||
					ts.isArrowFunction(node.initializer)) &&
				node.initializer.body
			) {
				body ??= node.initializer.body;
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return body;
}

/** 그 몸통 안에서 이름을 **부르는가**. 값으로 적기만 한 것은 부르는 것이 아니다. */
function callsByName(body: ts.Node, name: string): boolean {
	let called = false;
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === name
		) {
			called = true;
		}
		ts.forEachChild(node, visit);
	};
	visit(body);
	return called;
}

const INHERITORS = readdirSync(E2E_DIR)
	.filter(
		(name) =>
			name.startsWith("wdio.conf.") &&
			name.endsWith(".ts") &&
			name !== "wdio.conf.ts",
	)
	.map((name) => ({ name, tree: parse(resolve(E2E_DIR, name)) }))
	.filter((entry) => inheritsBaseConf(entry.tree));

describe("기본 설정을 상속하는 e2e 설정", () => {
	it("적어도 하나는 상속한다 — 아니면 이 계약은 아무것도 재지 않는다", () => {
		expect(INHERITORS.map((e) => e.name)).not.toHaveLength(0);
	});

	it.each(INHERITORS.map((e) => e.name))(
		"%s 가 before() 를 갈아 끼웠다면 게이트웨이 키도 직접 싣는다",
		(name) => {
			const entry = INHERITORS.find((e) => e.name === name);
			const before = ownHookBody(entry?.tree as ts.SourceFile, "before");
			if (!before) return; // 상속한다 — base 의 것이 그대로 돈다.
			expect(
				callsByName(before, "deliverCredentialedGatewayKey"),
				`${name} 이 base 의 before() 를 갈아 끼우면서 키 전달을 빠뜨렸다 —` +
					" 심은 공급자는 쓰면서 키만 빠지면 게이트웨이가 401 을 돌려준다",
			).toBe(true);
		},
	);

	it.each(INHERITORS.map((e) => e.name))(
		"%s 가 afterSession() 을 갈아 끼웠다면 고아 agent 도 직접 회수한다",
		(name) => {
			const entry = INHERITORS.find((e) => e.name === name);
			const afterSession = ownHookBody(
				entry?.tree as ts.SourceFile,
				"afterSession",
			);
			if (!afterSession) return;
			expect(
				callsByName(afterSession, "reclaimLeakedAgentChild"),
				`${name} 이 앱만 죽이고 그 agent 자식을 남기면 다음 세션이 뇌 없이 뜬다`,
			).toBe(true);
		},
	);
});

/** 기본 설정에서 이름으로 가져오는 것들. */
function namedImportsFromBase(tree: ts.SourceFile): string[] {
	const names: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "./wdio.conf.js" &&
			node.importClause?.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			for (const el of node.importClause.namedBindings.elements) {
				names.push((el.propertyName ?? el.name).text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return names;
}

/** 기본 설정이 실제로 내보내는 이름. `export function|const|let` 과 `export { a, b }`. */
function exportedNames(tree: ts.SourceFile): Set<string> {
	const names = new Set<string>();
	const isExported = (node: ts.Node) =>
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		);
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
			names.add(node.name.text);
		}
		if (ts.isVariableStatement(node) && isExported(node)) {
			for (const d of node.declarationList.declarations) {
				if (ts.isIdentifier(d.name)) names.add(d.name.text);
			}
		}
		if (
			ts.isExportDeclaration(node) &&
			node.exportClause &&
			ts.isNamedExports(node.exportClause)
		) {
			for (const el of node.exportClause.elements) names.add(el.name.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return names;
}

// 전용 설정이 기본 설정에서 이름으로 가져가는 것은 기본 설정이 실제로 내보내야 한다.
// wdio.conf.chat.ts 가 `reclaimLeakedAgentChild` 를 가져갔는데 기본 설정에서는
// export 가 아닌 지역 함수였다. 타입 검사는 e2e 디렉터리를 따로 돌리지 않아 잡지
// 못했고, 그 설정의 afterSession 은 처음 쓰일 때부터 매번 `is not a function` 으로
// 죽었다 — 그 설정으로 도는 스펙(90-glm-newcore-chat)의 뒷정리가 한 번도 돌지 않았다.
describe("전용 설정이 가져가는 이름은 기본 설정이 내보낸다", () => {
	const base = parse(resolve(E2E_DIR, "wdio.conf.ts"));
	const exported = exportedNames(base);

	it("기본 설정이 내보내는 이름을 실제로 읽는다", () => {
		expect(exported.has("config")).toBe(true);
	});

	for (const { name, tree } of INHERITORS) {
		it(`${name}: 가져가는 이름이 전부 내보내진다`, () => {
			const missing = namedImportsFromBase(tree).filter(
				(n) => !exported.has(n),
			);
			expect(missing).toEqual([]);
		});
	}
});
