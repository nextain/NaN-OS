// 자격증명 등급의 살아 있는 기본 공급자가 격리 ADK 에 심기고, 키는 파일에 남지 않는다 (#547).
//
// 왜 이 테스트가 있는가: 에이전트는 셸이 실어 보내는 provider 를 gRPC 경계에서
// 버리고 워크스페이스의 `naia-settings/config.json` 으로 활성 공급자를 재구성한다.
// 그래서 e2e 가 격리 워크스페이스에 아무것도 심지 않으면 자격증명 등급 스펙들이
// 죽은 값을 물고 `provider error: fetch failed` 로 끝난다 — 두 기계에서 마흔다섯
// 개 중 서른셋이 그렇게 걸렸다.
//
// 여기서 재는 것은 둘이다. 하나, 심은 결과가 에이전트가 실제로 읽는 자리·모양인가.
// 둘, 그 파일에 자격증명이 한 글자도 없는가 — 키는 환경 변수 *이름*으로만 실린다.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// 모듈 표면은 여기 적는다. `typeof import("…/credentialed-adk-seed.js")` 로 가져오면
// 루트 tsc 프로그램이 셸 소스(config.ts → @nextain/naia-os-core → 자기 dist)를
// 끌어들여 rootDir 위반과 dist 덮어쓰기(TS5055)로 컴파일 무결성 게이트가 붉어진다.
// 실제 모듈은 아래 beforeAll 이 파일 경로로 동적 import 한다.
interface SeedModule {
	CREDENTIALED_MAIN_PROVIDER: string;
	CREDENTIALED_MAIN_MODEL: string;
	CREDENTIALED_KEY_ENV: string;
	credentialedSeedAvailable(env?: Record<string, string | undefined>): boolean;
	seedCredentialedAdk(
		adkPath: string,
		options?: { provider?: string; model?: string; credentialRefEnv?: string },
	): {
		adkPath: string;
		configPath: string;
		provider: string;
		model: string;
		credentialRefEnv: string;
	};
}

let seedModule: SeedModule;
const created: string[] = [];

function freshAdk(): string {
	const dir = mkdtempSync(resolve(tmpdir(), "naia-seed-contract-"));
	created.push(dir);
	return dir;
}

beforeAll(async () => {
	seedModule = (await import(
		fileURLToPath(
			new URL(
				"../../packages/shell/e2e-tauri/credentialed-adk-seed.ts",
				import.meta.url,
			),
		)
	)) as SeedModule;
});

afterEach(() => {
	while (created.length) {
		rmSync(created.pop() as string, { recursive: true, force: true });
	}
});

