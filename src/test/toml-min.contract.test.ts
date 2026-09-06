// 크레이트 자리는 따옴표 모양이 아니라 TOML 문법에서 나온다 (15회차 지적 6).
//
// 왜 이 테스트가 있는가: 파괴 조작 게이트는 명령 목록을 뽑을 크레이트 자리를
// `Cargo.toml` 에서 읽는다. 그 읽기가 `\bpath\s*=\s*"([^"]+)"` 라는 정규식이던
// 동안, 같은 자리를 홑따옴표로 적기만 하면 그 크레이트의 `src` 가 뿌리에서
// 빠졌고 — TOML 은 두 따옴표를 같은 문자열로 본다 — 목록에 없는 명령의
// `invoke("…")` 는 확인 검사에서 통째로 건너뛰어졌다.
//
// 따옴표를 하나 더 열거하는 것은 고침이 아니다. 다음에는 여러 줄 문자열이나
// 인라인 테이블로 같은 일이 난다. 그래서 문법으로 읽고, 여기서 그 사실을
// 고정한다 — 네 가지 문자열이 모두 값 하나이고, 주석과 문자열 **안**의
// `path = "…"` 는 키가 아니다.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// 모듈 표면은 여기 적는다. `.mjs` 를 정적으로 가져오면 루트 tsc 프로그램이 그
// 파일과 자기 dist 를 함께 끌어들여 컴파일 무결성 게이트가 붉어진다.
interface TomlModule {
	parseToml(text: string): Record<string, unknown>;
}

let toml: TomlModule;

beforeAll(async () => {
	toml = (await import(
		fileURLToPath(new URL("../../scripts/lib/toml-min.mjs", import.meta.url))
	)) as TomlModule;
});

/** 게이트가 하는 것과 같은 훑기 — 어느 테이블에 있든 `path` 와 `members`. */
function crateReferences(text: string): string[] {
	const found: string[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			if (key === "path" && typeof value === "string") found.push(value);
			if (key === "members" && Array.isArray(value)) {
				for (const member of value) if (typeof member === "string") found.push(member);
			}
			visit(value);
		}
	};
	visit(toml.parseToml(text));
	return found;
}

describe("Cargo.toml 읽기는 따옴표 모양을 세지 않는다", () => {
	it("홑따옴표와 겹따옴표는 같은 자리다", () => {
		const single = "[dependencies]\ntauri-plugin-stt = { path = 'plugins/tauri-plugin-stt' }\n";
		const double = '[dependencies]\ntauri-plugin-stt = { path = "plugins/tauri-plugin-stt" }\n';
		expect(crateReferences(single)).toEqual(["plugins/tauri-plugin-stt"]);
		expect(crateReferences(double)).toEqual(["plugins/tauri-plugin-stt"]);

		// 옛 정규식은 홑따옴표를 못 봤다. 그 차이가 이 테스트의 뜻이다.
		expect(/\bpath\s*=\s*"([^"]+)"/.test(single)).toBe(false);
	});

	it("인라인 테이블이든 자기 테이블이든 같은 자리다", () => {
		const inline = "[dependencies]\na = { path = 'crates/a', default-features = false }\n";
		const section = "[dependencies.a]\npath = 'crates/a'\ndefault-features = false\n";
		const target = '[target."cfg(unix)".dependencies]\na = { path = \'crates/a\' }\n';
		expect(crateReferences(inline)).toEqual(["crates/a"]);
		expect(crateReferences(section)).toEqual(["crates/a"]);
		expect(crateReferences(target)).toEqual(["crates/a"]);
	});

	it("`members` 는 따옴표가 섞이고 주석·꼬리 쉼표가 있어도 읽는다", () => {
		const text = [
			"[workspace]",
			"members = [",
			"  'crates/a',   # 첫째",
			'  "crates/b",',
			"]",
		].join("\n");
		expect(crateReferences(text)).toEqual(["crates/a", "crates/b"]);
	});

	it("주석 안의 `path` 는 자리가 아니다", () => {
		const text = [
			'# path = "ghost/commented-out"',
			"[dependencies]",
			"a = { path = 'crates/a' }  # path = \"ghost/trailing\"",
		].join("\n");
		expect(crateReferences(text)).toEqual(["crates/a"]);
	});

	it("여러 줄 문자열 안의 `path` 는 값이지 키가 아니다", () => {
		const text = [
			"[package]",
			'description = """',
			'path = "ghost/in-basic-multiline"',
			'"""',
			"notes = '''",
			"path = 'ghost/in-literal-multiline'",
			"'''",
			"[dependencies]",
			"a = { path = 'crates/a' }",
		].join("\n");
		expect(crateReferences(text)).toEqual(["crates/a"]);
		// 그 글자는 사라지지 않고 값으로 남는다 — 파서가 삼킨 것이 아니다.
		const doc = toml.parseToml(text) as { package: { description: string; notes: string } };
		expect(doc.package.description).toContain("ghost/in-basic-multiline");
		expect(doc.package.notes).toContain("ghost/in-literal-multiline");
	});

	it("따옴표 키와 이스케이프도 값 하나로 읽는다", () => {
		const text = ['[dependencies."odd name"]', 'path = "crates/a\\u002Db"'].join("\n");
		const doc = toml.parseToml(text) as {
			dependencies: Record<string, { path: string }>;
		};
		expect(doc.dependencies["odd name"].path).toBe("crates/a-b");
	});

	it("이 저장소의 실제 Cargo.toml 에서 플러그인 자리를 읽는다", async () => {
		const { readFileSync } = await import("node:fs");
		const manifest = fileURLToPath(
			new URL("../../packages/shell/src-tauri/Cargo.toml", import.meta.url),
		);
		expect(crateReferences(readFileSync(manifest, "utf8"))).toContain(
			"plugins/tauri-plugin-stt",
		);
	});
});
