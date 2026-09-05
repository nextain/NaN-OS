// Rust 명령 목록은 글자 창이 아니라 토큰에서 나온다 (11회차 지적 7).
//
// 왜 이 테스트가 있는가: 파괴 조작 게이트는 `#[tauri::command]` 선언에서 명령
// 이름을 뽑는다. 그 추출이 `][\s\S]{0,200}?fn` 이라는 **글자 창**이던 동안,
// 속성과 `fn` 사이에 200자가 넘는 문서 주석을 적으면 그 명령이 목록에서
// 사라졌다. 목록에 없으면 프런트의 `invoke("…")` 는 확인 검사에서 통째로
// 건너뛰어지고, 확인 없는 전체 삭제가 문서를 길게 적는 것만으로 초록을 받는다.
//
// 창을 넓히는 것은 고침이 아니다. 넓힌 만큼 한 글자 더 적으면 그만이다. 그래서
// 거리를 재는 자리 자체를 없앴고, 여기서는 그 사실을 고정한다 — 문서 주석이
// 몇 자든, 속성이 몇 개든, 가시성과 `async` 가 어떻든 같은 이름이 나오고,
// 주석이나 문자열 안의 가짜 선언은 나오지 않는다.
//
// 같은 사고가 속성 **머리**에서 한 번 더 났다. 판정이 `#[` 다음 네 토큰이던 동안
// `#[cfg_attr(all(), tauri::command)]` 는 명령이 아니었다(12회차 지적 4). 그래서
// 속성 안에서도 세는 자리를 없앴고 — 속성 토큰 열 어디든 `tauri::command` 연쇄가
// 있으면 명령이다 — 아래 세 항목이 그 사실과 그 경계(문자열은 연쇄가 아니다)를
// 고정한다.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// 모듈 표면은 여기 적는다. `.mjs` 를 정적으로 가져오거나 `typeof import(...)` 로
// 타입을 끌어오면 루트 tsc 프로그램이 그 파일과 자기 dist 를 함께 끌어들여
// 컴파일 무결성 게이트가 붉어진다. 실제 모듈은 아래 beforeAll 이 파일 경로로
// 동적 import 한다.
interface RustTokensModule {
	tauriCommandBodies(source: string): Map<string, string>;
	tokenizeRust(source: string): Array<{
		kind: string;
		text: string;
		line: number;
		start: number;
		end: number;
	}>;
	splitCodeAndStrings(source: string): {
		code: string;
		strings: Array<{ value: string; line: number }>;
	};
}

let rust: RustTokensModule;

beforeAll(async () => {
	rust = (await import(
		fileURLToPath(new URL("../../scripts/lib/rust-tokens.mjs", import.meta.url))
	)) as RustTokensModule;
});

/** `]` 와 `fn` 사이를 이 길이만큼 채우는 문서 주석. */
function docComment(chars: number): string {
	const lines: string[] = [];
	let written = 0;
	while (written < chars) {
		const line = "/// 이 명령은 고스트 캐시 디렉터리를 통째로 지운다. 되돌릴 수 없다.";
		lines.push(line);
		written += line.length + 1;
	}
	return lines.join("\n");
}

