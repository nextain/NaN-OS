/**
 * 앱에서 렌더되지 않는 화면을 검사하는 테스트를 잡는다.
 *
 * 왜 필요한가: 화면이 사라져도 그것을 검사하던 스펙은 남는다. 그 스펙은
 * 사라진 요소를 기다리다 시간을 다 쓰고 실패하는데, 그 실패는 "회귀가
 * 생겼다" 로 읽힌다. 실제로는 재는 대상이 없어진 것이다. 둘을 구별하지
 * 못하면 배포 판단이 흐려지고, 붉은 것이 상수가 되어 사람이 게이트를 끈다.
 *
 * 이 저장소에서 실제로 세 번 있었다.
 *   - 음성 깨우기 화면이 삭제됐는데(코드에 "UI + handlers deleted" 라고
 *     적혀 있다) 스펙 둘이 남아 그 화면을 기다렸다
 *   - Agents 탭이 옮겨 갔는데 스펙 넷이 옛 자리를 순서로 집고 있었다
 *   - 그 옮겨 간 자리(NaiaMetaArea)마저 앱 어디에서도 렌더되지 않는 죽은
 *     컴포넌트였다
 *
 * 무엇을 재는가: 스펙이 `data-testid` / `data-*-tab` 으로 집는 이름이 셸
 * 소스 어딘가에 실제로 있는지. 없으면 그 스펙은 없는 것을 기다린다.
 *
 * 무엇을 재지 않는가: 요소가 있어도 그 화면에 도달할 수 있는지는 정적으로
 * 알 수 없다. 렌더되지 않는 컴포넌트 안의 요소는 여기서 살아 있는 것으로
 * 보인다 — 그것은 실행이 잡는다.
 *
 * **없어야 한다고 단정하는 자리는 세지 않는다.** `toHaveCount(0)` 처럼 그
 * 요소가 사라졌음을 확인하는 테스트가 있고, 그런 자리는 소스에 이름이 없는
 * 것이 정상이다. 그것까지 결함으로 세면 게이트가 옳은 테스트를 지우라고
 * 말하게 된다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const SHELL = "packages/shell";

/** 스펙이 요소를 집는 방식 중 소스와 대조할 수 있는 것. */
/**
 * 스펙이 요소를 집는 방식.
 *
 * 처음에는 대괄호 셀렉터만 봤다. 그래서 같은 결함을 `getByTestId("...")` 나
 * `querySelector(".voice-wake-panel")` 로 적으면 세지도 않았다. 실제 스펙에서
 * 쓰는 형태를 세어 보면 `querySelector` 가 가장 많다.
 */
const ANCHORS = [
	/\[data-testid=["']([\w-]+)["']\]/g,
	/\[data-([\w-]+)-tab=["']([\w-]+)["']\]/g,
	/(?:getByTestId|findByTestId)\(\s*["'`]([\w-]+)["'`]/g,
];

/**
 * 소스에 없어도 두는 이름. 왜 없어도 되는지 적어야 한다.
 */
const ALLOWED_ABSENT = new Map();

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

/**
 * 주석과 문자열 리터럴을 지운 셸 소스.
 *
 * 주석을 남겨 두면 "지웠다" 는 기록이 곧 "살아 있다" 는 증거가 된다 — 화면을
 * 지우면서 그 사실을 주석으로 적는 것은 정상 습관이므로, 이 게이트가 잡으려는
 * 사고가 그대로 통과했다. 실제로 `// removed: the old "ghost-wake-panel"` 한
 * 줄이면 그 화면을 기다리는 스펙이 초록이 됐다.
 *
 * 문자열은 남긴다 — `data-testid="..."` 자체가 문자열이기 때문이다.
 */
const sourceText = [
	...tracked(`${SHELL}/src`, ".tsx"),
	...tracked(`${SHELL}/src`, ".ts"),
]
	.filter((f) => !/\.test\.|__tests__/.test(f))
	.map((f) =>
		readFileSync(f, "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
			.replace(/(^|[^:])\/\/[^\n]*/g, "$1 "),
	)
	.join("\n");

/**
 * 이름을 만들어 붙이는 자리만 모은다.
 *
 * `data-testid={...}`, `id={...}`, `getByTestId(...)` 처럼 식별자를 정하는
 * 문맥이다. 소스 전체에서 찾으면 관계없는 문자열이 접두사를 가로챈다.
 */
const identifierContexts = [
	...sourceText.matchAll(
		/(?:data-testid|id|htmlFor|data-[\w-]+)\s*=\s*\{([^}]*\{[^}]*\}[^}]*|[^}]*)\}/g,
	),
]
	.map((match) => match[0])
	.concat(
		[...sourceText.matchAll(/(?:getByTestId|findByTestId)\s*\(([^)]*)\)/g)].map(
			(match) => match[0],
		),
	);

/**
 * 코드가 조립해 넣는 표지 값의 후보.
 *
 * `data-meta-tab={tab.id}` 처럼 값이 변수로 들어가는 자리는 문자열로 만날 수
 * 없다. 다만 그 후보는 거의 언제나 리터럴 표로 적혀 있다
 * (`{ id: "progress", ... }`). 그 표에서 값을 모은다. 못 찾으면 그 이름은
 * 화면에 없는 것이다.
 */
let assembledCache = null;
function assembledValues() {
	if (assembledCache) return assembledCache;
	assembledCache = assembledInFile;
	return assembledCache;
}

/** Rust 가 프런트에 내주는 명령 이름 전부. */
function tauriCommandNames() {
	const names = new Set();
	for (const file of tracked(`${SHELL}/src-tauri/src`, ".rs")) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(
			/#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+([a-z0-9_]+)/g,
		)) {
			names.add(match[1]);
		}
	}
	return names;
}

