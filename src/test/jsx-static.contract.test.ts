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
	elementProps(node: ts.Node, sf: ts.SourceFile, env?: Env): ElementProps;
	elementChildren(node: ts.Node): ts.Node[];
	jsxElementsIn(node: ts.Node, sf: ts.SourceFile): ts.Node[];
	stringCandidates(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env): Candidates;
	staticChunks(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env): string[];
	alwaysTruthy(node: ts.Node | undefined, sf: ts.SourceFile, env?: Env): boolean;
	typeStrings(node: ts.TypeNode | undefined, sf: ts.SourceFile, env?: Env): Candidates;
	isCreateElementCall(node: ts.Node): boolean;
	isElementNode(node: ts.Node): boolean;
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
	return J.stringCandidates(node, sf, undefined);
}

function valuesOf(source: string, prelude = ""): string[] {
	return [...candidatesOf(source, prelude).values].sort();
}

function chunksOf(source: string, prelude = ""): string[] {
	const { sf, node } = probe(source, prelude);
	return J.staticChunks(node, sf, undefined).sort();
}

/** 식 하나를 `<button d={…} />` 로 감싸 영구 참 판정을 묻는다. */
function truthyOf(source: string, prelude = ""): boolean {
	const sf = parse(`${prelude}\nexport const Probe = <button d={${source}} />;`);
	return J.alwaysTruthy(attributeValue(sf, "d"), sf, undefined);
}

function firstElement(sf: ts.SourceFile): ts.Node {
	const elements = J.jsxElementsIn(sf, sf);
	expect(elements.length, "요소를 하나도 찾지 못했다").toBeGreaterThan(0);
	return elements[0] as ts.Node;
}

type ReadProps = ElementProps & { sf: ts.SourceFile };

function readProps(code: string, env?: Env, sf?: ts.SourceFile): ReadProps {
	const tree = sf ?? parse(code);
	return { ...J.elementProps(firstElement(tree), tree, env), sf: tree };
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

	it("React.createElement 도 같다", () => {
		const read = readProps(`export const E = React.createElement("div", { role: "alert" });`);
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
		expect(J.staticChunks(node, sf, undefined)).toContain("panel ");
		expect(J.stringCandidates(node, sf, undefined).complete).toBe(false);
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
		expect(J.alwaysTruthy(attributeValue(sf, "d"), sf, undefined)).toBe(false);
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
			expect(J.jsxElementsIn(sf, sf).length).toBe(1);
		});
	}

	it("createElement 호출 자체가 요소다", () => {
		const sf = parse(`export function F() { return createElement("div", null, "hi"); }`);
		const elements = J.jsxElementsIn(sf, sf);
		expect(elements.length).toBe(1);
		expect(J.isCreateElementCall(elements[0] as ts.Node)).toBe(true);
		expect(J.isElementNode(elements[0] as ts.Node)).toBe(true);
	});

	it("자식의 `{cond && …}` 안에 있는 요소도 열거된다", () => {
		const sf = parse(`export function F() { return (<div>{c && <A />}</div>); }`);
		const elements = J.jsxElementsIn(sf, sf);
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
		const elements = J.jsxElementsIn(sf, sf);
		expect(elements.length).not.toBe(1);
		expect(J.elementChildren(elements[0] as ts.Node).length).toBe(1);
	});

	it("형제가 둘이면 자식 수가 둘이다 — 알림이 화면 전부가 아닌 자리", () => {
		const sf = parse(`export function F() { return (<div><A /><B /></div>); }`);
		const elements = J.jsxElementsIn(sf, sf);
		expect(elements.length).toBe(3);
		expect(J.elementChildren(elements[0] as ts.Node).length).toBe(2);
		expect(J.elementChildren(elements[0] as ts.Node).length).not.toBe(1);
	});

	it("공백만 있는 JSX 텍스트는 자식으로 세지 않는다", () => {
		const sf = parse(`export function F() { return (\n\t<div>\n\t\t<A />\n\t</div>\n); }`);
		const outer = J.jsxElementsIn(sf, sf)[0] as ts.Node;
		expect(J.elementChildren(outer).length).toBe(1);
	});

	it("Fragment 는 요소로 세지 않는다 — 화면에 아무것도 붙이지 않는다", () => {
		const sf = parse(`export function F() { return (<><A /><B /></>); }`);
		const elements = J.jsxElementsIn(sf, sf);
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
		const outer = J.jsxElementsIn(sf, sf)[0] as ts.Node;
		expect(J.elementChildren(outer).length).toBe(1);
		// 반증: 들여쓰기 한 칸을 형제로 세면 같은 화면을 createElement 로 적었을
		// 때만 "자식이 하나뿐인가" 판정이 뒤집혀, 막다른 알림이 빠져나간다.
		expect(J.elementChildren(outer).length).not.toBe(2);
	});

	it("같은 화면을 JSX 로 적어도 자식 수가 같다", () => {
		const sf = parse(`export const E = (\n\t<div>\n\t\t<b>x</b>\n\t</div>\n);`);
		const outer = J.jsxElementsIn(sf, sf)[0] as ts.Node;
		expect(J.elementChildren(outer).length).toBe(1);
	});

	it("글자가 있는 createElement 자식은 그대로 센다", () => {
		const sf = parse(`export const E = createElement("div", null, "install failed");`);
		const outer = J.jsxElementsIn(sf, sf)[0] as ts.Node;
		expect(J.elementChildren(outer).length).toBe(1);
	});
});
