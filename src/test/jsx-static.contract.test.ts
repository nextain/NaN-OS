// `scripts/lib/jsx-static.mjs` 가 **무엇을 어떤 값으로 읽는지**를 고정한다.
//
// 왜 이 파일이 있는가: 두 품질 게이트(`check-recovery-affordance`,
// `check-dead-ui-specs`)의 판정 근거가 통째로 그 모듈 하나에 들어 있다. 알림인지,
// 영구히 꺼 둔 버튼인지, 화면에 오르는 표지인지를 전부 거기서 정한다. 그런데
// 그 모듈 자체를 겨누는 테스트는 없었다. 게이트를 돌려서 EXIT 만 보는 방식은
// 저장소의 현재 내용에 기대므로, 모듈이 어떤 형태를 어떻게 읽는지는 드러나지
// 않는다 — 읽는 방식이 조용히 좁아져도 그날의 소스에 그 형태가 없으면 게이트는
// 여전히 초록이다.
//
// 그래서 여기서 고정하는 것은 함수 시그니처가 아니라 **행동**이다. 10회차 교차
// 리뷰(`docs/quality-reviews/round-10-findings.md` 지적 1~5)에서 리뷰어가 심은
// 형태 하나하나 — spread 로 감춘 `role`, `createElement` 로 적은 알림, 상수에
// 넣어 둔 `disabled`, 조건식 뒤에 숨긴 표지 — 가 각각 어떤 값으로 읽히는지를
// 적는다. 그리고 계약마다 "이렇게 읽히면 게이트가 뚫린다"는 반대 값을 함께
// 못 박는다. 특히 `false ?? true` 는 거짓이어야 한다. `||` 와 같게 다루면
// 열려 있는 버튼을 영구히 꺼진 것으로 읽고, 그 스펙을 죽은 것으로 지운다.
//
// 모듈은 `.mjs` ESM 이라 정적 import 로는 이 tsconfig(rootDir=src)의 범위를
// 벗어난다. 파일 URL 로 동적 import 해서 실제 산출물 그대로를 태운다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
	resolve(__dirname, "..", "..", "scripts", "lib", "jsx-static.mjs"),
).href;

type Candidates = { values: Set<string>; complete: boolean };
// `sf` 는 그 값이 **적혀 있는 파일**이다. spread 가 import 를 건너오면 값은
// 건너간 파일의 노드이므로, 그 사실을 잃으면 이름을 엉뚱한 트리에서 푼다.
type PropRecord = {
	name: string;
	value: ts.Node | undefined;
	bare: boolean;
	sf?: ts.SourceFile;
};
type ElementProps = { props: PropRecord[]; unknownSpread: boolean };

interface Env {
	has(path: string): boolean;
	sourceFile(path: string): ts.SourceFile | null;
	resolve(from: string, spec: string): string | null;
}

interface JsxStatic {
	parseSource(file: string, text: string): ts.SourceFile;
	makeEnv(files: Map<string, string>): Env;
	elementProps(node: ts.Node, sf: ts.SourceFile, env: Env | null): ElementProps;
	elementChildren(node: ts.Node, env: Env | null): ts.Node[];
	jsxElementsIn(node: ts.Node, sf: ts.SourceFile, env: Env | null): ts.Node[];
	stringCandidates(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env | null): Candidates;
	staticChunks(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env | null): string[];
	alwaysTruthy(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env | null): boolean;
	typeStrings(node: ts.TypeNode | undefined, sf: ts.SourceFile, env?: Env | null): Candidates;
	isCreateElementCall(node: ts.Node, env: Env | null): boolean;
	isElementNode(node: ts.Node, env: Env | null): boolean;
	elementFactory(node: ts.Node, env: Env | null): "classic" | "runtime" | null;
	elementCallShape(
		node: ts.Node,
		env: Env | null,
	): { factory: "classic" | "runtime" | null; argShift: number; argsUnknown: boolean };
}

const J = (await import(/* @vite-ignore */ MODULE_URL)) as JsxStatic;

const HOME = "app/screen.tsx";

function parse(code: string, file: string = HOME): ts.SourceFile {
	return J.parseSource(file, code);
}

