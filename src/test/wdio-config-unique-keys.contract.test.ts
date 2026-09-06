// wdio 설정 객체에 같은 이름의 훅이 둘 들어가지 않는지 고정한다.
//
// 왜 이 파일이 있는가: 객체 리터럴에 같은 키가 둘이면 자바스크립트는 뒤엣것만
// 남기고 앞엣것을 조용히 버린다. 오류도 경고도 없다(Vite 가 "Duplicate key"
// 를 한 줄 흘리지만 아무도 읽지 않는다). 기본 설정의 `afterSession` 이 그렇게
// 둘이었고, 앞엣것에 있던 #539 윈도우 인앱 포트 해제는 한 번도 돌지 않았다.
// 그 픽스는 커밋되어 있었고 리뷰도 지났으니, 돌지 않는다는 사실을 소스만
// 읽어서는 알 수 없었다.
//
// 파서에게 묻는다. `export const config = { ... }` 의 최상위 속성 이름을 모아
// 중복이 없어야 한다. 정규식으로 `afterSession` 만 세면 다음에 겹치는 다른
// 훅은 놓친다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CONF_DIR = fileURLToPath(
	new URL("../../packages/shell/e2e-tauri", import.meta.url),
);

function duplicateTopLevelKeys(source: string): string[] {
	const tree = ts.createSourceFile(
		"conf.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const duplicates: string[] = [];
	const visit = (node: ts.Node) => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "config" &&
			node.initializer
		) {
			let init: ts.Expression = node.initializer;
			while (
				ts.isAsExpression(init) ||
				ts.isSatisfiesExpression(init) ||
				ts.isParenthesizedExpression(init)
			) {
				init = init.expression;
			}
			if (ts.isObjectLiteralExpression(init)) {
				const seen = new Map<string, number>();
				for (const prop of init.properties) {
					const name = prop.name;
					if (!name) continue;
					const key = ts.isIdentifier(name) || ts.isStringLiteral(name)
						? name.text
						: name.getText();
					seen.set(key, (seen.get(key) ?? 0) + 1);
				}
				for (const [key, count] of seen) {
					if (count > 1) duplicates.push(key);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return duplicates;
}

describe("wdio 설정 객체의 훅 이름은 하나씩만 있다", () => {
	const configs = readdirSync(CONF_DIR).filter((name) =>
		/^wdio\.conf(\..+)?\.ts$/.test(name),
	);

	it("설정 파일을 실제로 찾는다", () => {
		expect(configs.length).toBeGreaterThan(5);
	});

	for (const name of configs) {
		it(`${name}: 같은 키가 두 번 나오지 않는다`, () => {
			const source = readFileSync(join(CONF_DIR, name), "utf8");
			expect(duplicateTopLevelKeys(source)).toEqual([]);
		});
	}

	it("판정기가 겹친 키를 실제로 잡는다 (반증)", () => {
		expect(
			duplicateTopLevelKeys(
				"export const config = { a() {}, b: 1, async a() {} };",
			),
		).toEqual(["a"]);
		expect(
			duplicateTopLevelKeys("export const config = { a() {}, b: 1 } as const;"),
		).toEqual([]);
	});
});
