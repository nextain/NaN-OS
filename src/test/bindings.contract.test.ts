// `scripts/lib/bindings.mjs` 가 **호출부를 무엇으로 읽는지**를 고정한다.
//
// 왜 이 파일이 있는가: 열한 번의 교차 리뷰에서 거짓 통과가 나온 자리는 거의
// 언제나 판정의 단위가 **적힌 이름**이었던 곳이다. 알림 판정은 `createElement`
// 라는 글자만 요소로 읽어 `import { createElement as h }` 를 놓쳤고, 파괴 판정은
// `invoke` 바인딩까지는 따라갔지만 `invoke.bind(null)` 로 만든 별명을 호출부로
// 세지 않았다. 두 게이트가 각자 자기 파일 안에서 그 구멍을 메우는 동안 리뷰어는
// 매번 아직 안 고친 쪽으로 같은 결함을 넣었다.
//
// 그래서 이 모듈이 답하는 질문은 하나다 — 이 호출식의 callee 는 **어느 모듈의
// 어느 export** 인가. 이름은 답의 일부가 아니다. 여기서 고정하는 것은 그 답이며,
// 계약마다 "이렇게 읽히면 게이트가 뚫린다" 는 반대 값을 함께 못 박는다. 특히
// 다른 모듈에서 온 같은 이름은 같은 바인딩이 아니어야 한다 — 그렇지 않으면
// `hyperscript` 의 `h` 나 브라우저의 `document.createElement` 가 화면 요소로
// 세어져 게이트가 과탐지로 곧 꺼진다.
//
// 모듈은 `.mjs` ESM 이라 정적 import 로는 이 tsconfig(rootDir=src)의 범위를
// 벗어난다. 파일 URL 로 동적 import 해서 실제 산출물 그대로를 태운다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
	resolve(__dirname, "..", "..", "scripts", "lib", "bindings.mjs"),
).href;

interface Env {
	has(path: string): boolean;
	sourceFile(path: string): ts.SourceFile | null;
	resolve(from: string, spec: string): string | null;
}

/** 지역 이름이 무엇을 가져온 것인지. `imported` 가 판정의 축이다. */
type ImportRecord = { module: string; imported: string; kind: string };

/**
 * 호출부가 가리키는 바인딩.
 *
 * `argShift` 는 호출부 인자 중 대상 함수의 것이 아닌 앞자리 수, `argsUnknown`
 * 은 인자 자리를 신뢰하면 안 된다는 표시다. 인자를 보고 판정하는 게이트가
 * 이것을 "그 인자가 없다" 로 읽으면, 인자를 한 겹 미리 먹이는 것만으로
 * 검사를 통과하는 자리가 생긴다.
 */
type Binding = {
	module: string | null;
	imported: string | null;
	/** 모듈이 아니라 전역에서 온 것. `fetch` 가 그것이다. */
	global?: string;
	local: string | null;
	via: string;
	boundArgs: number;
	argShift?: number;
	argsUnknown?: boolean;
};

interface Bindings {
	importBindings(sf: ts.SourceFile): Map<string, ImportRecord>;
	/** 모듈 바인딩을 만드는 선언인가 — `import …` 와 `import x = …` 두 종. */
	isModuleBindingDeclaration(node: ts.Node): boolean;
	/** 모듈 지정자의 패키지 이름. 저장소 안 파일이면 null. */
	packageOf(specifier: string): string | null;
	isModuleOfPackage(module: string, packages: Set<string>): boolean;
	resolveBinding(
		expr: ts.Node,
		sf: ts.SourceFile,
		env?: Env,
		seen?: Set<string>,
	): Binding | null;
	resolveCallee(node: ts.Node, sf?: ts.SourceFile, env?: Env): Binding | null;
	bindingIsOneOf(
		binding: Binding | null,
		modules: Set<string>,
		names: Set<string>,
	): boolean;
}

const B = (await import(/* @vite-ignore */ MODULE_URL)) as Bindings;

const UNWRAP_URL = pathToFileURL(
	resolve(__dirname, "..", "..", "scripts", "lib", "unwrap.mjs"),
).href;

interface Unwrap {
	unwrapExpression(node: ts.Node | undefined): ts.Node | null;
}

const U = (await import(/* @vite-ignore */ UNWRAP_URL)) as Unwrap;

const HOME = "app/screen.ts";