/** 이름이 같은 첫 JSX 속성의 값 노드. 값이 없으면 undefined 다. */
function attributeValue(sf: ts.SourceFile, name: string): ts.Node | undefined {
	let hit: ts.Node | undefined;
	const walk = (node: ts.Node): void => {
		if (hit) return;
		if (ts.isJsxAttribute(node) && node.name.getText(sf) === name) {
			hit = node.initializer;
			return;
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);
	return hit;
}

/** 식 하나를 `<div t={…} />` 한 줄로 감싸 그 값 노드를 준다. */
function probe(source: string, prelude = ""): { sf: ts.SourceFile; node: ts.Node | undefined } {
	const sf = parse(`${prelude}\nexport const Probe = <div t={${source}} />;`);
	return { sf, node: attributeValue(sf, "t") };
}

function candidatesOf(source: string, prelude = ""): Candidates {
	const { sf, node } = probe(source, prelude);
	return J.stringCandidates(node, sf, null);
}

function valuesOf(source: string, prelude = ""): string[] {
	return [...candidatesOf(source, prelude).values].sort();
}

function chunksOf(source: string, prelude = ""): string[] {
	const { sf, node } = probe(source, prelude);
	return J.staticChunks(node, sf, null).sort();
}

/** 식 하나를 `<button d={…} />` 로 감싸 영구 참 판정을 묻는다. */
function truthyOf(source: string, prelude = ""): boolean {
	const sf = parse(`${prelude}\nexport const Probe = <button d={${source}} />;`);
	return J.alwaysTruthy(attributeValue(sf, "d"), sf, null);
}

function firstElement(sf: ts.SourceFile, env: Env | null = null): ts.Node {
	const elements = J.jsxElementsIn(sf, sf, env);
	expect(elements.length, "요소를 하나도 찾지 못했다").toBeGreaterThan(0);
	return elements[0] as ts.Node;
}

type ReadProps = ElementProps & { sf: ts.SourceFile };

function readProps(code: string, env: Env | null = null, sf?: ts.SourceFile): ReadProps {
	const tree = sf ?? parse(code);
	return { ...J.elementProps(firstElement(tree, env), tree, env), sf: tree };
}

function names(read: ReadProps): string[] {
	return read.props.map((p) => p.name);
}

function valueOfProp(read: ReadProps, name: string, env?: Env): string[] {
	const hit = read.props.find((p) => p.name === name);
	if (!hit) return [];
	return [...J.stringCandidates(hit.value, read.sf, env).values].sort();
}

/** 파일 사이를 따라가는 환경. 실제 파일을 만들지 않고 메모리 지도로 만든다. */
function environment(files: Record<string, string>): {
	env: Env;
	file(path: string): ts.SourceFile;
} {
	const env = J.makeEnv(new Map(Object.entries(files)));
	return {
		env,
		file(path: string): ts.SourceFile {
			const sf = env.sourceFile(path);
			expect(sf, `${path} 가 환경에 없다`).not.toBeNull();
			return sf as ts.SourceFile;
		},
	};
}

/** 첫 호출식의 타입 인자. `useState<"a" | "b">(…)` 에서 유니언을 꺼낸다. */
function firstTypeArgument(sf: ts.SourceFile): ts.TypeNode | undefined {
	let hit: ts.TypeNode | undefined;
	const walk = (node: ts.Node): void => {
		if (hit) return;
		if (ts.isCallExpression(node) && node.typeArguments && node.typeArguments.length > 0) {
			hit = node.typeArguments[0];
			return;
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);
	return hit;
}

describe("elementProps — 요소가 실제로 받는 속성", () => {
	it("보통 JSX 속성을 그대로 읽는다", () => {
		const read = readProps(`export const E = <div role="alert" />;`);
		expect(names(read)).toEqual(["role"]);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		expect(read.unknownSpread).toBe(false);
	});

	it("객체 리터럴 spread 는 그냥 속성이다", () => {
		const read = readProps(`export const E = <div {...{ role: "alert" }} />;`);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		// 반증: 정적으로 다 읽은 spread 를 "모른다"로 표시하면 알림 판정이
		// 놓치는 쪽으로 기울어 화면 전체가 검사 밖으로 나간다.
		expect(read.unknownSpread).not.toBe(true);
	});

	it("같은 파일 const 객체를 펼친 spread 도 같은 속성이다", () => {
		const read = readProps(
			`const banner = { role: "alert" };\nexport const E = <div {...banner} />;`,
		);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		expect(read.unknownSpread).not.toBe(true);
	});

	it("createElement 둘째 인자의 props 를 같은 목록으로 준다", () => {
		const read = readProps(`export const E = createElement("div", { role: "alert" }, "boom");`);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		expect(read.unknownSpread).toBe(false);
	});

	it("default import 의 React.createElement 도 같다", () => {
		const read = readProps(
			`import React from "react";\nexport const E = React.createElement("div", { role: "alert" });`,
		);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
	});

	it("값 없이 박힌 속성은 bare 로 온다", () => {
		const read = readProps(`export const E = <button disabled data-testid="wake" />;`);
		const disabled = read.props.find((p) => p.name === "disabled");
		expect(disabled?.bare).toBe(true);
		expect(valueOfProp(read, "data-testid")).toEqual(["wake"]);
	});

	it("풀 수 없는 spread 는 unknownSpread 로 알리고, 아는 속성은 그대로 준다", () => {
		const read = readProps(`export function F(rest) { return <div {...rest} role="alert" />; }`);
		expect(read.unknownSpread).toBe(true);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		// 반증: 못 읽은 자리를 "속성이 없다"로 읽으면, 값을 함수 인자로 한 겹
		// 감추는 것만으로 표지·꺼짐 검사를 통과한다.
		expect(read.unknownSpread).not.toBe(false);
	});

	it("import 로 건너간 const 객체를 펼친 spread 도 읽는다", () => {
		const { env, file } = environment({
			"app/screen.tsx": `import { BANNER } from "./props";\nexport const E = <div {...BANNER} />;`,
			"app/props.ts": `export const BANNER = { role: "alert", "data-testid": "wake" };`,
		});
		const sf = file("app/screen.tsx");
		const read = readProps("", env, sf);
		expect(names(read).sort()).toEqual(["data-testid", "role"]);
		expect(valueOfProp(read, "role", env)).toEqual(["alert"]);
		expect(read.unknownSpread).not.toBe(true);
	});

	it("게이트가 쓰는 조합: spread 로 감춘 disabled 와 표지가 한 요소에서 함께 읽힌다", () => {
		const read = readProps(
			`export const E = <button data-testid="ghost-wake-panel" {...{ disabled: true }}>ghost</button>;`,
		);
		const disabled = read.props.find((p) => p.name === "disabled");
		expect(J.alwaysTruthy(disabled?.value, read.sf, undefined)).toBe(true);
		expect(valueOfProp(read, "data-testid")).toEqual(["ghost-wake-panel"]);
	});
});

describe("stringCandidates·staticChunks — 이 식이 될 수 있는 문자열", () => {
	it("문자열 리터럴은 그 하나이고 그것이 전부다", () => {
		expect(valuesOf(`"a"`)).toEqual(["a"]);
		expect(candidatesOf(`"a"`).complete).toBe(true);
		expect(chunksOf(`"a"`)).toEqual(["a"]);
	});

	it("템플릿은 고정 조각을 주되 전부는 아니라고 말한다", () => {
		expect(chunksOf("`a-${x}`")).toEqual(["a-"]);
		expect(valuesOf("`a-${x}`")).toEqual([]);
		// 반증: 완성값이 없는데 complete 가 참이면, 조립한 이름이 "그런 값은
		// 없다"로 확정되어 없는 이름 판정이 오탐으로 바뀐다.
		expect(candidatesOf("`a-${x}`").complete).not.toBe(true);
	});

	it("조건식은 두 갈래를 모두 주고 그것이 전부다", () => {
		expect(valuesOf(`c ? "a" : "b"`, "declare const c: boolean;")).toEqual(["a", "b"]);
		expect(candidatesOf(`c ? "a" : "b"`, "declare const c: boolean;").complete).toBe(true);
		// 반증: 한 갈래만 읽으면 `data-testid={false ? "ghost" : "real"}` 로
		// 표지를 숨긴 자리가 정의 지도에서 사라진다.
		expect(valuesOf(`c ? "a" : "b"`, "declare const c: boolean;")).not.toEqual(["a"]);
	});

	it("`||` 는 양쪽 다 후보다", () => {
		expect(valuesOf(`k || "b"`, `const k = "a";`)).toEqual(["a", "b"]);
		expect(candidatesOf(`k || "b"`, `const k = "a";`).complete).toBe(true);
	});

	it("`??` 도 양쪽 다 후보이고, 왼쪽을 못 풀면 전부가 아니다", () => {
		expect(valuesOf(`x ?? "b"`)).toEqual(["b"]);
		expect(candidatesOf(`x ?? "b"`).complete).toBe(false);
		expect(candidatesOf(`x ?? "b"`).complete).not.toBe(true);
	});

	it("`&&` 는 오른쪽이 후보다", () => {
		expect(valuesOf(`c && "a"`, "declare const c: boolean;")).toEqual(["a"]);
	});

	it("`as const` 껍데기는 값을 가리지 않는다", () => {
		expect(valuesOf(`"a" as const`)).toEqual(["a"]);
		expect(candidatesOf(`"a" as const`).complete).toBe(true);
	});

	it("같은 파일 const 식별자를 따라간다", () => {
		expect(valuesOf("K", `const K = "a";`)).toEqual(["a"]);
		expect(chunksOf("K", `const K = "a";`)).toEqual(["a"]);
	});

	it("풀 수 없는 식별자는 값이 없고 전부도 아니다", () => {
		expect(valuesOf("mystery")).toEqual([]);
		expect(candidatesOf("mystery").complete).toBe(false);
		// 반증: 못 푼 것을 complete 로 말하면 "이 파일에는 그 이름이 없다"가
		// 되어, 값을 한 겹 감춘 표지가 그대로 통과한다.
		expect(candidatesOf("mystery").complete).not.toBe(true);
	});

	it("className 처럼 조각으로 붙는 값은 완성값이 없어도 조각이 남는다", () => {
		const { sf, node } = probe("`panel ${state}`");
		expect(J.staticChunks(node, sf, null)).toContain("panel ");
		expect(J.stringCandidates(node, sf, null).complete).toBe(false);
	});
});

describe("alwaysTruthy — 영구히 꺼 둔 조작의 정의", () => {
	const trueForms: Array<[string, string]> = [
		["true", ""],
		[`"true"`, ""],
		[`"x"`, ""],
		["1", ""],
		["!false", ""],
		["!!true", ""],
		["true && true", ""],
		["false || true", ""],
		["true as const", ""],
	];
	for (const [source, prelude] of trueForms) {
		it(`\`${source}\` 는 언제나 참이다`, () => {
			expect(truthyOf(source, prelude)).toBe(true);
		});
	}

	it("`false ?? true` 는 참이 아니다 — `??` 는 왼쪽만 본다", () => {
		expect(truthyOf("false ?? true")).toBe(false);
		// 반증: `||` 와 같게 다루면 열려 있는 버튼이 영구히 꺼진 것으로 읽히고,
		// 그 버튼을 기다리는 스펙이 죽은 것으로 지워진다.
		expect(truthyOf("false ?? true")).not.toBe(true);
	});

	it("`true ?? false` 는 참이다 — 왼쪽이 언제나 참이면 결과도 그렇다", () => {
		expect(truthyOf("true ?? false")).toBe(true);
	});

	it("재대입 없는 const 식별자는 따라간다", () => {
		expect(truthyOf("off", "const off = true;")).toBe(true);
	});

	it("`let` 은 따라가지 않는다 — 다시 대입될 수 있다", () => {
		expect(truthyOf("off", "let off = true;")).toBe(false);
		expect(truthyOf("off", "let off = true;")).not.toBe(true);
	});

	it("const 라도 파일 안에서 재대입되면 따라가지 않는다", () => {
		expect(truthyOf("off", "const off = true;\noff = false;")).toBe(false);
	});

	it("함수 인자 식별자는 참이 아니다", () => {
		const sf = parse(`export function Probe({ flag }) { return <button d={flag} />; }`);
		expect(J.alwaysTruthy(attributeValue(sf, "d"), sf, null)).toBe(false);
	});

	it("빈 문자열과 0 은 참이 아니다", () => {
		expect(truthyOf(`""`)).toBe(false);
		expect(truthyOf("0")).toBe(false);
	});

	it("import 로 건너간 const 도 따라간다", () => {
		const { env, file } = environment({
			"app/screen.tsx": `import { OFF } from "./flags";\nexport const E = <button d={OFF} />;`,
			"app/flags.ts": `export const OFF = true;`,
		});
		const sf = file("app/screen.tsx");
		expect(J.alwaysTruthy(attributeValue(sf, "d"), sf, env)).toBe(true);
	});
});

describe("jsxElementsIn — 식 안에서 화면에 오를 수 있는 요소", () => {
	const oneElement: Array<[string, string]> = [
		["곧바로 돌려주는 요소", "export function F() { return <A />; }"],
		["`&&` 뒤의 요소", "export function F() { return c && <A />; }"],
		["삼항 한 갈래의 요소", "export function F() { return c ? <A /> : null; }"],
	];
	for (const [label, code] of oneElement) {
		it(`${label} 를 하나로 센다`, () => {
			const sf = parse(code);
			expect(J.jsxElementsIn(sf, sf, null).length).toBe(1);
		});
	}

	it("createElement 호출 자체가 요소다", () => {
		const sf = parse(`export function F() { return createElement("div", null, "hi"); }`);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length).toBe(1);
		expect(J.isCreateElementCall(elements[0] as ts.Node, null)).toBe(true);
		expect(J.isElementNode(elements[0] as ts.Node, null)).toBe(true);
	});

	it("자식의 `{cond && …}` 안에 있는 요소도 열거된다", () => {
		const sf = parse(`export function F() { return (<div>{c && <A />}</div>); }`);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length).toBe(2);
		// 바깥이 먼저다. 게이트는 이 순서로 위에서 아래로 내려간다.
		expect(ts.isJsxElement(elements[0] as ts.Node)).toBe(true);
		expect((elements[1] as ts.Node).getText(sf)).toBe("<A />");
	});

	it("열거는 도달 가능성이지 '유일한 내용' 판정이 아니다", () => {
		// 이것이 이 함수의 진짜 계약이다. `jsxElementsIn` 은 하위 트리의 요소를
		// 전부 준다 — 그러므로 그 길이를 "화면에 오르는 것이 하나뿐인가"로 읽으면
		// 안 된다. 형제 판정은 `elementChildren` 이 세는 자식 수로 한다.
		const sf = parse(`export function F() { return (<div>{c && <A />}</div>); }`);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length).not.toBe(1);
		expect(J.elementChildren(elements[0] as ts.Node, null).length).toBe(1);
	});

	it("형제가 둘이면 자식 수가 둘이다 — 알림이 화면 전부가 아닌 자리", () => {
		const sf = parse(`export function F() { return (<div><A /><B /></div>); }`);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length).toBe(3);
		expect(J.elementChildren(elements[0] as ts.Node, null).length).toBe(2);
		expect(J.elementChildren(elements[0] as ts.Node, null).length).not.toBe(1);
	});

	it("공백만 있는 JSX 텍스트는 자식으로 세지 않는다", () => {
		const sf = parse(`export function F() { return (\n\t<div>\n\t\t<A />\n\t</div>\n); }`);
		const outer = J.jsxElementsIn(sf, sf, null)[0] as ts.Node;
		expect(J.elementChildren(outer, null).length).toBe(1);
	});

	it("Fragment 는 요소로 세지 않는다 — 화면에 아무것도 붙이지 않는다", () => {
		const sf = parse(`export function F() { return (<><A /><B /></>); }`);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length).toBe(2);
		expect(elements.every((e) => !ts.isJsxFragment(e))).toBe(true);
	});
});