describe("Rust 명령 추출은 거리를 재지 않는다", () => {
	it("문서 주석이 321자를 넘어도 그 명령이 목록에 있다", () => {
		const doc = docComment(321);
		expect(doc.length).toBeGreaterThan(321);
		const source = `#[tauri::command]\n${doc}\npub fn ghost_wipe_everything(root: String) -> Result<(), String> {\n    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())\n}\n`;

		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		// 본문으로 판정하는 쪽(파괴 여부)도 같이 살아 있어야 뜻이 있다.
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");

		// 옛 200자 창은 같은 소스에서 이 명령을 못 봤다. 그 차이가 이 테스트의 뜻이다.
		const oldWindow =
			/#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+([a-z0-9_]+)/.exec(source);
		expect(oldWindow).toBeNull();
	});

	it("속성이 여러 개 붙어도, 순서가 어떻든 읽는다", () => {
		const source = `#[tauri::command]\n#[allow(dead_code)]\n#[cfg(any(target_os = "linux", target_os = "macos"))]\n#[doc = "지운다"]\nfn wipe_one() {}\n`;
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["wipe_one"]);
	});

	it("`pub(crate) async fn` 처럼 가시성과 수식어가 붙어도 읽는다", () => {
		const source = [
			"#[tauri::command]\npub(crate) async fn wipe_a() {}",
			"#[tauri::command]\npub async unsafe fn wipe_b() {}",
			"#[tauri::command(rename_all = \"snake_case\")]\npub(in crate::app) fn wipe_c() {}",
		].join("\n\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual([
			"wipe_a",
			"wipe_b",
			"wipe_c",
		]);
	});

	it("`#[cfg_attr(…, tauri::command)]` 도 명령이다 — 속성 머리를 세지 않는다", () => {
		// 12회차 지적 4. 판정이 `#[` 다음 네 토큰이던 동안 이 선언은 명령이 아니었고,
		// 그래서 프런트의 `invoke("ghost_wipe_everything")` 은 확인 검사에서 통째로
		// 건너뛰어졌다 — 확인 없는 전체 삭제가 속성을 한 겹 감싸는 것만으로 통과했다.
		const source = [
			"#[cfg_attr(all(), tauri::command)]",
			"pub fn ghost_wipe_everything(root: String) -> Result<(), String> {",
			"    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())",
			"}",
		].join("\n");
		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		// 본문 판정(파괴 여부)까지 살아 있어야 뜻이 있다.
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");

		// 옛 머리 네 토큰 판정은 같은 소스에서 이 명령을 못 봤다. 그 차이가 이 테스트의 뜻이다.
		expect(/#\[tauri\s*::\s*command/.test(source)).toBe(false);
	});

	it("중첩된 `cfg_attr` 안에 있어도 명령이다", () => {
		const source = [
			'#[cfg_attr(unix, cfg_attr(target_os = "linux", tauri::command))]',
			"fn wipe_nested() {}",
			"",
			'#[cfg_attr(target_os = "windows", tauri::command)]',
			"pub(crate) async fn wipe_windows() {}",
		].join("\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual([
			"wipe_nested",
			"wipe_windows",
		]);
	});

	it("속성 안의 **문자열**에 적힌 `#[tauri::command]` 는 명령이 아니다", () => {
		// 토크나이저가 문자열을 토큰 하나로 묶어 두므로 `tauri` `::` `command` 연쇄가
		// 아니다. 글자만 같은 것과 진짜 경로를 가르는 자리다.
		const source = [
			'#[doc = "#[tauri::command] fn ghost_from_doc() {}"]',
			"fn documented_only() {}",
			"",
			'#[cfg_attr(all(), serde(rename = "tauri::command"))]',
			"fn renamed_only() {}",
			"",
			"#[cfg_attr(all(), tauri::command)]",
			"fn the_real_one() {}",
		].join("\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["the_real_one"]);
	});

	it("속성이 100개 붙어도 읽는다 — 건너뛰기에 횟수 한계가 없다", () => {
		// 13회차 지적 5. 건너뛰기가 64회이던 동안 속성 65개면 그 명령이 사라졌다.
		// 한계를 100으로 올리는 것은 고침이 아니다 — 하나 더 적으면 그만이다.
		// 그래서 횟수를 세는 자리 자체를 없앴고, 여기서는 옛 한계를 넉넉히 넘긴다.
		const attributes = Array.from({ length: 100 }, () => "#[allow(dead_code)]").join("\n");
		const source = `#[tauri::command]\n${attributes}\npub fn ghost_wipe_everything(root: String) {\n    std::fs::remove_dir_all(&root).ok();\n}\n`;
		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");
	});

	it("`const fn` 과 수식어 전부가 붙어도 읽는다 — 수식어를 열거하지 않는다", () => {
		// 옛 목록은 `async`·`unsafe`·`extern`·`default` 뿐이라 `const` 가 없었다.
		// 이제 다른 아이템의 시작이 아닌 낱말은 모두 수식어로 건너뛴다.
		const source = [
			"#[tauri::command]\nconst fn wipe_const() {}",
			'#[tauri::command]\npub(in crate::a) const unsafe extern "C" fn wipe_all_modifiers() {}',
			"#[tauri::command]\npub(crate) default async fn wipe_default() {}",
		].join("\n\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual([
			"wipe_const",
			"wipe_all_modifiers",
			"wipe_default",
		]);
	});

	it("함수가 아닌 아이템에 붙으면 명령이 아니다", () => {
		// 멈추는 낱말이 없으면 건너뛰기가 다음 함수까지 흘러가, 엉뚱한 이름을
		// 명령으로 세거나 그 본문을 파괴 판정에 쓴다.
		const source = [
			"#[tauri::command]",
			"struct GhostRequest;",
			"",
			"#[tauri::command]",
			"enum GhostKind { A }",
			"",
			"#[tauri::command]",
			";",
			"",
			"fn not_a_command(root: String) {",
			"    std::fs::remove_dir_all(&root).ok();",
			"}",
			"",
			"#[tauri::command]",
			"fn the_real_one() {}",
		].join("\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["the_real_one"]);
	});

	it("주석 안의 `#[tauri::command]` 는 명령이 아니다", () => {
		const source = [
			"// #[tauri::command]",
			"fn commented_out() {}",
			"",
			"/* 옛 코드:",
			"#[tauri::command]",
			"fn block_commented() {}",
			"*/",
			"fn also_not_a_command() {}",
			"",
			"#[tauri::command]",
			"fn the_real_one() {}",
		].join("\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["the_real_one"]);
	});

	it("문자열 안의 `#[tauri::command]` 도 명령이 아니다", () => {
		const source = [
			'const SAMPLE: &str = "#[tauri::command]\\nfn from_a_string() {}";',
			'const RAW: &str = r#"#[tauri::command] fn from_a_raw_string() {}"#;',
			"#[tauri::command]",
			"fn the_real_one() {}",
		].join("\n");
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["the_real_one"]);
	});

	it("본문은 중괄호 균형으로 자르고, 문자열 안의 `}` 는 세지 않는다", () => {
		const source = [
			"#[tauri::command]",
			"fn wipe_with_braces(root: String) -> Result<(), String> {",
			'    let sql = "SELECT json_extract(v, \'$.a}\') FROM t";',
			"    if root.is_empty() {",
			"        return Err(sql.to_string());",
			"    }",
			"    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())",
			"}",
			"",
			"fn after() {}",
		].join("\n");
		const body = rust.tauriCommandBodies(source).get("wipe_with_braces") ?? "";
		expect(body).toContain("remove_dir_all");
		expect(body.endsWith("}")).toBe(true);
		// 뒤따르는 함수까지 삼키지 않는다.
		expect(body).not.toContain("fn after");
	});

	it("본문 없는 선언은 다음 함수의 본문을 빌려 오지 않는다", () => {
		const source = [
			"#[tauri::command]",
			"fn declared_only();",
			"",
			"fn neighbour() {",
			"    std::fs::remove_dir_all(\"/\").ok();",
			"}",
		].join("\n");
		expect(rust.tauriCommandBodies(source).get("declared_only")).toBe("");
	});

	it("코드와 문자열을 가르되 줄 번호를 지킨다", () => {
		const source = [
			"// ~/.naia/logs 는 여기 설명이다",
			'let home = std::env::var("HOME");',
			'let path = ".naia/logs";',
		].join("\n");
		const { code, strings } = rust.splitCodeAndStrings(source);
		// 주석은 사라진다 — 설명 안의 `.naia` 가 위반으로 잡히면 안 된다.
		expect(code).not.toContain(".naia");
		expect(strings.map((s) => [s.line, s.value])).toEqual([
			[2, "HOME"],
			[3, ".naia/logs"],
		]);
		// 식별자는 코드 쪽에 그대로 남고, 줄 번호가 밀리지 않는다.
		expect(code.split("\n")[1]).toContain("var");
	});
});