/**
 * 지금 없는 채로 두는 명령. 왜 없는지 적어야 한다.
 *
 * 둘 다 스펙만 남고 구현이 없는 자리다. 지우거나 만들거나 둘 중 하나인데,
 * 그 판단은 그 기능을 아는 사람이 해야 한다.
 */
const KNOWN_MISSING_COMMANDS = new Map([
	[
		"e2e_emit_bgm_play_request",
		"93-radio-bgm-observation 이 부른다. e2e 전용 명령으로 만들려다 만 것으로 보인다",
	],
	["discord_api", "70-channel-sync-dm 이 부른다. 이름이 바뀌었을 수 있다"],
]);

/**
 * 영구히 꺼 둔 조작을 누르려는 스펙.
 *
 * 요소가 소스에 있다는 것과 사용자가 거기 도달할 수 있다는 것은 다른
 * 질문이다. 실측에서 드러났다 — 92-discord-secure-cancel 은 connections
 * 탭을 누른 뒤 그 패널을 30초 기다리는데, 그 탭은 `disabled` 가 조건 없이
 * 박혀 있고 라벨에 "곧 제공" 이 붙어 있다. 기능을 일부러 안 낸 상태인데
 * 스펙은 매번 30초를 쓰고 실패한다. 두 기계에서 똑같이 그랬다.
 *
 * 조건부 `disabled={...}` 는 상태에 따라 열리므로 여기서 보지 않는다.
 * 값 없이 박힌 `disabled` 만 영구로 본다.
 */
function permanentlyDisabledTestIds(files) {
	const out = new Map();
	for (const [file, text] of files) {
		const attrs = jsxAttributes(parseSource(file, text));
		// 같은 여는 태그 안에 있는 속성끼리 묶는다. 파서가 준 시작 위치로
		// 가르면 태그 문자열을 다시 쪼갤 필요가 없다.
		const tags = new Map();
		const tree = parseSource(file, text);
		const visit = (node) => {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
				const own = node.attributes.properties.filter((a) =>
					ts.isJsxAttribute(a),
				);
				const off = attrs.filter((a) =>
					own.some((o) => o.getStart(tree) === a.at),
				);
				if (off.length) tags.set(node.getStart(tree), off);
			}
			ts.forEachChild(node, visit);
		};
		visit(tree);
		for (const group of tags.values()) {
			// 값 없는 `disabled`, `{true}`, `{true as const}`, `"true"` 는 모두
			// 영구히 꺼진 것이다. 형태가 아니라 뜻으로 본다.
			if (!group.some((a) => a.name === "disabled" && a.alwaysTrue)) continue;
			for (const a of group) {
				if (!/^data-(?:testid|app-id|[\w-]*tab)$/.test(a.name)) continue;
				if (a.value) out.set(a.value, true);
			}
		}
	}
	return out;
}

/** 셸 소스 파일과 그 내용. 파서에게 물을 때 쓴다. */
const shellFiles = [
	...tracked(`${SHELL}/src`, ".tsx"),
	...tracked(`${SHELL}/src`, ".ts"),
]
	.filter((f) => !/\.test\.|__tests__/.test(f))
	.map((f) => [f, readFileSync(f, "utf8")]);

const disabledIds = permanentlyDisabledTestIds(shellFiles);

/** 저장소가 아는 파일. `existsSync` 는 git 이 모르는 파일도 참이다. */
const trackedFiles = new Set(
	execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean),
);

/**
 * 패키지로 배포되는 앱. 빌드가 실제로 묶는 것만 본다 — 소스에 표식 파일이
 * 있다는 것과 그 앱이 배포된다는 것은 다른 사실이다.
 */