describe("자격증명 등급 시딩", () => {
	it("에이전트가 읽는 자리에 config.json 을 쓴다", () => {
		const adk = freshAdk();
		const result = seedModule.seedCredentialedAdk(adk);
		expect(result.configPath).toBe(resolve(adk, "naia-settings", "config.json"));
		const written = JSON.parse(readFileSync(result.configPath, "utf8"));
		// `llmRoles.main` 이 제품 정본이고 최상위 provider/model 은 호환 거울이다.
		// 둘 중 하나만 쓰면 구 릴리스나 신 릴리스 한쪽이 공급자를 못 찾는다.
		expect(written.llmRoles.main.provider).toBe(
			seedModule.CREDENTIALED_MAIN_PROVIDER,
		);
		expect(written.llmRoles.main.model).toBe(seedModule.CREDENTIALED_MAIN_MODEL);
		expect(written.provider).toBe(seedModule.CREDENTIALED_MAIN_PROVIDER);
		expect(written.model).toBe(seedModule.CREDENTIALED_MAIN_MODEL);
		// 셸의 하이드레이션이 이것을 "이미 설정된 워크스페이스" 로 읽어야 한다.
		// 아니면 ensureAppReady 가 자기 기본값으로 덮어써 심은 것이 사라진다.
		expect(written.onboardingComplete).toBe(true);
		expect(written.workspaceRoot).toBe(resolve(adk));
	});

	it("키 값을 파일에 남기지 않는다 — 환경 변수 이름만 적는다", () => {
		const adk = freshAdk();
		const secret = "gw-thiscontracttestsecretvalue-0123456789";
		const previous = process.env[seedModule.CREDENTIALED_KEY_ENV];
		process.env[seedModule.CREDENTIALED_KEY_ENV] = secret;
		try {
			const result = seedModule.seedCredentialedAdk(adk);
			const raw = readFileSync(result.configPath, "utf8");
			expect(raw).not.toContain(secret);
			expect(raw).not.toMatch(/gw-[A-Za-z0-9_-]{8,}/);
			expect(JSON.parse(raw).llmRoles.main.credentialRef).toBe(
				seedModule.CREDENTIALED_KEY_ENV,
			);
		} finally {
			if (previous === undefined)
				delete process.env[seedModule.CREDENTIALED_KEY_ENV];
			else process.env[seedModule.CREDENTIALED_KEY_ENV] = previous;
		}
	});

	it("에이전트의 정책 신뢰 경계(processing.json)도 같이 둔다", () => {
		// 이것이 없으면 모델 변경마다 에이전트가 `loaded=false` 를 보고한다.
		const adk = freshAdk();
		seedModule.seedCredentialedAdk(adk);
		const policy = JSON.parse(
			readFileSync(resolve(adk, "naia-settings", "processing.json"), "utf8"),
		);
		expect(policy).toEqual({ version: 1, profiles: [], consents: [] });
	});

	it("키가 없으면 심지 않는다 — 결정론 등급은 예전 그대로 돈다", () => {
		expect(seedModule.credentialedSeedAvailable({})).toBe(false);
		expect(
			seedModule.credentialedSeedAvailable({
				[seedModule.CREDENTIALED_KEY_ENV]: "   ",
			}),
		).toBe(false);
		expect(
			seedModule.credentialedSeedAvailable({
				[seedModule.CREDENTIALED_KEY_ENV]: "gw-something",
			}),
		).toBe(true);
	});

	it("기본 설정이 그 시딩에 실제로 배선돼 있다", () => {
		// 배선을 지우면 여기가 붉어져야 한다. 시딩 함수만 남고 설정이 부르지 않으면
		// 계약은 초록인데 회귀는 여전히 fetch failed 로 죽는다.
		//
		// 예전에는 `/seedCredentialedAdk\(/` 같은 정규식 셋으로 쟀다. 그래서 실제
		// 호출을 지우고 그 줄을 주석으로 남기기만 해도 세 단정이 모두 참이었다 —
		// 배선을 빼면서 이유를 주석으로 적는 것이야말로 이 테스트가 막겠다고 적어
		// 둔 사고다(11회차 지적 8). 이제 파서로 **노드**를 찾는다. 주석에는 노드가
		// 없으므로 주석은 저절로 거짓이다. 10회차에 격리 계약
		// (`e2e-runtime-isolation.contract.test.ts`)이 같은 자리를 같은 방식으로
		// 닫았다.
		const tree = parseWdioConf();
		const bound = seedImportBindings(tree);

		const seedLocal = bound.get("seedCredentialedAdk");
		expect(seedLocal, "wdio.conf.ts 가 시딩 함수를 import 하지 않는다").toBeTruthy();
		expect(
			callsBinding(tree, seedLocal as string),
			"import 만 하고 부르지 않으면 격리 워크스페이스는 비어 있다",
		).toBe(true);

		const availableLocal = bound.get("credentialedSeedAvailable");
		expect(
			availableLocal,
			"wdio.conf.ts 가 시딩 가능 여부 판단을 import 하지 않는다",
		).toBeTruthy();
		expect(
			callsBinding(tree, availableLocal as string),
			"키가 있는지 실제로 물어야 결정론 등급이 예전 그대로 돈다",
		).toBe(true);

		// 워커도 같은 판단을 해야 스펙 앞에서 키를 실어 준다.
		expect(
			touchesProcessEnv(tree, "NAIA_E2E_CREDENTIALED_SEED"),
			"워커에게 넘기는 표시가 없으면 스펙은 키 없이 돈다",
		).toBe(true);
	});
});

/** `wdio.conf.ts` 를 노드로 읽는다. 글자가 아니라 노드로 재기 위해서다. */
function parseWdioConf(): ts.SourceFile {
	const path = fileURLToPath(
		new URL("../../packages/shell/e2e-tauri/wdio.conf.ts", import.meta.url),
	);
	return ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
}

/**
 * 시딩 모듈에서 들어온 이름 → 이 파일에서 쓰는 이름.
 *
 * 별명(`import { seedCredentialedAdk as seed }`)으로 바꿔도 따라간다 — 이름이
 * 아니라 바인딩을 본다.
 */
function seedImportBindings(tree: ts.SourceFile): Map<string, string> {
	const bound = new Map<string, string>();
	for (const statement of tree.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
		if (!/(^|\/)credentialed-adk-seed(\.[jt]s)?$/.test(statement.moduleSpecifier.text))
			continue;
		const named = statement.importClause?.namedBindings;
		if (!named || !ts.isNamedImports(named)) continue;
		for (const element of named.elements) {
			bound.set((element.propertyName ?? element.name).text, element.name.text);
		}
	}
	return bound;
}

/** 그 바인딩을 **실제로 부르는** 호출식이 있는가. */
function callsBinding(tree: ts.SourceFile, name: string): boolean {
	let found = false;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === name
		) {
			found = true;
			return;
		}
		node.forEachChild(visit);
	};
	visit(tree);
	return found;
}

/** `process.env.<key>` 를 **실제로** 대입하거나 읽는 노드가 있는가. */
function touchesProcessEnv(tree: ts.SourceFile, key: string): boolean {
	const isProcessEnv = (node: ts.Expression): boolean =>
		ts.isPropertyAccessExpression(node) &&
		node.name.text === "env" &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "process";
	let found = false;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (ts.isPropertyAccessExpression(node) && node.name.text === key) {
			if (isProcessEnv(node.expression)) {
				found = true;
				return;
			}
		}
		if (
			ts.isElementAccessExpression(node) &&
			node.argumentExpression &&
			ts.isStringLiteralLike(node.argumentExpression) &&
			node.argumentExpression.text === key &&
			isProcessEnv(node.expression)
		) {
			found = true;
			return;
		}
		node.forEachChild(visit);
	};
	visit(tree);
	return found;
}