describe("typeStrings — 타입 자리의 문자열 유니언", () => {
	it("`useState<\"a\" | \"b\">` 의 유니언을 닫힌 집합으로 준다", () => {
		const sf = parse(`const [t, setT] = useState<"a" | "b">("a");`);
		const r = J.typeStrings(firstTypeArgument(sf), sf, undefined);
		expect([...r.values].sort()).toEqual(["a", "b"]);
		expect(r.complete).toBe(true);
	});

	it("같은 파일의 타입 별칭을 따라간다", () => {
		const sf = parse(`type Tab = "a" | "b";\nconst [t, setT] = useState<Tab>("a");`);
		const r = J.typeStrings(firstTypeArgument(sf), sf, undefined);
		expect([...r.values].sort()).toEqual(["a", "b"]);
		expect(r.complete).toBe(true);
	});

	it("import 로 건너간 타입 별칭도 따라간다", () => {
		const { env, file } = environment({
			"app/screen.tsx": `import type { Tab } from "./tabs";\nconst [t, setT] = useState<Tab>("a");`,
			"app/tabs.ts": `export type Tab = "a" | "b";`,
		});
		const sf = file("app/screen.tsx");
		const r = J.typeStrings(firstTypeArgument(sf), sf, env);
		expect([...r.values].sort()).toEqual(["a", "b"]);
		expect(r.complete).toBe(true);
	});

	it("환경을 주지 않으면 건너간 별칭은 못 풀고, 그 사실을 말한다", () => {
		const { file } = environment({
			"app/screen.tsx": `import type { Tab } from "./tabs";\nconst [t, setT] = useState<Tab>("a");`,
			"app/tabs.ts": `export type Tab = "a" | "b";`,
		});
		const sf = file("app/screen.tsx");
		const r = J.typeStrings(firstTypeArgument(sf), sf, undefined);
		expect([...r.values]).toEqual([]);
		// 반증: 못 푼 별칭을 닫힌 집합으로 말하면, 실제로 있는 탭 값이 "없는
		// 이름"으로 몰려 게이트가 오탐으로 꺼진다.
		expect(r.complete).not.toBe(true);
	});

	it("`null` 은 목록을 깨뜨리지 않지만 `string` 은 깨뜨린다", () => {
		const closed = parse(`const [t, setT] = useState<"a" | null>("a");`);
		const closedResult = J.typeStrings(firstTypeArgument(closed), closed, undefined);
		expect([...closedResult.values]).toEqual(["a"]);
		expect(closedResult.complete).toBe(true);

		const open = parse(`const [t, setT] = useState<"a" | string>("a");`);
		const openResult = J.typeStrings(firstTypeArgument(open), open, undefined);
		expect([...openResult.values]).toEqual(["a"]);
		expect(openResult.complete).toBe(false);
	});

	it("모르는 타입 이름은 값이 없고 전부도 아니다", () => {
		const sf = parse(`const [t, setT] = useState<SomeUnknownTab>("a");`);
		const r = J.typeStrings(firstTypeArgument(sf), sf, undefined);
		expect([...r.values]).toEqual([]);
		expect(r.complete).toBe(false);
	});
});