const packagedApps = new Set(
	[...trackedFiles]
		.filter((f) => /\/apps\/[^/]+\/package-public\//.test(f))
		.map((f) => /\/apps\/([^/]+)\/package-public\//.exec(f)?.[1])
		.filter(Boolean),
);

/**
 * 지금 꺼 둔 채로 두는 조작. 왜 스펙이 남아 있는지 적어야 한다.
 */
const KNOWN_DISABLED = new Map([
	[
		"connections",
		"설정의 연결 탭. 라벨이 \"곧 제공\" 이고 disabled 가 조건 없이 박혀 있다. 92-discord-secure-cancel 이 이 탭을 눌러 패널을 기다리므로 매번 30초를 쓰고 실패한다. 기능을 낼지 스펙을 접을지는 오너 결정이다",
	],
]);

/**
 * 렌더되지 않는 파일에만 있는 표지.
 *
 * 표지가 소스에 있다는 것과 그 표지가 화면에 오른다는 것은 다른 질문이다.
 * 실측에서 드러났다 — `coding-workers-toggle` 은 WorkspaceCenterArea.tsx
 * 에 멀쩡히 있는데, 그 파일(1,986줄)은 Herdr 통합 뒤로 값으로 import 되는
 * 곳이 하나도 없다. 타입만 쓰인다. 그래서 두 기계에서 똑같이 30초를 기다린
 * 뒤 실패했고, 기존 검사는 "소스에 있으니 살아 있다" 고 말했다.
 *
 * 판정은 단순하게 한다. 컴포넌트를 내보내는 파일이 다른 파일에서 값으로
 * import 되지 않으면 그 파일은 화면에 오르지 않는다. 진입점(App.tsx 등)과
 * 테스트는 빼고 본다.
 */
/**
 * 소스를 파서로 읽는다.
 *
 * 아홉 번째까지 이 파일의 지적이 매번 같은 모양이었다 — 내가 문법 형태를
 * 하나씩 열거하고, 리뷰어가 하나를 더 찾는다. `data-testid="x"` 를 막으면
 * `{"x"}` 로, 그것을 막으면 `` {`x`} `` 로, 다시 `{"x" as const}` 로 온다.
 * `import type` 을 막으면 `typeof import()` 로, `type _ =` 로, 줄바꿈으로 온다.
 *
 * 형태를 세는 한 이 경주는 끝나지 않는다. 파서에게 물으면 형태가 아니라
 * **뜻**을 묻게 된다 — 이 속성의 값이 정적 문자열인가, 이 import 가 타입
 * 자리인가. 6회차에 check-vacuous-tests 에서 얻은 교훈을 여기 늦게 적용한다.
 */
function parseSource(file, text) {
	return ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		/\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
}

/** 정적으로 값이 정해지는 문자열이면 그 값. 아니면 null. */
function staticString(node) {
	if (!node) return null;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return node.text;
	if (ts.isJsxExpression(node)) return staticString(node.expression);
	// `"x" as const`, `"x" as string` — 값은 그대로다.
	if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node))
		return staticString(node.expression);
	if (ts.isParenthesizedExpression(node)) return staticString(node.expression);
	return null;
}

/** 템플릿의 정적 조각들. `${...}` 는 값이 정해지지 않으므로 뺀다. */
function staticChunks(node) {
	if (!node) return [];
	if (ts.isJsxExpression(node)) return staticChunks(node.expression);
	if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
		return staticChunks(node.expression);
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return [node.text];
	if (ts.isTemplateExpression(node))
		return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
	return [];
}