function parse(code: string, file: string = HOME): ts.SourceFile {
	return ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** 파일 사이를 따라가는 환경. 실제 파일을 만들지 않고 메모리 지도로 만든다. */
function environment(files: Record<string, string>): {
	env: Env;
	file(path: string): ts.SourceFile;
} {
	const parsed = new Map<string, ts.SourceFile>();
	const map = new Map(Object.entries(files));
	const env: Env = {
		has: (path) => map.has(path),
		sourceFile(path) {
			if (!map.has(path)) return null;
			if (!parsed.has(path)) parsed.set(path, parse(map.get(path) as string, path));
			return parsed.get(path) as ts.SourceFile;
		},
		resolve(from, spec) {
			if (!spec.startsWith(".")) return null;
			const stack: string[] = [];
			const base = from.split("/").slice(0, -1).join("/");
			for (const part of `${base}/${spec}`.split("/")) {
				if (part === "." || part === "") continue;
				if (part === "..") stack.pop();
				else stack.push(part);
			}
			const path = stack.join("/").replace(/\.[jt]sx?$/, "");
			for (const candidate of [`${path}.tsx`, `${path}.ts`, `${path}/index.ts`]) {
				if (map.has(candidate)) return candidate;
			}
			return null;
		},
	};
	return {
		env,
		file(path: string): ts.SourceFile {
			const sf = env.sourceFile(path);
			expect(sf, `${path} 가 환경에 없다`).not.toBeNull();
			return sf as ts.SourceFile;
		},
	};
}

/** 그 이름으로 부르는 첫 호출식. 판정은 이 자리에 대고 한다. */
function callTo(sf: ts.SourceFile, name: string): ts.CallExpression {
	let hit: ts.CallExpression | undefined;
	const walk = (node: ts.Node): void => {
		if (hit) return;
		if (ts.isCallExpression(node) && node.expression.getText(sf).replace(/\s+/g, "") === name)
			hit = node;
		else ts.forEachChild(node, walk);
	};
	walk(sf);
	expect(hit, `${name}(...) 호출을 찾지 못했다`).not.toBeUndefined();
	return hit as ts.CallExpression;
}

function calleeOf(code: string, callee: string, env?: Env, sf?: ts.SourceFile): Binding | null {
	const tree = sf ?? parse(code);
	return B.resolveCallee(callTo(tree, callee), tree, env);
}

describe("importBindings — 지역 이름이 무엇을 가져온 것인가", () => {
	it("named import 는 그 export 이름으로 온다", () => {
		const map = B.importBindings(parse(`import { invoke } from "@tauri-apps/api/core";`));
		expect(map.get("invoke")).toEqual({
			module: "@tauri-apps/api/core",
			imported: "invoke",
			kind: "named",
		});
	});

	it("별명은 지역 이름과 export 이름이 다르다", () => {
		const map = B.importBindings(parse(`import { createElement as h } from "react";`));
		// 판정의 축은 `imported` 다. 지역 이름으로 판정하면 별명 한 줄로 뚫린다.
		expect(map.get("h")).toEqual({ module: "react", imported: "createElement", kind: "named" });
		expect(map.has("createElement")).toBe(false);
	});

	it("default 와 namespace 는 따로 표시된다", () => {
		const map = B.importBindings(
			parse(`import React from "react";\nimport * as core from "@tauri-apps/api/core";`),
		);
		expect(map.get("React")?.imported).toBe("default");
		expect(map.get("core")?.imported).toBe("*");
	});

	it("반증: type-only 든 아니든 이름은 같은 자리에 온다 — 없는 이름은 없다", () => {
		const map = B.importBindings(parse(`import { invoke } from "@tauri-apps/api/core";`));
		expect(map.get("tauriInvoke")).toBeUndefined();
	});
});

describe("resolveCallee — 호출부는 이름이 아니라 바인딩이다", () => {
	const cases: [string, string, string, string, string][] = [
		[
			"직접 부른 named import",
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = invoke("memory_delete_fact");`,
			"invoke",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"별명 붙인 named import",
			`import { invoke as tauriInvoke } from "@tauri-apps/api/core";\nexport const r = tauriInvoke("memory_delete_fact");`,
			"tauriInvoke",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"namespace import 의 멤버",
			`import * as core from "@tauri-apps/api/core";\nexport const r = core.invoke("memory_delete_fact");`,
			"core.invoke",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"default import 의 멤버",
			`import React from "react";\nexport const E = React.createElement("div");`,
			"React.createElement",
			"react",
			"createElement",
		],
		[
			"같은 파일 const 별명",
			`import { invoke } from "@tauri-apps/api/core";\nconst call = invoke;\nexport const r = call("memory_delete_fact");`,
			"call",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"bind 로 만든 별명",
			`import { invoke } from "@tauri-apps/api/core";\nconst call = invoke.bind(null);\nexport const r = call("memory_delete_fact");`,
			"call",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"별명의 별명",
			`import { invoke } from "@tauri-apps/api/core";\nconst once = invoke.bind(null);\nconst call = once;\nexport const r = call("memory_delete_fact");`,
			"call",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"구조분해로 꺼낸 멤버",
			`import * as core from "@tauri-apps/api/core";\nconst { invoke } = core;\nexport const r = invoke("memory_delete_fact");`,
			"invoke",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"호출부에서 곧바로 call",
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = invoke.call(null, "memory_delete_fact");`,
			"invoke.call",
			"@tauri-apps/api/core",
			"invoke",
		],
		[
			"namespace 멤버를 bind 한 별명",
			`import * as core from "@tauri-apps/api/core";\nconst call = core.invoke.bind(null);\nexport const r = call("memory_delete_fact");`,
			"call",
			"@tauri-apps/api/core",
			"invoke",
		],
	];
	for (const [label, code, callee, module, imported] of cases) {
		it(`${label} 은 같은 바인딩이다`, () => {
			const binding = calleeOf(code, callee);
			expect(binding?.module).toBe(module);
			expect(binding?.imported).toBe(imported);
		});
	}

	it("상대 경로로 건너간 별명도 원래 모듈로 온다", () => {
		const { env, file } = environment({
			"app/ipc.ts": `import { invoke } from "@tauri-apps/api/core";\nexport const call = invoke.bind(null);`,
			"app/screen.ts": `import { call } from "./ipc";\nexport const r = call("memory_delete_fact");`,
		});
		const binding = calleeOf("", "call", env, file("app/screen.ts"));
		expect(binding?.module).toBe("@tauri-apps/api/core");
		expect(binding?.imported).toBe("invoke");
	});

	// 반증. 같은 이름이면 같은 것이라고 읽는 순간, 이름을 바꾸는 것만으로
	// 판정이 갈리고 이름이 같은 남의 것까지 끌려 들어온다.
	it("반증: 다른 모듈에서 온 같은 이름은 같은 바인딩이 아니다", () => {
		const binding = calleeOf(
			`import { invoke } from "./our-ipc-shim";\nexport const r = invoke("memory_delete_fact");`,
			"invoke",
		);
		expect(binding?.module).toBe("./our-ipc-shim");
		expect(binding?.module).not.toBe("@tauri-apps/api/core");
	});

	// 선언이 없는 자유 식별자는 **전역**이다(12회차 지적 6). 그래도 모듈
	// 바인딩은 아니다 — 여기서 `module` 이 채워지면, 어디서 왔는지 모르는
	// 이름이 남의 모듈 export 로 세어진다.
	it("반증: 어디서도 오지 않은 이름은 어느 모듈의 것도 아니다", () => {
		const binding = calleeOf(`export const r = invoke("memory_delete_fact");`, "invoke");
		expect(binding?.module).toBeNull();
		expect(binding?.imported).toBeNull();
		expect(binding?.global).toBe("invoke");
	});

	it("반증: named import 객체의 속성은 그 모듈의 export 가 아니다", () => {
		// `core` 는 `x` 가 내보낸 **객체**다. `core.invoke` 를 `x` 의 export
		// `invoke` 로 읽으면, 이름이 같다는 이유로 남의 함수가 판정에 걸린다.
		expect(
			calleeOf(`import { core } from "x";\nexport const r = core.invoke("k");`, "core.invoke"),
		).toBeNull();
	});

	it("반증: 부른 결과를 다시 부르는 것은 모른다", () => {
		expect(
			calleeOf(
				`import { makeClient } from "x";\nconst call = makeClient();\nexport const r = call("k");`,
				"call",
			),
		).toBeNull();
	});

	it("반증: 재대입되는 이름은 따라가지 않는다", () => {
		expect(
			calleeOf(
				`import { invoke } from "@tauri-apps/api/core";\nlet call = invoke;\ncall = other;\nexport const r = call("k");`,
				"call",
			),
		).toBeNull();
	});

	it("반증: bind 를 부르는 것 자체는 호출부가 아니다", () => {
		// `invoke.bind(null)` 은 함수를 만들 뿐 부르지 않는다. 이것을 호출로
		// 읽으면 인자 자리가 통째로 어긋난다.
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nexport const call = invoke.bind(null);`,
			"invoke.bind",
		);
		expect(binding).toBeNull();
	});
});

describe("인자 자리 — 모르는 것을 없다고 읽지 않는다", () => {
	it("직접 호출은 인자가 그대로다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = invoke("memory_delete_fact");`,
			"invoke",
		);
		expect(binding?.argShift).toBe(0);
		expect(binding?.argsUnknown).toBe(false);
	});

	it("call 로 부르면 앞자리 하나가 this 다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = invoke.call(null, "memory_delete_fact");`,
			"invoke.call",
		);
		expect(binding?.argShift).toBe(1);
	});

	it("apply 는 인자 자리를 모른다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = invoke.apply(null, ["memory_delete_fact"]);`,
			"invoke.apply",
		);
		expect(binding?.imported).toBe("invoke");
		expect(binding?.argsUnknown).toBe(true);
	});

	it("인자를 미리 먹인 bind 도 인자 자리를 모른다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nconst wipe = invoke.bind(null, "memory_delete_fact");\nexport const r = wipe({ factId: "x" });`,
			"wipe",
		);
		expect(binding?.imported).toBe("invoke");
		expect(binding?.boundArgs).toBe(1);
		// 반증: 여기서 거짓이면 게이트가 첫 인자를 명령 이름으로 읽고, 명령을
		// bind 로 미리 먹이는 것만으로 파괴 호출이 목록에서 사라진다.
		expect(binding?.argsUnknown).toBe(true);
	});

	it("this 만 먹인 bind 는 인자가 그대로다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nconst call = invoke.bind(null);\nexport const r = call("memory_delete_fact");`,
			"call",
		);
		expect(binding?.boundArgs).toBe(0);
		expect(binding?.argsUnknown).toBe(false);
	});
});

