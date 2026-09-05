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
	module: string;
	imported: string;
	local: string | null;
	via: string;
	boundArgs: number;
	argShift?: number;
	argsUnknown?: boolean;
};

interface Bindings {
	importBindings(sf: ts.SourceFile): Map<string, ImportRecord>;
	resolveBinding(expr: ts.Node, sf: ts.SourceFile, env?: Env, depth?: number): Binding | null;
	resolveCallee(node: ts.Node, sf?: ts.SourceFile, env?: Env): Binding | null;
	bindingIsOneOf(
		binding: Binding | null,
		modules: Set<string>,
		names: Set<string>,
	): boolean;
}

const B = (await import(/* @vite-ignore */ MODULE_URL)) as Bindings;

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

	it("반증: 어디서도 오지 않은 이름은 모른다", () => {
		expect(calleeOf(`export const r = invoke("memory_delete_fact");`, "invoke")).toBeNull();
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
