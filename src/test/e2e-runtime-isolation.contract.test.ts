// e2e 가 운영 앱의 데이터 홈을 밟지 않는다.
//
// 왜 이 테스트가 있는가: Rust 는 `CAFE_DEBUG_E2E=1` 일 때만, 그리고
// `NAIA_E2E_RUNTIME_DIR` 이 절대 경로로 있을 때만 로그·리스·PID 를 그 아래에 둔다
// (packages/shell/src-tauri/src/lib.rs 의 log_dir / e2e_runtime_dir / run_dir).
// 전용 설정 둘은 그 변수를 잡는데 **기본 설정만 빠져 있었다**. 그래서 이 설정으로
// 도는 스펙 백여 개가 운영 앱과 같은 `~/.naia/run`·`~/.naia/logs` 를 썼고,
// 앞 스펙이 흘린 에이전트가 리스를 쥔 채 남아 다음 스펙이
// `agent_lease_live_blocked` 로 뇌 없이 돌았다(그렇게 고아가 된 에이전트 30개).
//
// 배선을 지우면 여기가 붉어져야 한다. 그래서 파일을 읽어 문자열을 세지 않고,
// 설정을 실제로 import 해서 그 결과로 남는 환경을 잰다.
import { homedir, tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const CONFIGS = {
	"wdio.conf.ts": "일반 설정",
	"codex-e2e-environment.ts": "codex 전용 환경",
	"radio-queue-e2e-environment.ts": "radio-queue 전용 환경",
} as const;

/**
 * 그 소스가 `process.env.NAIA_E2E_RUNTIME_DIR` 에 **실제로 값을 넣는가**.
 *
 * 예전에는 `/process\.env\.NAIA_E2E_RUNTIME_DIR\s*=/` 문자열을 찾았다. 그래서
 * 배선을 지우고 그 줄을 주석으로 남기기만 해도 이 단정이 참이었다 — 전용 설정에서
 * 배선을 빼면서 이유를 주석으로 적는 것이야말로 이 테스트가 막겠다고 적어 둔
 * 사고다. 이제 파서로 대입식을 찾는다. 주석에는 노드가 없으므로 주석은 저절로
 * 거짓이다.
 */
function assignsRuntimeDir(name: string, source: string): boolean {
	const tree = ts.createSourceFile(
		name,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	let found = false;
	const targetsRuntimeDir = (node: ts.Expression): boolean => {
		// `process.env.NAIA_E2E_RUNTIME_DIR`
		if (
			ts.isPropertyAccessExpression(node) &&
			node.name.text === "NAIA_E2E_RUNTIME_DIR"
		)
			return isProcessEnv(node.expression);
		// `process.env["NAIA_E2E_RUNTIME_DIR"]`
		if (
			ts.isElementAccessExpression(node) &&
			node.argumentExpression &&
			ts.isStringLiteralLike(node.argumentExpression) &&
			node.argumentExpression.text === "NAIA_E2E_RUNTIME_DIR"
		)
			return isProcessEnv(node.expression);
		return false;
	};
	const isProcessEnv = (node: ts.Expression): boolean =>
		ts.isPropertyAccessExpression(node) &&
		node.name.text === "env" &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "process";
	const visit = (node: ts.Node): void => {
		if (
			!found &&
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			targetsRuntimeDir(node.left as ts.Expression)
		)
			found = true;
		if (!found) node.forEachChild(visit);
	};
	visit(tree);
	return found;
}

/** `parent` 안(또는 그 자신)인가. 문자열 접두사 비교는 `/tmp2` 를 `/tmp` 안으로 센다. */
function isInside(parent: string, child: string): boolean {
	const rel = relative(resolve(parent), resolve(child));
	return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

describe("기본 e2e 설정이 운영 앱의 데이터 홈과 실행 자리를 나눈다", () => {
	let runtimeDir: string | undefined;

	beforeAll(async () => {
		// 밖에서 들어온 값이 있으면 이 설정은 그것을 정본으로 두므로, 잰 것이
		// 설정의 배선인지 알 수 없다. 비우고 import 한다.
		process.env.NAIA_E2E_RUNTIME_DIR = undefined;
		delete process.env.NAIA_E2E_RUNTIME_DIR;
		const conf = fileURLToPath(
			new URL("../../packages/shell/e2e-tauri/wdio.conf.ts", import.meta.url),
		);
		// 짝 저장소가 없는 기계에서는 import 가 뒤쪽에서 실패한다. 그 실패는 이
		// 계약과 무관하고, 격리 배선은 그보다 앞에 있어야 한다 — 배선이 뒤로
		// 밀리면 아래 단정이 그대로 붉어진다.
		await import(conf).catch(() => undefined);
		runtimeDir = process.env.NAIA_E2E_RUNTIME_DIR;
	});

	it("설정을 import 하면 실행 자리가 정해져 있다", () => {
		expect(
			runtimeDir,
			"NAIA_E2E_RUNTIME_DIR 이 없으면 Rust 는 리스·PID·로그를 ~/.naia 아래에 둔다",
		).toBeTruthy();
	});

	it("그 자리가 데이터 홈 아래가 아니다", () => {
		expect(isInside(resolve(homedir(), ".naia"), runtimeDir as string)).toBe(
			false,
		);
		expect(isInside(homedir(), runtimeDir as string)).toBe(false);
	});

	it("그 자리가 저장소 안이 아니다", () => {
		const repo = fileURLToPath(new URL("../..", import.meta.url));
		expect(
			isInside(repo, runtimeDir as string),
			"저장소 안에 두면 `git add` 에 딸려 들어간다",
		).toBe(false);
	});

	it("그 자리가 OS 임시 디렉터리 아래의 절대 경로다", () => {
		// Rust 는 절대 경로가 아니면 그 값을 버리고 데이터 홈으로 되돌아간다
		// (lib.rs e2e_runtime_dir 의 is_absolute 필터).
		expect(resolve(runtimeDir as string)).toBe(runtimeDir);
		expect(isInside(tmpdir(), runtimeDir as string)).toBe(true);
	});

	it("Rust 가 그 값을 읽는 조건도 같이 서 있다", () => {
		// log_dir 은 CAFE_DEBUG_E2E=1 일 때만 실행 자리를 본다.
		expect(process.env.CAFE_DEBUG_E2E).toBe("1");
	});

	it.each(Object.entries(CONFIGS))(
		"%s 가 실행 자리를 잡는 배선을 지니고 있다",
		async (name) => {
			const source = await import("node:fs/promises").then((fs) =>
				fs.readFile(
					fileURLToPath(
						new URL(`../../packages/shell/e2e-tauri/${name}`, import.meta.url),
					),
					"utf8",
				),
			);
			expect(
				assignsRuntimeDir(name, source),
				"주석이 아니라 실제 대입이어야 한다 — 배선을 빼고 이유만 주석으로 남기면 여기가 붉어진다",
			).toBe(true);
		},
	);
});