describe("bindingIsOneOf — 판정을 한 줄로 적는다", () => {
	const REACT = new Set(["react", "preact"]);
	const FACTORIES = new Set(["createElement", "h"]);

	it("모듈과 이름이 둘 다 맞아야 참이다", () => {
		const binding = calleeOf(
			`import { createElement as h } from "react";\nexport const E = h("div");`,
			"h",
		);
		expect(B.bindingIsOneOf(binding, REACT, FACTORIES)).toBe(true);
	});

	it("반증: 모듈이 다르면 거짓이다", () => {
		const binding = calleeOf(`import { h } from "hyperscript";\nexport const E = h("div");`, "h");
		expect(B.bindingIsOneOf(binding, REACT, FACTORIES)).toBe(false);
	});

	it("반증: 못 푼 바인딩은 거짓이다", () => {
		expect(B.bindingIsOneOf(null, REACT, FACTORIES)).toBe(false);
	});
});

/* ─────────────── 12회차에 못 박은 것 ─────────────── */

describe("unwrap — 껍데기를 벗기는 자리는 하나다 (12회차 지적 5)", () => {
	it("쉼표식으로 싼 callee 는 마지막 항이 부르는 값이다", () => {
		// `(0, f)()` 는 가져온 함수를 this 없이 부르는 흔한 호출이다. 여기서
		// 벗기지 않으면 파괴 게이트와 알림 게이트가 같은 자리에서 따로 뚫린다.
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nexport const r = (0, invoke)("memory_delete_fact");`,
			"(0,invoke)",
		);
		expect(binding?.module).toBe("@tauri-apps/api/core");
		expect(binding?.imported).toBe("invoke");
	});

	it("괄호·as·non-null 을 겹쳐 싸도 같은 바인딩이다", () => {
		const binding = calleeOf(
			`import { createElement } from "react";\nexport const E = ((0, createElement) as never)!("div");`,
			"((0,createElement)asnever)!",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("반증: 쉼표의 마지막 항이 다른 것이면 다른 바인딩이다", () => {
		// 마지막 항만 값이다. 왼쪽 항을 값으로 읽으면 아무 이름이나 끌려온다.
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nimport { h } from "hyperscript";\nexport const r = (invoke, h)("div");`,
			"(invoke,h)",
		);
		expect(binding?.module).toBe("hyperscript");
		expect(binding?.module).not.toBe("@tauri-apps/api/core");
	});
});