/** 값으로 끌어오는 import 의 대상. 타입 자리는 뺀다. */
function valueImportSpecifiers(tree) {
	const out = [];
	const visit = (node) => {
		// `import("x")` 가 **타입 자리**면 ImportTypeNode 다. 값 자리면
		// CallExpression 이다. 파서가 이미 갈라 준다 — 줄 머리를 볼 필요가 없다.
		if (ts.isImportTypeNode(node)) return;
		if (ts.isImportDeclaration(node)) {
			const clause = node.importClause;
			const spec = node.moduleSpecifier;
			if (!ts.isStringLiteral(spec)) return;
			// 부작용 import(절이 없다)는 값으로 끌어온다.
			if (!clause) {
				out.push(spec.text);
				return;
			}
			if (clause.isTypeOnly) return;
			const named = clause.namedBindings;
			if (
				!clause.name &&
				named &&
				ts.isNamedImports(named) &&
				named.elements.length > 0 &&
				named.elements.every((e) => e.isTypeOnly)
			)
				return;
			out.push(spec.text);
			return;
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length > 0 &&
			ts.isStringLiteral(node.arguments[0])
		) {
			out.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return out;
}

/** JSX 속성을 뜻으로 읽는다. */
function jsxAttributes(tree) {
	const found = [];
	const visit = (node) => {
		if (ts.isJsxAttribute(node) && node.name && ts.isIdentifier(node.name)) {
			found.push({
				name: node.name.text,
				value: staticString(node.initializer),
				chunks: staticChunks(node.initializer),
				// 값이 없는 `disabled` 와 `disabled={true}`·`{true as const}` 는
				// 모두 영구히 꺼진 것이다. 형태가 아니라 뜻으로 본다.
				alwaysTrue:
					node.initializer === undefined ||
					isTrueLiteral(node.initializer) ||
					staticString(node.initializer) === "true",
				at: node.getStart(tree),
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(tree);
	return found;
}

function isTrueLiteral(node) {
	if (!node) return false;
	if (ts.isJsxExpression(node)) return isTrueLiteral(node.expression);
	if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
		return isTrueLiteral(node.expression);
	return node.kind === ts.SyntaxKind.TrueKeyword;
}

function unreachableFiles() {
	const files = [
		...tracked(`${SHELL}/src`, ".tsx"),
		...tracked(`${SHELL}/src`, ".ts"),
	].filter((f) => !/\.test\.|__tests__/.test(f));
	// 주석을 지운다. `// import { X } from "./X"` 한 줄로 고아 파일을
	// 살려 낼 수 있었다.
	const code = new Map(
		files.map((f) => [
			f,
			readFileSync(f, "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
				.replace(/(^|[^:])\/\/[^\n]*/g, "$1 "),
		]),
	);

	/** 이 파일이 값으로 끌어오는 파일들. */
	const edges = new Map();
	for (const [file, source] of code) {
		const out = new Set();
		// import 간선은 파서에게 묻는다. 형태를 열거하면 `typeof import()`,
		// `as import()`, 줄 나눈 `type _ =` 처럼 끝없이 하나씩 더 온다.
		// 파서는 타입 자리의 `import()` 를 ImportTypeNode 로 따로 준다.
		for (const spec of valueImportSpecifiers(parseSource(file, source))) {
			if (!spec.startsWith(".")) continue;
			out.add(resolveImport(file, spec, code));
		}
		edges.set(file, [...out].filter(Boolean));
	}

	// 진입점에서 닿는 파일만 살아 있다. 예전에는 "누군가 import 하는가" 를
	// 물었는데, 그러면 **죽은 부모의 자식**이 살아 있는 것으로 셌다 —
	// CodingWorkersApp 이 그랬다. 물어야 할 것은 도달 가능성이다.
	// 진입점. `main`·`App` 말고 앱 등록 파일도 진입점이다 — 슬라이드처럼
	// 패키지로 묶여 런타임에 매니페스트로 올라오는 앱은 정적 import 사슬에
	// 나타나지 않는다. 그것을 못 보면 살아 있는 화면을 죽었다고 말한다.
	// 앱 등록 파일도 뿌리이지만 **아무 것이나** 뿌리로 세면 안 된다.
	// 디렉터리가 남아 있다는 것과 앱이 등록된다는 것은 다른 사실이다 —
	// App.tsx 는 `sample-note app removed` 라고 적고 그 부작용 import 를
	// 뺐는데, 디렉터리 이름만으로 그 화면이 살아났다.
	//
	// 뿌리로 세는 것은 패키지로 묶여 런타임 매니페스트로 올라오는 앱뿐이다.
	// 그 표식은 `package-public/app.json` 이다. 정적으로 등록되는 앱은
	// App.tsx 의 import 사슬에서 저절로 닿는다.
	const roots = files.filter((f) => {
		if (/\/(?:main|App)\.tsx?$/.test(f)) return true;
		const app = /^(.*\/apps\/[^/]+)\/(?:index|standalone)\.tsx?$/.exec(f);
		if (!app) return false;
		// 표식 파일이 **있기만** 하면 뿌리로 세면 안 된다. `existsSync` 는 git
		// 이 모르는 파일도 참이라, 추적되지 않는 app.json 한 줄로 App 이 끊은
		// 앱이 되살아났다. 저장소가 아는 파일이어야 하고, 그것만으로도
		// 부족하다 — 런타임 설치 앱은 `~/.naia/apps` 의 매니페스트로 올라오지
		// 소스 트리의 package-public 으로 올라오지 않는다.
		//
		// 그래서 조건을 둘로 둔다. 저장소가 아는 표식이 있고, **그 앱이
		// 패키지로 배포되도록 빌드에 묶여 있어야** 한다.
		const manifest = `${app[1]}/package-public/app.json`;
		if (!trackedFiles.has(manifest)) return false;
		return packagedApps.has(app[1].split("/").pop());
	});
	const reachable = new Set();
	const stack = [...roots];
	while (stack.length) {
		const file = stack.pop();
		if (!file || reachable.has(file)) continue;
		reachable.add(file);
		for (const next of edges.get(file) ?? []) stack.push(next);
	}
	if (roots.length === 0 || reachable.size < 20) {
		console.error(
			`[dead-ui] 진입점에서 닿는 파일이 ${reachable.size}개뿐이다 — import 해석이 깨졌다`,
		);
		process.exit(2);
	}
	return files.filter((f) => !reachable.has(f));
}

/** 상대 import 를 실제 파일 경로로 맞춘다. */
function resolveImport(from, spec, code) {
	const base = from.split("/").slice(0, -1).join("/");
	const parts = `${base}/${spec}`.split("/");
	const stack = [];
	for (const part of parts) {
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
		if (code.has(candidate)) return candidate;
	}
	return null;
}

const unrendered = new Set(unreachableFiles());

/** 표지가 어느 파일에서 정의되는지. 렌더 여부를 표지에 잇기 위해서다. */
const definedIn = new Map();
/** 클래스 이름 → 그것을 붙이는 파일들. */
const classDefinedIn = new Map();
/** 조립 표지의 값 후보 → 그것을 적어 둔 파일들. */
const assembledInFile = new Map();
for (const file of [
	...tracked(`${SHELL}/src`, ".tsx"),
	...tracked(`${SHELL}/src`, ".ts"),
].filter((f) => !/\.test\.|__tests__/.test(f))) {
	const source = readFileSync(file, "utf8");
	// `data-meta-tab` 처럼 이 목록에 없던 속성은 정의 파일에 이어지지 않아
	// 렌더 검사를 통째로 비껴갔다. 표지로 쓰는 data 속성을 모두 본다.
	// `data-testid="x"` 와 JSX 식 `data-testid={"x"}` 를 함께 본다. 식으로
	// 적으면 정의 파일이 이어지지 않아 고아 판정을 통째로 비껴갔다.
	// 표지·클래스·꺼짐을 파서로 읽는다. 정규식으로는 `{"x"}`, `` {`x`} ``,
	// `{"x" as const}` 처럼 같은 뜻의 형태가 끝없이 나오고, 매 회차 그중
	// 하나가 지적으로 돌아왔다.
	const attributes = jsxAttributes(parseSource(file, source));
	for (const attr of attributes) {
		if (!/^data-(?:testid|app-id|[\w-]*tab)$/.test(attr.name)) continue;
		if (attr.value) {
			if (!definedIn.has(attr.value)) definedIn.set(attr.value, new Set());
			definedIn.get(attr.value).add(file);
		}
	}
	// 조립해 넣는 표지(`data-meta-tab={tab.id}`)의 값 후보는 그 파일 안의
	// 리터럴 표에서만 찾는다. 저장소 전체에서 찾으면 관계없는 모듈의 `id:`
	// 한 줄이 존재하지도 않는 탭을 살려 준다.
	const hasAssembledTab = attributes.some(
		(attr) => /^data-[\w-]*tab$/.test(attr.name) && !attr.value,
	);
	if (hasAssembledTab) {
		for (const m of source.matchAll(/\b(?:id|key):\s*["']([\w-]+)["']/g)) {
			if (!definedIn.has(m[1])) definedIn.set(m[1], new Set());
			definedIn.get(m[1]).add(file);
			if (!assembledInFile.has(m[1])) assembledInFile.set(m[1], new Set());
			assembledInFile.get(m[1]).add(file);
		}
	}
	// 클래스 이름도 화면의 표지다. 실측에서 드러났다 — `.workspace-app` 은
	// 렌더되지 않는 WorkspaceCenterArea.tsx 에만 있고, 스펙 셋이 그것으로
	// 화면을 집는다. data-testid 만 보면 이 부류가 통째로 빠진다.
	// `className="a b"` 와 `className={`a ${x}`}` 둘 다 본다. 이 저장소의 BEM
	// 토글 클래스는 대부분 템플릿이라, 리터럴만 보면 그 클래스들이 통째로
	// 빠진다 — 실제로 그 형태로 고아 화면이 통과했다.
	// 클래스도 파서로 읽는다. `className={"x" as const}` 처럼 한 겹만 달라도
	// 정규식은 놓치고, 그때마다 화면이 검사에서 사라졌다.
	for (const attr of attributes) {
		if (attr.name !== "className") continue;
		for (const chunk of attr.chunks) {
			for (const cls of chunk.split(/\s+/).filter(Boolean)) {
				if (!classDefinedIn.has(cls)) classDefinedIn.set(cls, new Set());
				classDefinedIn.get(cls).add(file);
			}
		}
	}
}


/**
 * 지금 렌더되지 않는 채로 두는 파일. 왜 남겨 두는지 적어야 한다.
 */
// WorkspaceCenterArea.tsx 와 CodingWorkersApp.tsx 는 2026-09-05 에 지웠다.
// 코딩 작업자 패널과 세션 대시보드가 없어졌고(#554), 그 자리는 Herdr 창의
// agents 탭과 IDE 뷰어가 대신한다. 파일이 사라졌으므로 이 목록에 남겨 두면
// "낡았다" 로 붉어진다.
const KNOWN_UNRENDERED = new Map([
	[
		"packages/shell/src/apps/sample-note/SampleNoteCenterArea.tsx",
		"App.tsx 가 `sample-note app removed — will be replaced by a proper memo app later` 라고 적고 등록 import 를 뺐다. 디렉터리는 남아 있지만 화면에 오르지 않는다. helpers/selectors.ts 와 90-app-system 이 이 표지를 집는다. 메모 앱이 새로 오면 그때 정리한다",
	],
	[
		"packages/shell/src/components/NaiaMetaArea.tsx",
		"나이아 메타 화면(진행·스킬·채널·에이전트·진단·설정 탭). 값으로 끌어오는 곳이 없어 진입점에서 닿지 않는다. helpers/selectors.ts 가 progress·diagnostics 탭을 집는데 그 표지는 여기에만 있다. 이 화면을 되살릴지 스펙을 접을지는 #554 와 같은 성질의 결정이다",
	],
	[
		"packages/shell/src/components/ConnectionsSettingsTab.tsx",
		"Discord 연결 패널 전체. 설정의 연결 탭이 영구 disabled 이고 이 파일도 값으로 import 되는 곳이 없다 — 기능이 아직 안 나온 상태다. 스펙 여섯이 이 패널을 기다리므로 매번 실패한다. 루크가 디스코드 연결은 이후 개선 예정으로 유예한다고 했으므로 그 판단을 여기 적어 둔다",
	],
]);

const specs = [
	...tracked(`${SHELL}/e2e-tauri`, ".ts"),
	...tracked(`${SHELL}/e2e`, ".ts"),
];

const missing = [];
const disabledAnchors = [];
const unrenderedAnchors = [];
const usedAllowances = new Set();
let anchors = 0;

for (const file of specs) {
	const source = readFileSync(file, "utf8");
	const names = new Map();
	for (const match of source.matchAll(ANCHORS[0]))
		names.set(match[1], match.index);
	for (const match of source.matchAll(ANCHORS[1]))
		names.set(`data-${match[1]}-tab="${match[2]}"`, match.index);
	for (const match of source.matchAll(ANCHORS[2])) names.set(match[1], match.index);

	// 클래스 선택자는 렌더 검사에만 쓴다. CSS 파일은 훑지 않으므로
	// "소스에 없다" 판정에 넣으면 거짓 지적이 쏟아진다.
	for (const m of source.matchAll(/["'`]\.([a-z][\w-]{3,})["'`\s\]]/g)) {
		const cls = m[1];
		const homes = classDefinedIn.get(cls);
		if (!homes || homes.size === 0) continue;
		if (![...homes].every((f) => unrendered.has(f))) continue;
		unrenderedAnchors.push({
			file,
			name: cls,
			line: source.slice(0, m.index).split("\n").length,
			homes: [...homes],
		});
	}

	for (const [name, at] of names) {
		anchors += 1;
		// 소스에 있어도 영구히 꺼 둔 조작 뒤면 도달할 수 없다.
		const bare = name.replace(/^data-\w+-tab="|"$/g, "");
		// 표지를 정의하는 파일이 전부 렌더되지 않으면 그 표지는 화면에
		// 오르지 않는다. 소스에 있다는 사실만으로는 살아 있다고 못 한다.
		const homes = definedIn.get(bare);
		if (homes && homes.size > 0 && [...homes].every((f) => unrendered.has(f))) {
			unrenderedAnchors.push({
				file,
				name: bare,
				line: source.slice(0, at).split("\n").length,
				homes: [...homes],
			});
		}
		if (disabledIds.has(name) || disabledIds.has(bare)) {
			disabledAnchors.push({
				file,
				name: bare,
				line: source.slice(0, at).split("\n").length,
			});
		}
		if (ALLOWED_ABSENT.has(name)) {
			usedAllowances.add(name);
			continue;
		}
		// 이 자리가 "없어야 한다" 를 확인하는 단정인가. 그렇다면 소스에
		// 이름이 없는 것이 정상이다.
		// 이 앵커가 든 **그 단정 하나**만 본다. 창을 넓게 잡으면 바로 다음 줄의
		// 관계없는 `.not.` 이 면제를 만들어 준다 — 실제로 그 우회가 실증됐다.
		// 단정은 `expect(...)` 로 시작해 세미콜론이나 줄 끝에서 끝난다.
		const statementStart = source.lastIndexOf("expect", at);
		const statementEnd = source.indexOf(";", at);
		const statement =
			statementStart >= 0 && statementEnd > at
				? source.slice(statementStart, statementEnd)
				: source.slice(at, at + 120);
		if (
			/toHaveCount\(\s*0\s*\)|\.not\.|toBeNull\(\)|toHaveLength\(\s*0\s*\)/.test(
				statement,
			)
		)
			continue;
		if (name.startsWith("data-")) {
			// `data-meta-tab="agents"` 처럼 값까지 집는 것. 값이 코드에서
			// 만들어지는 경우가 있어(`data-meta-tab={tab.id}`) 문자열로는
			// 못 만난다. 속성 이름이 소스에 있으면 살아 있는 것으로 본다.
			const attribute = /^(data-[\w-]+)=/.exec(name)?.[1] ?? name;
			if (sourceText.includes(name)) continue;
			// 예전에는 `data-meta-tab={` 가 소스에 있으면 **어떤 값이든** 살아
			// 있다고 쳤다. 그래서 존재하지도 않는 탭을 기다려도 통과했다.
			// 값이 코드에서 만들어지더라도 그 후보는 대개 리터럴 표로 적혀
			// 있으므로, 그 표에서 값을 찾아 대조한다.
			const wanted = /=["']([^"']+)["']$/.exec(name)?.[1];
			if (sourceText.includes(`${attribute}={`) && wanted) {
				if (assembledValues().has(wanted)) continue;
				missing.push({ file, name });
				continue;
			}
			if (sourceText.includes(`${attribute}={`)) continue;
			missing.push({ file, name });
			continue;
		}
		// 파서가 속성으로 읽어 낸 이름이면 화면에 있는 것이다. 형태(`"x"`,
		// `{"x"}`, `` {`x`} ``, `{"x" as const}`)는 파서가 이미 같은 값으로
		// 만들어 준다.
		if (definedIn.has(name)) continue;
		// 예전에는 소스 **어디든** 그 이름이 따옴표 안에 있으면 살아 있다고
		// 쳤다. 그래서 로그 모듈에 `const _removed = "ghost-wake-panel";`
		// 한 줄만 남겨도 사라진 화면이 되살아났다 — 6회차에 닫은 주석
		// 부활이, 주석이 아닌 문자열로 그대로 남아 있었다.
		//
		// 이름을 정하는 문맥 안에서만 본다. `getByTestId("x")` 같은 자리다.
		if (identifierContexts.some((ctx) => ctx.includes(`"${name}"`))) continue;
		if (identifierContexts.some((ctx) => ctx.includes(`\`${name}\``))) continue;
		// 이름이 코드에서 만들어지는 경우가 흔하다
		// (`data-testid={\`${role}-llm-mode\`}`). 앞이나 뒤가 잘린 꼴로도
		// 찾아본다 — 그러지 않으면 멀쩡한 자리를 사라졌다고 보고한다.
		// `data-testid={\`${role}-llm-mode\`}` 처럼 앞이나 뒤가 코드로 채워지는
		// 자리를 찾는다. 자를 때 하이픈을 남겨야 실제 소스와 만난다 —
		// 빠뜨리면 멀쩡한 자리를 사라졌다고 보고한다.
		const cuts = [];
		for (let i = 0; i < name.length; i += 1) {
			if (name[i] !== "-") continue;
			// 자를 때 하이픈을 양쪽에 남긴다. 소스는 `slot-${sid}` 와
			// `${role}-llm-mode` 두 꼴이 모두 있어서, 한쪽만 남기면 다른
			// 꼴을 놓친다.
			cuts.push({ head: name.slice(0, i + 1), tail: name.slice(i) });
		}
		// 조립된 이름을 찾되 **식별자 문맥 안에서만** 본다. 그러지 않으면
		// 관계없는 문자열이 접두사를 가로챈다 — 실제로 세션 아이디를 만드는
		// `` `voice-${seq}` `` 하나 때문에 `voice-` 로 시작하는 모든 이름이
		// 영원히 살아 있는 것으로 판정됐고, 삭제된 음성 화면을 기다리는 스펙을
		// 되살려도 게이트가 잡지 못했다.
		const assembled = cuts.some(({ head, tail }) => {
			if (tail.length > 3 && identifierContexts.some((ctx) => ctx.includes(`}${tail}\``)))
				return true;
			if (head.length > 3 && identifierContexts.some((ctx) => ctx.includes(`\`${head}${"${"}`)))
				return true;
			return false;
		});
		if (assembled) continue;
		missing.push({ file, name });
	}
}

/**
 * 스펙이 부르는 Tauri 명령이 실제로 있는지 본다.
 *
 * 사라진 화면과 같은 성격이다 — 명령이 없어지거나 이름이 바뀌어도 그것을
 * 부르는 스펙은 남고, 그 실패는 "회귀가 생겼다" 로 읽힌다. 실제로 두 스펙이
 * 존재하지 않는 명령을 부르고 있었고, 그중 하나는 e2e 전용으로 만들려다
 * 만 것이 스펙에만 남은 자리다.
 */
const commandNames = tauriCommandNames();
const missingCommands = [];
for (const file of specs) {
	const source = readFileSync(file, "utf8");
	for (const match of source.matchAll(
		/(?:tauriInvoke|invoke)\(\s*["'`]([a-z0-9_]+)["'`]/g,
	)) {
		const name = match[1];
		if (name.startsWith("plugin:") || commandNames.has(name)) continue;
		missingCommands.push({
			file,
			name,
			line: source.slice(0, match.index).split("\n").length,
		});
	}
}

const unrenderedNew = unrenderedAnchors.filter(
	(hit) => !hit.homes.every((f) => KNOWN_UNRENDERED.has(f)),
);
const unrenderedStale = [...KNOWN_UNRENDERED.keys()].filter(
	(f) => !unrendered.has(f),
);
if (unrenderedStale.length) {
	console.error(
		`  ❌ 렌더 안 되는 파일 목록이 낡았다(${unrenderedStale.length}) — 다시 화면에 올랐으니 목록에서 빼라:`,
	);
	for (const f of unrenderedStale) console.error(`     ${f}`);
	process.exit(1);
}
if (unrenderedNew.length) {
	console.error(
		`  ❌ 화면에 오르지 않는 표지를 기다리는 스펙 ${unrenderedNew.length}곳 — 이 스펙은 통과할 수 없다:`,
	);
	for (const hit of unrenderedNew)
		console.error(
			`     ${hit.file}:${hit.line} — ${hit.name} (정의: ${hit.homes.join(", ")})`,
		);
	console.error(
		"     그 파일을 다시 화면에 올리거나 스펙을 접어라. 지금 두는 이유가 있으면 KNOWN_UNRENDERED 에 적어라.",
	);
	process.exit(1);
}
if (unrenderedAnchors.length) {
	console.log(
		`  화면에 오르지 않는 표지를 기다리는 스펙 ${unrenderedAnchors.length}곳 (사유 적어 둠)`,
	);
}

const disabledNew = disabledAnchors.filter(
	(hit) => !KNOWN_DISABLED.has(hit.name),
);
const disabledStale = [...KNOWN_DISABLED.keys()].filter(
	(name) => !disabledAnchors.some((hit) => hit.name === name),
);
if (disabledStale.length) {
	console.error(
		`  ❌ 꺼 둔 조작 목록이 낡았다(${disabledStale.length}) — 이제 열렸거나 스펙이 없어졌으니 목록에서 빼라:`,
	);
	for (const name of disabledStale) console.error(`     ${name}`);
	process.exit(1);
}
if (disabledNew.length) {
	console.error(
		`  ❌ 영구히 꺼 둔 조작을 기다리는 스펙 ${disabledNew.length}곳 — 이 스펙은 통과할 수 없다:`,
	);
	for (const hit of disabledNew)
		console.error(`     ${hit.file}:${hit.line} — ${hit.name}`);
	console.error(
		"     기능을 열거나 스펙을 접어라. 지금 두는 이유가 있으면 KNOWN_DISABLED 에 적어라.",
	);
	process.exit(1);
}
if (disabledAnchors.length) {
	console.log(
		`  꺼 둔 조작을 기다리는 스펙 ${disabledAnchors.length}곳 (사유 적어 둠)`,
	);
}

// 같은 명령을 여러 번 불러도 결함은 하나다. 이름으로 센다.
const unexpectedCommands = missingCommands.filter(
	(hit) => !KNOWN_MISSING_COMMANDS.has(hit.name),
);
const staleKnown = [...KNOWN_MISSING_COMMANDS.keys()].filter(
	(name) => !missingCommands.some((hit) => hit.name === name),
);

if (staleKnown.length > 0) {
	console.error("\n없다고 적어 둔 명령이 이제 걸리지 않는다:");
	for (const name of staleKnown) console.error(`  ${name}`);
	console.error("\nKNOWN_MISSING_COMMANDS 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (unexpectedCommands.length > 0) {
	console.error("\n스펙이 부르는데 Rust 에 없는 명령:");
	for (const hit of unexpectedCommands) {
		console.error(`  ${hit.file}:${hit.line} — ${hit.name}`);
	}
	console.error(
		"\n명령이 사라졌으면 그 스펙도 지워라. 이름이 바뀐 것이면 스펙을 따라오게 하라.",
	);
	process.exit(1);
}

console.log(
	`[dead-ui] 스펙이 집는 이름 ${anchors}개 / 셸 소스에 없는 것 ${missing.length}`,
);

// 걸리지도 않는 면제는 알리바이다. 남겨 두면 다음 결함이 그 이름으로 들어와
// 조용히 지나간다 — 실제로 `voice-wake-triggers` 면제가 그러고 있었다.
const staleAllowances = [...ALLOWED_ABSENT.keys()].filter(
	(name) => !usedAllowances.has(name),
);
if (staleAllowances.length > 0) {
	console.error("\n걸리지 않는 면제가 남아 있다:");
	for (const name of staleAllowances) console.error(`  ${name}`);
	console.error("\nALLOWED_ABSENT 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (missing.length > 0) {
	console.error("\n스펙이 집는데 셸 소스에 없는 이름:");
	for (const hit of missing) console.error(`  ${hit.file} — ${hit.name}`);
	console.error(
		"\n화면이 사라졌으면 그 스펙도 지워라. 이름이 바뀐 것이면 스펙을 따라오게 하라.",
	);
	console.error(
		"없는 채로 두어야 할 이유가 있으면 ALLOWED_ABSENT 에 그 이유와 함께 적어라.",
	);
	process.exit(1);
}

console.log("  ✓ 사라진 화면을 기다리는 스펙 없음");