describe("elementProps — 값이 어느 파일의 것인지 (sf)", () => {
	// 값이 어느 파일에서 왔는지를 잃으면, 건너간 파일의 노드를 불러온 쪽
	// 트리로 풀게 된다. 그러면 import 한 겹으로 지적 3(영구 꺼짐)이 다시
	// 열린다 — 실제로 그 구멍이 있었다.
	const CROSS = {
		"app/screen.tsx": `import { P } from "./props";\nconst OFF = false;\nexport const E = <button {...P} />;`,
		"app/props.ts": `const OFF = true;\nconst NAME = "ghost-wake-panel";\nexport const P = { disabled: OFF, "data-testid": NAME };`,
	};

	function crossProps(): { env: Env; screen: ts.SourceFile; read: ElementProps } {
		const { env, file } = environment(CROSS);
		const screen = file("app/screen.tsx");
		return { env, screen, read: J.elementProps(firstElement(screen), screen, env) };
	}

	it("건너간 파일의 속성에 그 파일을 함께 싣는다", () => {
		const { read } = crossProps();
		const disabled = read.props.find((p) => p.name === "disabled");
		expect(disabled?.sf?.fileName).toBe("app/props.ts");
		expect(read.unknownSpread).toBe(false);
	});

	it("그 파일 트리로 풀면 상수 `disabled` 가 언제나 참이다", () => {
		const { env, read } = crossProps();
		const disabled = read.props.find((p) => p.name === "disabled");
		expect(J.alwaysTruthy(disabled?.value, disabled?.sf as ts.SourceFile, env)).toBe(true);
	});

	it("반증: 불러온 쪽 트리로 풀면 같은 버튼이 열린 것으로 읽힌다", () => {
		// 이것이 결함의 모양이다. 불러온 화면에 우연히 같은 이름의 상수가
		// 있으면(`const OFF = false`) 꺼 둔 버튼이 열린 것으로 뒤집힌다.
		// 그러므로 게이트는 반드시 `prop.sf` 로 풀어야 한다.
		const { env, screen, read } = crossProps();
		const disabled = read.props.find((p) => p.name === "disabled");
		expect(J.alwaysTruthy(disabled?.value, screen, env)).toBe(false);
		expect(disabled?.sf).not.toBe(screen);
	});

	it("건너간 파일의 상수 표지도 그 파일 트리로 풀어야 값이 나온다", () => {
		const { env, screen, read } = crossProps();
		const testid = read.props.find((p) => p.name === "data-testid");
		expect([
			...J.stringCandidates(testid?.value, testid?.sf as ts.SourceFile, env).values,
		]).toEqual(["ghost-wake-panel"]);
		// 반증: 트리를 잃으면 이름이 통째로 사라져 "그런 표지는 없다"가 된다.
		expect([...J.stringCandidates(testid?.value, screen, env).values]).toEqual([]);
	});

	it("객체 안의 spread 는 파일을 건너가서도 펼쳐진다", () => {
		const { env, file } = environment({
			"app/screen.tsx": `import { P } from "./props";\nexport const E = <div {...P} />;`,
			"app/props.ts": `const BASE = { role: "alert" };\nexport const P = { ...BASE, "data-testid": "k" };`,
		});
		const screen = file("app/screen.tsx");
		const read = J.elementProps(firstElement(screen), screen, env);
		const role = read.props.find((p) => p.name === "role");
		expect(role, "중첩 spread 의 role 을 잃었다").toBeDefined();
		expect([
			...J.stringCandidates(role?.value, role?.sf as ts.SourceFile, env).values,
		]).toEqual(["alert"]);
		// 반증: 중첩 spread 를 못 펼치면서 unknownSpread 만 켜면, 그 요소의
		// 알림 판정이 통째로 사라진다.
		expect(read.unknownSpread).not.toBe(true);
	});

	it("건너갈 곳에 그 이름이 없으면 '없다'가 아니라 '모른다'로 말한다", () => {
		const { env, file } = environment({
			"app/screen.tsx": `import { MISSING } from "./props";\nexport const E = <div {...MISSING} />;`,
			"app/props.ts": `export const OTHER = { role: "alert" };`,
		});
		const screen = file("app/screen.tsx");
		const read = J.elementProps(firstElement(screen), screen, env);
		expect(read.props).toEqual([]);
		expect(read.unknownSpread).toBe(true);
		// 반증: 빈 목록을 "속성이 없다"로 읽으면, 이름 하나를 못 찾은 것만으로
		// 표지·꺼짐 검사가 통째로 꺼진다.
		expect(read.unknownSpread).not.toBe(false);
	});

	it("환경 없이 만난 import spread 도 '모른다'다", () => {
		const read = readProps(
			`import { P } from "./props";\nexport const E = <div {...P} />;`,
		);
		expect(read.props).toEqual([]);
		expect(read.unknownSpread).toBe(true);
	});
});