describe("전역 바인딩 — `fetch` 는 어느 모듈에서도 오지 않는다 (12회차 지적 6)", () => {
	const outbound = (code: string, callee: string): string | undefined =>
		calleeOf(code, callee)?.global;

	it("선언 없는 자유 식별자는 그 이름의 전역이다", () => {
		expect(outbound(`export const r = fetch("https://x/y");`, "fetch")).toBe("fetch");
	});

	it("const 별명은 같은 전역이다", () => {
		// 이것이 12회차에 결정론 칸을 뚫은 형태다 — 이름은 `ghostGet` 이지만
		// 부르는 값은 그대로 `fetch` 다.
		expect(
			outbound(`const ghostGet = fetch;\nexport const r = ghostGet("https://x/y");`, "ghostGet"),
		).toBe("fetch");
	});

	it("전역 뿌리의 멤버도 같은 전역이다", () => {
		expect(outbound(`export const r = globalThis.fetch("https://x");`, "globalThis.fetch")).toBe(
			"fetch",
		);
		expect(outbound(`export const r = window["fetch"]("https://x");`, 'window["fetch"]')).toBe(
			"fetch",
		);
	});

	it("전역 뿌리에서 구조분해한 이름도 같은 전역이다", () => {
		expect(
			outbound(`const { fetch: f } = globalThis;\nexport const r = f("https://x");`, "f"),
		).toBe("fetch");
	});

	it("`.call` 로 불러도 같은 전역이고, 인자는 한 칸 밀린다", () => {
		const binding = calleeOf(`export const r = fetch.call(null, "https://x");`, "fetch.call");
		expect(binding?.global).toBe("fetch");
		expect(binding?.argShift).toBe(1);
	});

	it("반증: 이 파일에 선언이 있는 이름은 전역이 아니다", () => {
		// 이름이 같다는 이유로 남의 함수를 바깥 통신으로 세면, 게이트는 곧
		// 과탐지로 꺼진다.
		expect(
			calleeOf(`function fetch(u: string) {\n\treturn u;\n}\nexport const r = fetch("https://x");`, "fetch"),
		).toBeNull();
	});

	it("반증: 전역은 모듈 바인딩이 아니다", () => {
		const binding = calleeOf(`export const r = fetch("https://x");`, "fetch");
		expect(B.bindingIsOneOf(binding, new Set(["react"]), new Set(["fetch"]))).toBe(false);
	});
});

describe("재수출 — 파일 하나를 건너가도 원래 모듈을 잃지 않는다 (12회차 지적 3)", () => {
	const SCREEN = "app/screen.tsx";

	function through(shim: string): Binding | null {
		const { env, file } = environment({
			"app/shim.ts": shim,
			[SCREEN]: `import { ghostCreate } from "./shim";\nexport const E = ghostCreate("div", { role: "alert" });`,
		});
		return calleeOf("", "ghostCreate", env, file(SCREEN));
	}

	it("`export const y = x` 를 따라간다", () => {
		const binding = through(
			`import { createElement } from "react";\nexport const ghostCreate = createElement;`,
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`export { x as y } from \"mod\"` 를 따라간다", () => {
		const binding = through(`export { createElement as ghostCreate } from "react";`);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`export { x as y }` (같은 파일 이름 재수출) 를 따라간다", () => {
		const binding = through(
			`import { createElement as h } from "react";\nexport { h as ghostCreate };`,
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`export * from \"mod\"` 는 이름을 그대로 지나보낸다", () => {
		const { env, file } = environment({
			"app/shim.ts": `export * from "react";`,
			[SCREEN]: `import { createElement } from "./shim";\nexport const E = createElement("div");`,
		});
		const binding = calleeOf("", "createElement", env, file(SCREEN));
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("재수출을 두 파일 건너가도 따라간다", () => {
		const { env, file } = environment({
			"app/react-shim.ts": `export { createElement as ghostCreate } from "react";`,
			"app/shim.ts": `export { ghostCreate } from "./react-shim";`,
			[SCREEN]: `import { ghostCreate } from "./shim";\nexport const E = ghostCreate("div");`,
		});
		const binding = calleeOf("", "ghostCreate", env, file(SCREEN));
		expect(binding?.module).toBe("react");
	});

	it("반증: env 를 안 넘기면 파일을 건너가지 못해 shim 에서 멈춘다", () => {
		// 게이트가 `env` 를 빠뜨리면 정확히 이렇게 읽힌다 — `./shim` 의
		// `ghostCreate` 는 react 의 `createElement` 가 아니다.
		const { file } = environment({
			"app/shim.ts": `export { createElement as ghostCreate } from "react";`,
			[SCREEN]: `import { ghostCreate } from "./shim";\nexport const E = ghostCreate("div");`,
		});
		const binding = calleeOf("", "ghostCreate", undefined, file(SCREEN));
		expect(binding?.module).toBe("./shim");
		expect(binding?.module).not.toBe("react");
	});
});

describe("argShift — 호출자는 자리를 옮겨야 한다 (12회차 지적 2)", () => {
	it("`.call` 은 앞자리 하나가 this 다", () => {
		const binding = calleeOf(
			`import { createElement } from "react";\nexport const E = createElement.call(null, "div", { role: "alert" }, "failed");`,
			"createElement.call",
		);
		expect(binding?.argShift).toBe(1);
		expect(binding?.argsUnknown).toBe(false);
	});

	it("`.apply` 는 인자 자리를 아예 믿을 수 없다", () => {
		const binding = calleeOf(
			`import { createElement } from "react";\nexport const E = createElement.apply(null, ["div", { role: "alert" }]);`,
			"createElement.apply",
		);
		expect(binding?.argsUnknown).toBe(true);
	});

	it("반증: 곧바로 부른 호출은 자리가 밀리지 않는다", () => {
		// 여기서 `argShift` 가 0 이 아니면 멀쩡한 요소의 props 를 한 칸 밀어
		// 읽는다. 옮기라는 규칙은 옮길 때만 옮기라는 규칙이기도 하다.
		const binding = calleeOf(
			`import { createElement } from "react";\nexport const E = createElement("div", { role: "alert" });`,
			"createElement",
		);
		expect(binding?.argShift).toBe(0);
		expect(binding?.argsUnknown).toBe(false);
	});
});

/* ─────────────── 13회차에 못 박은 것 ─────────────── */

describe("껍데기 벗기기는 저장소에 한 벌뿐이다 (13회차 지적 1)", () => {
	const SOURCES = [
		"scripts/lib/bindings.mjs",
		"scripts/lib/jsx-static.mjs",
		"scripts/check-silent-clicks.mjs",
	];

	// 12회차는 쉼표식을 `bindings.mjs` 에서만 닫았다. 값 쪽 껍데기는 두 벌이 더
	// 있었고, 그래서 `(0, true)` 는 영구히 꺼 둔 버튼이 아니었고
	// `(0, el.click())` 은 클릭이 아니었다. 규칙이 여러 벌이면 구멍도 여러 번
	// 막아야 하고, 리뷰어는 매번 안 고친 쪽으로 넣는다.
	for (const rel of SOURCES) {
		it(`${rel} 에는 자기 껍데기 벗기기가 없다`, () => {
			const text = readFileSync(resolve(__dirname, "..", "..", rel), "utf8");
			// 껍데기를 직접 판별하는 술어가 있으면 그 파일이 자기 규칙을 든 것이다.
			for (const marker of [
				"isParenthesizedExpression",
				"isAsExpression",
				"isNonNullExpression",
				"isSatisfiesExpression",
				"TypeAssertionExpression",
				"isCommaListExpression",
			]) {
				expect(text.includes(marker), `${rel} 이 ${marker} 를 직접 본다`).toBe(false);
			}
			expect(text.includes("unwrap.mjs"), `${rel} 이 공용 모듈을 안 쓴다`).toBe(true);
		});
	}

	it("공용 모듈은 쉼표식의 마지막 항을 값으로 준다", () => {
		const sf = parse(`export const v = (0, 1, "kept");`);
		const decl = sf.statements[0] as ts.VariableStatement;
		const init = decl.declarationList.declarations[0]?.initializer as ts.Node;
		const value = U.unwrapExpression(init) as ts.Node;
		expect(ts.isStringLiteral(value) && value.text).toBe("kept");
	});

	it("반증: 값을 바꾸는 것은 껍데기가 아니다", () => {
		// `await x`·`void x`·`!x` 를 여기서 벗기면 뜻이 달라진다. 필요한 게이트가
		// 자기 자리에서 따로 다룬다.
		const sf = parse(`export const v = void 0;`);
		const decl = sf.statements[0] as ts.VariableStatement;
		const init = decl.declarationList.declarations[0]?.initializer as ts.Node;
		expect(ts.isVoidExpression(U.unwrapExpression(init) as ts.Node)).toBe(true);
	});

	it("겹의 수를 세지 않는다 — 괄호 서른 겹도 같은 값이다", () => {
		const wrapped = `${"(".repeat(30)}"kept"${")".repeat(30)}`;
		const sf = parse(`export const v = ${wrapped};`);
		const decl = sf.statements[0] as ts.VariableStatement;
		const init = decl.declarationList.declarations[0]?.initializer as ts.Node;
		const value = U.unwrapExpression(init) as ts.Node;
		expect(ts.isStringLiteral(value) && value.text).toBe("kept");
	});
});

describe("default 재수출도 이름이다 (13회차 지적 3)", () => {
	const SCREEN = "app/screen.tsx";

	function throughDefault(shim: string, importLine: string, callee: string): Binding | null {
		const { env, file } = environment({
			"app/shim.ts": shim,
			[SCREEN]: `${importLine}\nexport const E = ${callee}("div", { role: "alert" });`,
		});
		return calleeOf("", callee, env, file(SCREEN));
	}

	it("`export default createElement` 를 따라간다", () => {
		const binding = throughDefault(
			`import { createElement } from "react";\nexport default createElement;`,
			`import ghostCreate from "./shim";`,
			"ghostCreate",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`export { createElement as default }` 를 따라간다", () => {
		const binding = throughDefault(
			`import { createElement } from "react";\nexport { createElement as default };`,
			`import ghostCreate from "./shim";`,
			"ghostCreate",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`export { x as default } from \"mod\"` 를 따라간다", () => {
		const binding = throughDefault(
			`export { createElement as default } from "react";`,
			`import ghostCreate from "./shim";`,
			"ghostCreate",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("네임스페이스로 가져온 멤버도 그 파일의 export 로 이어 푼다", () => {
		// `import * as R from "./shim"` 뒤의 `R.createElement` 는 shim 이
		// 재수출한 react 의 것이다. 네임스페이스 한 겹으로 판정이 갈리면
		// 같은 화면이 요소가 아니게 된다.
		const { env, file } = environment({
			"app/shim.ts": `export * from "react";`,
			[SCREEN]: `import * as R from "./shim";\nexport const E = R.createElement("div");`,
		});
		const binding = calleeOf("", "R.createElement", env, file(SCREEN));
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("반증: 저장소 밖 모듈의 default 는 그 모듈의 default 로 남는다", () => {
		// `react` 자신은 파일로 풀리지 않는다. 그때까지 지어내면 남의 모듈
		// export 를 안다고 말하는 것이다.
		const binding = calleeOf(
			`import R from "react";\nexport const E = R("div");`,
			"R",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("default");
	});
});

describe("겹의 수는 한계가 아니다 (13회차 지적 4)", () => {
	function chain(depth: number): Binding | null {
		const names = Array.from({ length: depth }, (_, i) => `n${i}`);
		const lines = names.map(
			(name, i) => `const ${name} = ${i === 0 ? "createElement" : names[i - 1]};`,
		);
		const last = names[names.length - 1] as string;
		return calleeOf(
			`import { createElement } from "react";\n${lines.join("\n")}\nexport const E = ${last}("div");`,
			last,
		);
	}

	it("별명 열 겹도 같은 바인딩이다", () => {
		expect(chain(10)?.module).toBe("react");
		expect(chain(10)?.imported).toBe("createElement");
	});

	it("서른 겹도 같다 — 세는 자리가 없다", () => {
		// 숫자 한계는 "몇 겹을 더 쌓으면 통과하는가" 를 알려 주는 눈금이었다.
		expect(chain(30)?.imported).toBe("createElement");
	});

	it("순환 별명은 멈추고 모른다로 답한다", () => {
		// `const a = b; const b = a;` — 끝나는 이유는 깊이를 세는 것이 아니라
		// (파일, 이름)을 두 번 지나지 않는 것이다.
		expect(
			calleeOf(`const a: unknown = b;\nconst b: unknown = a;\nexport const E = (a as never)("div");`, "(aasnever)"),
		).toBeNull();
	});

	it("파일을 건너가는 순환도 멈추고, 없는 모듈을 지어내지 않는다", () => {
		// 두 파일이 서로를 재수출한다. 답은 "그 파일의 그 이름" 에서 멈춰야
		// 하고, 그 너머를 지어내면 안 된다. 멈추지 않으면 게이트가 통째로
		// 돌지 않는다.
		const { env, file } = environment({
			"app/one.ts": `import { x } from "./two";\nexport const y = x;`,
			"app/two.ts": `import { y } from "./one";\nexport const x = y;`,
			"app/screen.tsx": `import { y } from "./one";\nexport const E = (y as never)("div");`,
		});
		const binding = calleeOf("", "(yasnever)", env, file("app/screen.tsx"));
		expect(binding?.module).toBe("./one");
		expect(binding?.module).not.toBe("react");
	});
});

/* ─────────────── 15회차에 못 박은 것 ─────────────── */

describe("`export * as ns from \"mod\"` 도 재수출이다 (15회차 지적 1)", () => {
	const SCREEN = "app/screen.tsx";

	it("이름 있는 네임스페이스 재수출의 멤버가 원래 모듈까지 간다", () => {
		const { env, file } = environment({
			"app/shim.ts": `export * as GhostReact from "react";`,
			[SCREEN]: `import { GhostReact } from "./shim";\nexport const E = GhostReact.createElement("div");`,
		});
		const binding = calleeOf("", "GhostReact.createElement", env, file(SCREEN));
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("저장소 안 파일을 가리키는 네임스페이스 재수출도 따라간다", () => {
		const { env, file } = environment({
			"app/core.ts": `import { invoke } from "@tauri-apps/api/core";\nexport { invoke };`,
			"app/shim.ts": `export * as ghostCore from "./core";`,
			[SCREEN]: `import { ghostCore } from "./shim";\nexport const R = ghostCore.invoke("cmd");`,
		});
		const binding = calleeOf("", "ghostCore.invoke", env, file(SCREEN));
		expect(binding?.module).toBe("@tauri-apps/api/core");
		expect(binding?.imported).toBe("invoke");
	});

	it("반증: 재수출 형태가 달라도 답은 같아야 한다", () => {
		// 판정의 단위가 `export *` 와 `export { … }` 두 문법이면, 형태 한 겹만
		// 바꿔 알림·꺼짐·파괴가 같이 열린다.
		const viaNamed = (() => {
			const { env, file } = environment({
				"app/shim.ts": `export { createElement as GhostReact } from "react";`,
				[SCREEN]: `import { GhostReact } from "./shim";\nexport const E = GhostReact("div");`,
			});
			return calleeOf("", "GhostReact", env, file(SCREEN));
		})();
		expect(viaNamed?.module).toBe("react");
		expect(viaNamed?.imported).toBe("createElement");
	});
});

describe("모듈 바인딩을 만드는 선언은 두 종이다 (15회차 지적 8)", () => {
	it("`ImportDeclaration` 과 `ImportEqualsDeclaration` 만 그 술어를 만족한다", () => {
		const sf = parse(
			`import { a } from "x";\nimport h = require("react");\nconst c = 1;\nexport { a };`,
		);
		const kinds = sf.statements.map((s) => B.isModuleBindingDeclaration(s));
		expect(kinds).toEqual([true, true, false, false]);
	});

	it("`import h = require(\"react\")` 는 그 모듈 전체다", () => {
		const map = B.importBindings(parse(`import h = require("react");`));
		expect(map.get("h")?.module).toBe("react");
		expect(map.get("h")?.imported).toBe("*");
	});

	it("그 이름의 멤버는 그 모듈의 export 다", () => {
		const binding = calleeOf(
			`import h = require("react");\nexport const E = h.createElement("div");`,
			"h.createElement",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("`import x = ns.member` 는 그 이름을 다시 푼다", () => {
		const binding = calleeOf(
			`import * as R from "react";\nimport mk = R.createElement;\nexport const E = mk("div");`,
			"mk",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("반증: 그 이름은 전역이 아니다", () => {
		// 선언을 못 보면 자유 식별자로 읽혀 전역이 된다. 그러면 요소 판정이
		// 통째로 갈린다.
		const binding = calleeOf(`import h = require("react");\nexport const E = h("div");`, "h");
		expect(binding?.global).toBeUndefined();
		expect(binding?.module).toBe("react");
	});

	it("지정자가 리터럴이면 동적 `require()` 호출도 그 모듈이다", () => {
		// 17회차에 경계를 좁혔다. 소스에 모듈 이름이 그대로 적혀 있으면 정적
		// 선언과 다를 것이 없다 — 셸의 지연 로딩이 그 꼴이다.
		const binding = calleeOf(
			`const h = require("react");\nexport const E = h.createElement("div");`,
			"h.createElement",
		);
		expect(binding?.module).toBe("react");
		expect(binding?.imported).toBe("createElement");
	});

	it("반증: 지정자를 실행할 때 정하면 여전히 모른다", () => {
		expect(
			calleeOf(
				`declare const spec: string;\nconst h = require(spec);\nexport const E = h.createElement("div");`,
				"h.createElement",
			),
		).toBeNull();
	});
});

/* ─────────────── 16회차에 못 박은 것 ─────────────── */

describe("구조분해 키는 적힌 형태와 무관하다 (16회차 지적 2)", () => {
	function importedOf(pattern: string): string | null | undefined {
		return calleeOf(
			`import * as React from "react";\nconst ${pattern} = React;\nexport const E = ghostCreate("div");`,
			"ghostCreate",
		)?.imported;
	}

	it("식별자 키·문자열 키·계산된 리터럴 키가 같은 속성이다", () => {
		expect(importedOf("{ createElement: ghostCreate }")).toBe("createElement");
		expect(importedOf('{ "createElement": ghostCreate }')).toBe("createElement");
		expect(importedOf('{ ["createElement"]: ghostCreate }')).toBe("createElement");
	});

	it("반증: 못 읽는 키는 지역 이름으로 떨어뜨리지 않는다", () => {
		// 모르는 것을 아는 이름으로 바꿔 읽으면, 지역 이름이 export 이름이 되어
		// 남의 모듈 export 가 걸려 든다.
		expect(
			calleeOf(
				`import * as React from "react";\ndeclare const key: string;\nconst { [key]: ghostCreate } = React;\nexport const E = ghostCreate("div");`,
				"ghostCreate",
			),
		).toBeNull();
	});

	it("named import 의 문자열 키도 같다", () => {
		const map = B.importBindings(
			parse(`import { "createElement" as ghostCreate } from "react";`),
		);
		expect(map.get("ghostCreate")?.imported).toBe("createElement");
	});
});

/* ─────────────── 17회차에 못 박은 것 ─────────────── */

describe("모듈 대조는 패키지 이름이다 (17회차 지적 5)", () => {
	it("하위 경로가 붙어도 같은 패키지다", () => {
		expect(B.packageOf("@tauri-apps/api/core")).toBe("@tauri-apps/api");
		expect(B.packageOf("@tauri-apps/api/core.js")).toBe("@tauri-apps/api");
		expect(B.packageOf("@tauri-apps/api/core/index.js")).toBe("@tauri-apps/api");
		expect(B.packageOf("react/index.js")).toBe("react");
	});

	it("반증: 저장소 안 파일은 패키지가 아니다", () => {
		expect(B.packageOf("./shim")).toBeNull();
		expect(B.packageOf("../lib/logger")).toBeNull();
		expect(B.packageOf("/abs/path")).toBeNull();
	});

	it("반증: 이름이 비슷한 다른 패키지는 아니다", () => {
		expect(B.packageOf("react-dom")).toBe("react-dom");
		expect(B.isModuleOfPackage("react-dom", new Set(["react"]))).toBe(false);
	});
});

describe("공용 모듈이 흡수한 두 형태 (17회차 지적 6)", () => {
	it("지정자가 리터럴인 동적 import 는 그 모듈이다", () => {
		const binding = calleeOf(
			`export async function w() {\n const { invoke } = await import("@tauri-apps/api/core");\n return invoke("cmd");\n}`,
			"invoke",
		);
		expect(binding?.module).toBe("@tauri-apps/api/core");
		expect(binding?.imported).toBe("invoke");
	});

	it("그 구조분해의 문자열·계산된 리터럴 키도 같다", () => {
		for (const key of ['"invoke": g', '["invoke"]: g']) {
			const binding = calleeOf(
				`export async function w() {\n const { ${key} } = await import("@tauri-apps/api/core");\n return g("cmd");\n}`,
				"g",
			);
			expect(binding?.imported, `${key} 를 못 읽었다`).toBe("invoke");
		}
	});

	it("반증: 지정자가 리터럴이 아니면 여전히 모른다", () => {
		expect(
			calleeOf(
				`declare const spec: string;\nexport async function w() {\n const { invoke } = await import(spec);\n return invoke("cmd");\n}`,
				"invoke",
			),
		).toBeNull();
	});

	it("객체 리터럴로 만든 네임스페이스의 멤버를 따라간다", () => {
		const binding = calleeOf(
			`import { invoke } from "@tauri-apps/api/core";\nconst ns = { invoke };\nexport const r = ns.invoke("cmd");`,
			"ns.invoke",
		);
		expect(binding?.module).toBe("@tauri-apps/api/core");
		expect(binding?.imported).toBe("invoke");
	});

	it("그 객체의 문자열·계산된 리터럴 키도 같다", () => {
		for (const key of ['"invoke": invoke', '["invoke"]: invoke']) {
			const binding = calleeOf(
				`import { invoke } from "@tauri-apps/api/core";\nconst ns = { ${key} };\nexport const r = ns.invoke("cmd");`,
				"ns.invoke",
			);
			expect(binding?.imported, `${key} 를 못 읽었다`).toBe("invoke");
		}
	});

	it("반증: 배열을 거쳐 흘러간 함수는 여전히 모른다", () => {
		expect(
			calleeOf(
				`import { invoke } from "@tauri-apps/api/core";\nconst fns = [invoke];\nexport const r = fns[0]("cmd");`,
				"fns[0]",
			),
		).toBeNull();
	});
});

describe("파괴 게이트는 자기 해석을 들지 않는다 (17회차 지적 5·6)", () => {
	const gate = readFileSync(
		resolve(__dirname, "..", "..", "scripts", "check-destructive-affordance.mjs"),
		"utf8",
	);

	it("import·구조분해·모듈 문자열 해석 코드가 없다", () => {
		// 같은 해석이 두 벌이면 형제 모듈에서 고친 것이 옮겨 오지 않는다 —
		// 실제로 그 이유로 같은 결함이 두 번 났다.
		// 주석은 뺀다 — 왜 그렇게 했는지 적은 문장까지 금지할 이유는 없다.
		const code = gate
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
		for (const marker of [
			"isImportDeclaration",
			"isNamedImports",
			"isNamespaceImport",
			"isObjectBindingPattern",
			"importClause",
			"@tauri-apps/api/",
			"INVOKE_MODULES",
		])
			expect(code.includes(marker), `파괴 게이트가 ${marker} 를 직접 본다`).toBe(false);
		// 패키지 **이름**은 이 게이트의 것이다 — "Tauri 의 invoke 란 무엇인가" 는
		// 이 게이트가 정의한다. 금지하는 것은 하위 경로가 붙은 **모듈 경로
		// 문자열**이다. 그 형태가 곧 17회차에 뚫린 자리다.
		expect(code.includes('"@tauri-apps/api"'), "패키지 이름은 여기 있어야 한다").toBe(true);
		expect(code.includes("importBindings"), "import 는 공용 모듈로 읽어야 한다").toBe(true);
	});

	it("호출부 판정을 공용 모듈에 맡긴다", () => {
		expect(gate.includes("resolveCallee")).toBe(true);
		expect(gate.includes("isModuleOfPackage")).toBe(true);
	});

	it("Cargo.toml 을 읽는 코드가 없다", () => {
		// 명령 목록을 뽑는 게이트가 둘이다. 뿌리를 정하는 판단이 두 벌이면
		// 한쪽에서 닫은 구멍이 다른 쪽에 그대로 남는다(19회차 지적 6).
		const code = gate
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
		for (const marker of ["Cargo.toml", "parseToml", "localCrateReferences", "existsSync"])
			expect(code.includes(marker), `파괴 게이트가 ${marker} 를 직접 본다`).toBe(false);
		expect(code.includes("crate-roots.mjs"), "공용 뿌리 모듈을 안 쓴다").toBe(true);
	});

	it("겹의 수를 세는 자리가 없다", () => {
		// 감싸기 고정점이 여섯 바퀴만 돌았다. 그런 숫자는 한계가 아니라
		// "몇 겹 더 쌓으면 통과하는가" 를 알려 주는 눈금이다 — 13·14회차에
		// 별명 깊이·상수 사슬·`void` 겹에서 없앤 것과 같은 종류다. 끝나는
		// 이유는 이름 집합이 **더 자라지 않는 것**이어야 한다.
		const code = gate
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
		expect(/round\s*<\s*\d/.test(code), "고정점이 바퀴 수를 센다").toBe(false);
		expect(/\bMAX_[A-Z_]*\b/.test(code), "게이트에 한계 상수가 있다").toBe(false);
		const loops = code.match(/for\s*\([^;]*;[^;<]*<\s*\d+/g) ?? [];
		expect(loops, `게이트가 겹을 센다: ${loops.join(", ")}`).toEqual([]);
	});

	it("이 게이트만의 보탬은 감싸기 함수 하나뿐이다", () => {
		// 고정점이 키우는 이름 집합은 여기 남는다 — 그것은 바인딩이 아니라
		// 이 게이트가 정의하는 개념이다.
		expect(/function wrapperOffset\(/.test(gate)).toBe(true);
		expect(gate.includes("aliasFromDeclaration")).toBe(false);
		expect(gate.includes("invokeAliasOffset")).toBe(false);
	});
});

/* ─────────────── 18회차에 못 박은 것 ─────────────── */

describe("동적 모듈 지정자도 접어서 읽는다 (18회차 지적 5)", () => {
	function moduleOf(code: string, callee = "invoke"): string | null | undefined {
		return calleeOf(code, callee)?.module;
	}

	it("템플릿 지정자도 리터럴과 같다", () => {
		expect(
			moduleOf(
				"export async function w() {\n const { invoke } = await import(`@tauri-apps/api/core`);\n return invoke('cmd');\n}",
			),
		).toBe("@tauri-apps/api/core");
	});

	it("이어 붙인 지정자도 같다", () => {
		expect(
			moduleOf(
				`export async function w() {\n const { invoke } = await import("@tauri-apps/api" + "/core");\n return invoke("cmd");\n}`,
			),
		).toBe("@tauri-apps/api/core");
	});

	it("`const` 사슬을 지나서도 같다", () => {
		expect(
			moduleOf(
				`const CORE = "@tauri-apps/api/core";\nexport async function w() {\n const { invoke } = await import(CORE);\n return invoke("cmd");\n}`,
			),
		).toBe("@tauri-apps/api/core");
	});

	it("반증: 실행할 때 정해지는 지정자는 여전히 모른다", () => {
		expect(
			calleeOf(
				`declare const spec: string;\nexport async function w() {\n const { invoke } = await import(spec);\n return invoke("cmd");\n}`,
				"invoke",
			),
		).toBeNull();
	});

	it("접는 범위는 공용 평가기 하나다", () => {
		const source = readFileSync(
			resolve(__dirname, "..", "..", "scripts", "lib", "bindings.mjs"),
			"utf8",
		);
		expect(source.includes("static-eval.mjs")).toBe(true);
		// 반증: 자기 평가기를 다시 들면 형제 모듈에서 고친 것이 옮겨 오지 않는다.
		expect(/function\s+staticValue\s*\(/.test(source)).toBe(false);
	});
});