describe("elementChildren — JSX 와 createElement 의 자식 세기는 대칭이다", () => {
	it("createElement 의 공백뿐인 문자열은 자식이 아니다", () => {
		const sf = parse(
			`export const E = createElement("div", null, " ", createElement("b", null, "x"));`,
		);
		const outer = J.jsxElementsIn(sf, sf, null)[0] as ts.Node;
		expect(J.elementChildren(outer, null).length).toBe(1);
		// 반증: 들여쓰기 한 칸을 형제로 세면 같은 화면을 createElement 로 적었을
		// 때만 "자식이 하나뿐인가" 판정이 뒤집혀, 막다른 알림이 빠져나간다.
		expect(J.elementChildren(outer, null).length).not.toBe(2);
	});

	it("같은 화면을 JSX 로 적어도 자식 수가 같다", () => {
		const sf = parse(`export const E = (\n\t<div>\n\t\t<b>x</b>\n\t</div>\n);`);
		const outer = J.jsxElementsIn(sf, sf, null)[0] as ts.Node;
		expect(J.elementChildren(outer, null).length).toBe(1);
	});

	it("글자가 있는 createElement 자식은 그대로 센다", () => {
		const sf = parse(`export const E = createElement("div", null, "install failed");`);
		const outer = J.jsxElementsIn(sf, sf, null)[0] as ts.Node;
		expect(J.elementChildren(outer, null).length).toBe(1);
	});
});

// ── 11회차 지적 3 ──────────────────────────────────────────────────
// 요소 판정이 `createElement` 라는 **글자**였다. `import { createElement as h }`
// 한 줄이면 막다른 오류 화면이 알림으로도 세어지지 않았고, 반대로 브라우저
// API 인 `document.createElement("canvas")` 가 화면 요소로 세어졌다. 이제
// 판정은 어느 모듈의 어느 export 를 부르는가다.
describe("elementFactory — 요소는 이름이 아니라 바인딩이다", () => {
	function factoryOf(code: string): "classic" | "runtime" | null {
		const sf = parse(code);
		let hit: "classic" | "runtime" | null = null;
		const walk = (node: ts.Node): void => {
			if (hit) return;
			const factory = J.elementFactory(node, null);
			if (factory) {
				hit = factory;
				return;
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
		return hit;
	}

	const elements: [string, string, "classic" | "runtime"][] = [
		[
			"react 의 createElement 를 h 로 별명 붙인 것",
			`import { createElement as h } from "react";\nexport const E = h("div", { role: "alert" });`,
			"classic",
		],
		[
			"preact 의 h",
			`import { h } from "preact";\nexport const E = h("div", { role: "alert" });`,
			"classic",
		],
		[
			"namespace import 의 멤버",
			`import * as React from "react";\nexport const E = React.createElement("div", { role: "alert" });`,
			"classic",
		],
		[
			"default import 의 멤버",
			`import React from "react";\nexport const E = React.createElement("div", { role: "alert" });`,
			"classic",
		],
		[
			"같은 파일 const 별명",
			`import { createElement } from "react";\nconst make = createElement;\nexport const E = make("div", { role: "alert" });`,
			"classic",
		],
		[
			"bind 로 만든 별명",
			`import { createElement } from "react";\nconst make = createElement.bind(null);\nexport const E = make("div", { role: "alert" });`,
			"classic",
		],
		[
			"구조분해로 꺼낸 별명",
			`import * as React from "react";\nconst { createElement } = React;\nexport const E = createElement("div", { role: "alert" });`,
			"classic",
		],
		[
			"automatic runtime 의 jsx",
			`import { jsx } from "react/jsx-runtime";\nexport const E = jsx("div", { role: "alert", children: "boom" });`,
			"runtime",
		],
		[
			"automatic runtime 의 jsxs",
			`import { jsxs } from "react/jsx-runtime";\nexport const E = jsxs("div", { role: "alert", children: ["a", "b"] });`,
			"runtime",
		],
		[
			"개발용 runtime 의 jsxDEV",
			`import { jsxDEV } from "react/jsx-dev-runtime";\nexport const E = jsxDEV("div", { role: "alert" });`,
			"runtime",
		],
	];
	for (const [label, code, factory] of elements) {
		it(`${label} 은 요소다`, () => {
			expect(factoryOf(code)).toBe(factory);
		});
	}

	// 반증. 이름이 같아도 다른 데서 온 것은 화면 요소가 아니다. 여기서 참이
	// 되면 게이트가 브라우저 API 호출을 화면으로 세어 과탐지로 곧 꺼진다.
	const notElements: [string, string][] = [
		["document.createElement 는 브라우저 API 다", `export const c = document.createElement("canvas");`],
		[
			"다른 모듈에서 온 같은 이름은 아니다",
			`import { h } from "hyperscript";\nexport const E = h("div", { role: "alert" });`,
		],
		[
			"상대 경로 모듈의 createElement 도 react 가 아니다",
			`import { createElement as h } from "./dom-utils";\nexport const E = h("div", { role: "alert" });`,
		],
		[
			"import 없는 h 는 요소가 아니다",
			`export function F(h: unknown) { return (h as (t: string) => unknown)("div"); }`,
		],
	];
	for (const [label, code] of notElements) {
		it(`반증: ${label}`, () => {
			expect(factoryOf(code)).toBeNull();
		});
	}

	// 옛 판정을 잠근다. 출처를 못 찾은 자유 식별자 `createElement` 는 여전히
	// 요소다 — 모르는 것을 아니라고 단정하면 놓치는 쪽으로 틀린다.
	it("출처를 못 찾은 자유 createElement 는 그대로 요소다", () => {
		expect(factoryOf(`export const E = createElement("div", { role: "alert" });`)).toBe(
			"classic",
		);
	});
});

// jsx/jsxs 는 props 안에 자식을 넣는다. 여기서 읽지 않으면 "화면에 오르는
// 것이 이 알림 하나뿐인가" 판정이 통째로 갈린다.
describe("elementChildren — automatic runtime 은 자식이 props 안에 있다", () => {
	function childrenCount(code: string): number {
		const sf = parse(code);
		const elements = J.jsxElementsIn(sf, sf, null);
		expect(elements.length, "요소를 하나도 찾지 못했다").toBeGreaterThan(0);
		return J.elementChildren(elements[0] as ts.Node, null).length;
	}

	it("jsx 의 children 하나를 자식 하나로 센다", () => {
		expect(
			childrenCount(
				`import { jsx } from "react/jsx-runtime";\nexport const E = jsx("div", { role: "alert", children: "install failed" });`,
			),
		).toBe(1);
	});

	it("jsxs 의 children 배열을 그 수만큼 센다", () => {
		expect(
			childrenCount(
				`import { jsxs } from "react/jsx-runtime";\nexport const E = jsxs("div", { role: "alert", children: ["a", "b"] });`,
			),
		).toBe(2);
	});

	it("공백뿐인 children 은 자식이 아니다", () => {
		expect(
			childrenCount(
				`import { jsxs } from "react/jsx-runtime";\nexport const E = jsxs("div", { children: [" ", "x"] });`,
			),
		).toBe(1);
	});

	it("반증: children 을 props 로만 읽고 자식으로 세지 않으면 0 이 된다", () => {
		expect(
			childrenCount(
				`import { jsx } from "react/jsx-runtime";\nexport const E = jsx("div", { role: "alert", children: "boom" });`,
			),
		).not.toBe(0);
	});

	it("props 목록에는 children 도 그대로 남는다", () => {
		const read = readProps(
			`import { jsx } from "react/jsx-runtime";\nexport const E = jsx("div", { role: "alert", children: "boom" });`,
		);
		expect(names(read).sort()).toEqual(["children", "role"]);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
	});
});

// ── 11회차 지적 2 ──────────────────────────────────────────────────
// 영구 꺼짐 판정이 식별자에서 멈춰 있었다. 같은 모듈의 문자열 후보는 이미
// `obj.id` 를 푸는데, `disabled={FLAGS.off}` 는 열린 버튼으로 읽혔다. React
// 에서 `{ off: true }` 의 `off` 와 `true` 는 둘 다 누를 수 없는 버튼이다.
describe("alwaysTruthy — 속성 접근도 값이다", () => {
	it("const 객체의 속성이 true 면 영구히 꺼진 것이다", () => {
		expect(truthyOf("FLAGS.off", "const FLAGS = { off: true };")).toBe(true);
	});

	it("대괄호로 적은 같은 속성도 같다", () => {
		expect(truthyOf(`FLAGS["off"]`, "const FLAGS = { off: true };")).toBe(true);
	});

	it("두 겹 중첩도 따라간다", () => {
		expect(truthyOf("FLAGS.panel.off", "const FLAGS = { panel: { off: true } };")).toBe(
			true,
		);
	});

	it("`as const` 를 붙여도 뜻은 같다", () => {
		expect(truthyOf("FLAGS.off", "const FLAGS = { off: true } as const;")).toBe(true);
	});

	it("부정한 자리도 대칭이다 — 언제나 거짓인 속성의 부정은 언제나 참이다", () => {
		expect(truthyOf("!FLAGS.on", "const FLAGS = { on: false };")).toBe(true);
	});

	it("import 로 건너간 const 객체도 같은 값이다", () => {
		const { env, file } = environment({
			"app/flags.ts": `export const FLAGS = { off: true };`,
			"app/screen.tsx":
				`import { FLAGS } from "./flags";\nexport const Probe = <button d={FLAGS.off} />;`,
		});
		const sf = file("app/screen.tsx");
		expect(J.alwaysTruthy(attributeValue(sf, "d"), sf, env)).toBe(true);
	});

	// 반증. "모른다" 를 참으로 읽으면 살아 있는 버튼을 죽은 것으로 지운다.
	it("반증: 재대입되는 이름은 따라가지 않는다", () => {
		expect(
			truthyOf("FLAGS.off", "let FLAGS = { off: true };\nFLAGS = { off: false };"),
		).toBe(false);
	});

	it("반증: 값이 변수인 속성은 모른다", () => {
		expect(truthyOf("FLAGS.off", "const FLAGS = { off: flag };")).toBe(false);
	});

	it("반증: 없는 키는 모른다", () => {
		expect(truthyOf("FLAGS.missing", "const FLAGS = { off: true };")).toBe(false);
	});

	it("반증: spread 가 섞여 값을 못 정하면 모른다", () => {
		expect(truthyOf("FLAGS.off", "const FLAGS = { ...base };")).toBe(false);
	});

	it("반증: 거짓인 속성은 영구 꺼짐이 아니다", () => {
		expect(truthyOf("FLAGS.off", "const FLAGS = { off: false };")).toBe(false);
	});

	it("반증: 계산된 키는 모른다", () => {
		expect(truthyOf("FLAGS[key]", "const FLAGS = { off: true };")).toBe(false);
	});
});

/* ─────────────── 12회차에 못 박은 것 ─────────────── */

describe("env 는 선택이 아니다 — 안 넘기면 던진다 (12회차 지적 3)", () => {
	const sf = parse(`export const E = <div role="alert" />;`);

	// 왜 던지는가: 예전에는 안 넘겨도 조용히 같은 파일 안에서만 풀었다. 그래서
	// 게이트 한 곳이 인자 하나를 빠뜨린 것만으로 파일을 건너간 별명이 화면에서
	// 사라졌고, 검사기가 "요소가 아니다" 라고 말한 것이 아니라 아예 못 본 것이라
	// 결함이 초록 안에 숨었다. 침묵을 선언으로 바꾼다.
	const calls: [string, () => unknown][] = [
		["jsxElementsIn", () => (J.jsxElementsIn as (a: ts.Node, b: ts.SourceFile) => unknown)(sf, sf)],
		[
			"isElementNode",
			() => (J.isElementNode as (a: ts.Node) => unknown)(firstElement(sf, null)),
		],
		[
			"isCreateElementCall",
			() => (J.isCreateElementCall as (a: ts.Node) => unknown)(firstElement(sf, null)),
		],
		[
			"elementFactory",
			() => (J.elementFactory as (a: ts.Node) => unknown)(firstElement(sf, null)),
		],
		[
			"elementChildren",
			() => (J.elementChildren as (a: ts.Node) => unknown)(firstElement(sf, null)),
		],
		[
			"elementProps",
			() =>
				(J.elementProps as (a: ts.Node, b: ts.SourceFile) => unknown)(
					firstElement(sf, null),
					sf,
				),
		],
	];

	for (const [name, call] of calls) {
		it(`${name} 은 env 없이 부르면 던진다`, () => {
			expect(call).toThrow(/env/);
		});
	}

	it("파일을 건너가지 않겠다는 뜻은 null 로 적는다", () => {
		// 반증: 여기서도 던지면 "같은 파일 안에서만 본다" 를 적을 방법이 없어
		// 호출자가 아무 env 나 지어내게 된다.
		expect(() => J.jsxElementsIn(sf, sf, null)).not.toThrow();
		expect(J.jsxElementsIn(sf, sf, null).length).toBe(1);
	});
});

describe("createElement.call — argShift 를 적용해야 props 가 읽힌다 (12회차 지적 2)", () => {
	const CALLED = `import { createElement } from "react";
export const Banner = () => createElement.call(null, "div", { role: "alert" }, "install failed");`;
	const DIRECT = `import { createElement } from "react";
export const Banner = () => createElement("div", { role: "alert" }, "install failed");`;

	function shapeOf(code: string): {
		factory: string | null;
		argShift: number;
		argsUnknown: boolean;
	} {
		const sf = parse(code);
		return J.elementCallShape(firstElement(sf, null), null);
	}

	it("`.call` 로 부른 것도 요소이고, 앞자리 하나가 밀렸다고 말한다", () => {
		const shape = shapeOf(CALLED);
		expect(shape.factory).toBe("classic");
		expect(shape.argShift).toBe(1);
	});

	it("밀린 자리에서 읽으면 props 는 곧바로 부른 것과 같다", () => {
		// 반증의 자리: 자리를 안 옮기면 여기서 `"div"` 를 props 로 읽어 속성이
		// 하나도 없게 되고, 막다른 오류 화면이 알림으로도 세어지지 않는다.
		const read = readProps(CALLED);
		expect(names(read)).toEqual(["role"]);
		expect(valueOfProp(read, "role")).toEqual(["alert"]);
		expect(names(read)).toEqual(names(readProps(DIRECT)));
	});

	it("자식도 같은 만큼 밀려서 읽힌다", () => {
		const called = parse(CALLED);
		const direct = parse(DIRECT);
		expect(J.elementChildren(firstElement(called, null), null).length).toBe(1);
		expect(J.elementChildren(firstElement(called, null), null).length).toBe(
			J.elementChildren(firstElement(direct, null), null).length,
		);
	});

	it("`.apply` 는 자리를 믿을 수 없으므로 속성을 모른다로 말한다", () => {
		// "없다" 로 읽으면 인자를 배열 한 겹에 숨기는 것만으로 검사를 통과한다.
		const sf = parse(
			`import { createElement } from "react";\nexport const B = () => createElement.apply(null, ["div", { role: "alert" }]);`,
		);
		const read = J.elementProps(firstElement(sf, null), sf, null);
		expect(read.props.length).toBe(0);
		expect(read.unknownSpread).toBe(true);
	});

	it("쉼표식으로 싼 createElement 도 같은 요소다", () => {
		const sf = parse(
			`import { createElement } from "react";\nexport const B = () => (0, createElement)("div", { role: "alert" });`,
		);
		const read = J.elementProps(firstElement(sf, null), sf, null);
		expect(read.props.map((p) => p.name)).toEqual(["role"]);
	});
});

describe("alwaysTruthy — 삼항은 실제로 도는 갈래로 판정한다 (12회차 지적 1)", () => {
	const UNKNOWN = "declare const cond: boolean;";

	it("조건이 언제나 참이면 참 갈래만 본다", () => {
		// 12회차에 dead-ui 게이트를 뚫은 바로 그 식이다. 실행하면 `true` 이고,
		// React 에서 누를 수 없는 버튼이다. 거짓 갈래를 함께 요구하면 영구히
		// 꺼 둔 조작이 열린 것으로 읽힌다.
		expect(truthyOf("true ? true : false")).toBe(true);
		expect(truthyOf("1 ? \"on\" : false")).toBe(true);
	});

	it("조건이 언제나 거짓이면 거짓 갈래만 본다", () => {
		expect(truthyOf("false ? false : true")).toBe(true);
	});

	// 반증. 여기서 참이 되면 접는 방향이 뒤집힌 것이고, 실행하면 열려 있는
	// 버튼이 영구히 꺼진 것으로 세어져 게이트가 과탐지로 곧 꺼진다.
	it("반증: 조건이 언제나 거짓이면 참 갈래는 근거가 아니다", () => {
		expect(truthyOf("false ? true : false")).toBe(false);
	});

	it("반증: 조건이 언제나 참이면 거짓 갈래는 근거가 아니다", () => {
		expect(truthyOf("true ? false : true")).toBe(false);
	});

	it("조건을 모를 때만 두 갈래가 모두 참이기를 요구한다", () => {
		expect(truthyOf("cond ? true : 1", UNKNOWN)).toBe(true);
		expect(truthyOf("cond ? true : false", UNKNOWN)).toBe(false);
		expect(truthyOf("cond ? false : true", UNKNOWN)).toBe(false);
	});

	it("조건도 `const` 사슬을 따라 접는다", () => {
		expect(truthyOf("off ? true : false", "const off = true;")).toBe(true);
		expect(truthyOf("off ? false : true", "const off = false;")).toBe(true);
	});

	it("삼항은 거짓 쪽도 대칭이다", () => {
		// `alwaysFalsy` 는 내보내지 않으므로 부정으로 묻는다.
		expect(truthyOf("!(true ? false : true)")).toBe(true);
		expect(truthyOf("!(false ? true : false)")).toBe(true);
		expect(truthyOf("!(cond ? false : null)", UNKNOWN)).toBe(true);
		// 반증: 한 갈래가 거짓이 아니면 그 부정은 언제나 참이 아니다.
		expect(truthyOf("!(cond ? false : true)", UNKNOWN)).toBe(false);
	});
});

/* ─────────────── 13회차에 못 박은 것 ─────────────── */

describe("`??` 는 왼쪽이 널인지로 고른다 (13회차 지적 2)", () => {
	it("왼쪽이 정적으로 널이면 오른쪽이 결과다", () => {
		// 13회차에 dead-ui 게이트를 뚫은 식이다. 실행하면 `true` 이고, React
		// 에서 `disabled={null ?? true}` 는 누를 수 없는 버튼이다.
		expect(truthyOf("null ?? true")).toBe(true);
		expect(truthyOf("undefined ?? true")).toBe(true);
		expect(truthyOf("off ?? true", "const off = null;")).toBe(true);
	});

	it("왼쪽이 정적으로 널이 아니면 왼쪽이 결과다", () => {
		// `||` 와 같게 다루지 말라는 반증. 여기서 참이 되면 열린 버튼이 영구히
		// 꺼진 것으로 세어져 게이트가 과탐지로 곧 꺼진다.
		expect(truthyOf("false ?? true")).toBe(false);
		expect(truthyOf("0 ?? true")).toBe(false);
		expect(truthyOf("true ?? false")).toBe(true);
	});

	it("반증: 왼쪽이 널인지 모르면 둘 다 참일 때만 참이다", () => {
		expect(truthyOf("x ?? true", "declare const x: unknown;")).toBe(false);
		expect(truthyOf("x ?? 1", "declare const x: unknown;")).toBe(false);
		expect(truthyOf("(x ? 1 : 2) ?? true", "declare const x: boolean;")).toBe(true);
	});

	it("거짓 쪽도 대칭이다", () => {
		// `alwaysFalsy` 는 내보내지 않으므로 부정으로 묻는다.
		expect(truthyOf("!(null ?? false)")).toBe(true);
		expect(truthyOf("!(false ?? true)")).toBe(true);
		expect(truthyOf("!(x ?? false)", "declare const x: unknown;")).toBe(false);
	});
});

describe("쉼표식은 값 쪽에서도 껍데기다 (13회차 지적 1)", () => {
	it("`(0, true)` 는 언제나 참이다", () => {
		expect(truthyOf("(0, true)")).toBe(true);
		expect(truthyOf("(0, 0, true)")).toBe(true);
	});

	it("반증: 마지막 항이 값이다", () => {
		// 앞의 항을 값으로 읽으면 열린 버튼이 꺼진 것으로 세어진다.
		expect(truthyOf("(true, false)")).toBe(false);
	});

	it("쉼표로 싼 요소도 같은 요소다", () => {
		const sf = parse(
			`export const B = () => (0, (<div role="alert">install failed</div>));`,
		);
		const read = J.elementProps(firstElement(sf, null), sf, null);
		expect(read.props.map((p) => p.name)).toEqual(["role"]);
	});

	it("껍데기 규칙은 이 파일에 없다 — 공용 모듈을 쓴다", () => {
		const text = readFileSync(
			resolve(__dirname, "..", "..", "scripts", "lib", "jsx-static.mjs"),
			"utf8",
		);
		expect(text.includes("unwrap.mjs")).toBe(true);
		expect(text.includes("isParenthesizedExpression")).toBe(false);
	});
});

describe("겹의 수를 세는 자리가 없다 (13회차 지적 4 의 같은 처방)", () => {
	const MODULES = [
		"scripts/lib/jsx-static.mjs",
		"scripts/lib/bindings.mjs",
		"scripts/lib/unwrap.mjs",
	];

	// 깊이 상수는 한계가 아니라 눈금이다 — 상수를 한 겹 더 쌓거나 spread 를 한
	// 겹 더 씌우면 판정이 뒤집힌다. 끝나는 이유는 세는 것이 아니라 같은 자리에
	// 두 번 가지 않는 것이어야 한다.
	for (const rel of MODULES) {
		it(`${rel} 에는 깊이 상수가 없다`, () => {
			const text = readFileSync(resolve(__dirname, "..", "..", rel), "utf8");
			const hits = text.match(/depth\s*[><]=?\s*\d/g) ?? [];
			expect(hits, `${rel} 이 깊이를 센다: ${hits.join(", ")}`).toEqual([]);
			expect(/\bMAX_DEPTH\b/.test(text), `${rel} 에 MAX_DEPTH 가 남아 있다`).toBe(false);
		});
	}

	it("const 사슬 열 겹 뒤의 문자열도 표지로 읽힌다", () => {
		const chain = Array.from(
			{ length: 10 },
			(_, i) => `const n${i} = ${i === 0 ? '"ghost-wake-panel"' : `n${i - 1}`};`,
		).join("\n");
		const sf = parse(`${chain}\nexport const P = <button data-testid={n9} />;`);
		expect(J.stringCandidates(attributeValue(sf, "data-testid"), sf, null).values).toContain(
			"ghost-wake-panel",
		);
	});

	it("파일 여덟 겹을 건너간 표지도 읽힌다", () => {
		// 여기가 진짜 눈금이었다. 같은 파일 안의 사슬은 예전에도 끝까지
		// 따라갔지만, `constValue` 의 깊이는 **파일을 건너뛴 횟수**를 셌다.
		// 네 번을 넘기면 표지가 사라졌고, 그러면 게이트는 "스펙이 기다리는
		// 이름이 셸 소스에 없다" 고 잘못 말한다.
		const files: Record<string, string> = {
			"app/f0.ts": `export const mark = "deep-cross-mark";`,
		};
		for (let i = 1; i < 8; i += 1)
			files[`app/f${i}.ts`] = `import { mark } from "./f${i - 1}";\nexport { mark };`;
		files["app/screen.tsx"] =
			`import { mark } from "./f7";\nexport const P = <button data-testid={mark} />;`;
		const { env, file } = environment(files);
		const screen = file("app/screen.tsx");
		const read = J.stringCandidates(attributeValue(screen, "data-testid"), screen, env);
		expect([...read.values]).toEqual(["deep-cross-mark"]);
		expect(read.complete).toBe(true);
	});

	it("서른 겹도 같다 — 세는 자리가 없다", () => {
		const chain = Array.from(
			{ length: 30 },
			(_, i) => `const m${i} = ${i === 0 ? '"deep-mark"' : `m${i - 1}`};`,
		).join("\n");
		const sf = parse(`${chain}\nexport const P = <button data-testid={m29} />;`);
		expect(J.stringCandidates(attributeValue(sf, "data-testid"), sf, null).values).toContain(
			"deep-mark",
		);
	});

	it("spread 여섯 겹 뒤의 `disabled: true` 도 꺼짐으로 읽힌다", () => {
		const layers = Array.from(
			{ length: 6 },
			(_, i) => `const s${i} = ${i === 0 ? "{ disabled: true }" : `{ ...s${i - 1} }`};`,
		).join("\n");
		const sf = parse(`${layers}\nexport const P = <button {...s5} data-testid="deep" />;`);
		const read = J.elementProps(firstElement(sf, null), sf, null);
		const off = read.props.find((p) => p.name === "disabled");
		expect(off, "여섯 겹 뒤의 disabled 를 못 읽었다").toBeDefined();
		expect(J.alwaysTruthy(off?.value, sf, null)).toBe(true);
	});

	it("순환 const 는 멈추고 모른다로 답한다", () => {
		// `const a = b; const b = a;` — 끝나는 이유가 깊이가 아니라 방문 표시다.
		const sf = parse(
			`const a: string = b;\nconst b: string = a;\nexport const P = <button data-testid={a} />;`,
		);
		const read = J.stringCandidates(attributeValue(sf, "data-testid"), sf, null);
		expect([...read.values]).toEqual([]);
		expect(read.complete).toBe(false);
	});

	it("순환 spread 도 멈춘다", () => {
		const sf = parse(
			`const A: Record<string, unknown> = { ...B };\nconst B: Record<string, unknown> = { ...A };\nexport const P = <button {...A} />;`,
		);
		const read = J.elementProps(firstElement(sf, null), sf, null);
		expect(read.props.length).toBe(0);
	});
});
