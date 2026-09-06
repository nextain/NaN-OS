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
		value?: string;
		line: number;
		start: number;
		end: number;
	}>;
	splitCodeAndStrings(source: string): {
		code: string;
		strings: Array<{ value: string; line: number }>;
	};
	useDeclarations(tokens: Array<{ kind: string; text: string; line: number }>): Array<{
		local: string | null;
		path: string[];
		glob: boolean;
		line: number;
		at: number;
		pub: boolean;
	}>;
	isKeyword(token: unknown, word: string): boolean;
	keywordIn(token: unknown, words: Set<string>): boolean;
	externCrateDeclarations(
		tokens: Array<{ kind: string; text: string; line: number }>,
	): Array<{ crate: string; local: string; line: number; at: number }>;
	tauriCommandDeclarations(
		source: string,
	): Array<{ fnName: string; ipcName: string; body: string; line: number }>;
	tauriCommandNames(source: string): string[];
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

	it("`use tauri::command;` 뒤의 `#[command]` 도 명령이다", () => {
		// 14회차 지적 5. 판정이 속성에 **적힌 경로**만 보던 동안, 이 저장소의 STT
		// 플러그인이 이미 쓰던 형태가 목록에서 빠졌다. 목록에 없으면 프런트의
		// `invoke("…")` 는 확인 검사에서 통째로 건너뛰어진다.
		const source = [
			"use tauri::{command, AppHandle};",
			"",
			"#[command]",
			"pub fn ghost_wipe_everything(root: String) -> Result<(), String> {",
			"    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())",
			"}",
		].join("\n");
		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");
	});

	it("별명과 glob 으로 들여온 이름도 같은 속성이다", () => {
		const alias = "use tauri::command as cmd;\n#[cmd]\nfn wipe_alias() {}";
		const braced = "use tauri::{command as cmd, Manager};\n#[cmd]\nfn wipe_braced() {}";
		const glob = "use tauri::*;\n#[command]\nfn wipe_glob() {}";
		const nested = "use tauri::command;\n#[cfg_attr(all(), command)]\nfn wipe_nested() {}";
		expect([...rust.tauriCommandBodies(alias).keys()]).toEqual(["wipe_alias"]);
		expect([...rust.tauriCommandBodies(braced).keys()]).toEqual(["wipe_braced"]);
		expect([...rust.tauriCommandBodies(glob).keys()]).toEqual(["wipe_glob"]);
		expect([...rust.tauriCommandBodies(nested).keys()]).toEqual(["wipe_nested"]);
	});

	it("다른 크레이트의 `command` 는 명령이 아니다", () => {
		// 이름이 같다고 같은 proc-macro 가 아니다. 명시 import 는 glob 보다 먼저
		// 고르므로, `use clap::command` 가 있으면 `use tauri::*` 가 있어도 아니다.
		const other = "use clap::command;\n#[command]\nfn not_a_command() {}";
		const shadowed = [
			"use tauri::*;",
			"use clap::command;",
			"#[command]",
			"fn also_not_a_command() {}",
		].join("\n");
		const qualified = "use tauri::command;\n#[clap::command]\nfn qualified_elsewhere() {}";
		expect([...rust.tauriCommandBodies(other).keys()]).toEqual([]);
		expect([...rust.tauriCommandBodies(shadowed).keys()]).toEqual([]);
		expect([...rust.tauriCommandBodies(qualified).keys()]).toEqual([]);
	});

	it("`use` 선언의 잎을 지역 이름·경로로 읽는다", () => {
		// 공개 항목을 세는 쪽(`check-data-home-boundary.mjs`)이 `pub use` 재수출의
		// 이름을 이 답에서 읽는다(14회차 지적 8).
		const tokens = rust.tokenizeRust(
			[
				"pub use dirs::home_dir;",
				"use std::path::{Path, PathBuf};",
				"use tauri::command as cmd;",
				"pub use crate::inner::*;",
			].join("\n"),
		);
		const leaves = rust
			.useDeclarations(tokens)
			.map((leaf) => [leaf.path.join("::"), leaf.local, leaf.glob]);
		expect(leaves).toEqual([
			["dirs::home_dir", "home_dir", false],
			["std::path::Path", "Path", false],
			["std::path::PathBuf", "PathBuf", false],
			["tauri::command", "cmd", false],
			["crate::inner", null, true],
		]);
	});

	it("크레이트 별명과 매크로 크레이트 직접 경로도 명령이다", () => {
		// 15회차 지적 2. 적힌 글자만 보면 `use tauri as t; #[t::command]` 가 빠지고,
		// `tauri::command` 가 `tauri_macros::command` 의 재수출이라는 사실도 놓친다.
		// 속성 안의 경로를 이 파일의 `use` 로 정규화한 뒤 정본 경로와 대조한다.
		const crateAlias = "use tauri as t;\n#[t::command]\nfn wipe_alias() {}";
		const macroCrate = "#[tauri_macros::command]\nfn wipe_macro_crate() {}";
		const leadingColons = "#[::tauri::command]\nfn wipe_absolute() {}";
		const selfAlias = "use tauri::{self as t, Manager};\n#[t::command]\nfn wipe_self() {}";
		const nested = "use tauri as t;\n#[cfg_attr(all(), t::command)]\nfn wipe_nested() {}";
		expect([...rust.tauriCommandBodies(crateAlias).keys()]).toEqual(["wipe_alias"]);
		expect([...rust.tauriCommandBodies(macroCrate).keys()]).toEqual(["wipe_macro_crate"]);
		expect([...rust.tauriCommandBodies(leadingColons).keys()]).toEqual(["wipe_absolute"]);
		expect([...rust.tauriCommandBodies(selfAlias).keys()]).toEqual(["wipe_self"]);
		expect([...rust.tauriCommandBodies(nested).keys()]).toEqual(["wipe_nested"]);
	});

	it("별명이 다른 크레이트를 가리키면 명령이 아니다", () => {
		// 정규화는 양쪽으로 작동한다 — 이름이 `tauri` 여도 그 이름이 `clap` 이면
		// 명령이 아니다.
		const shadowedCrate = "use clap as tauri;\n#[tauri::command]\nfn not_a_command() {}";
		const otherCrate = "#[clap::command]\nfn also_not() {}";
		expect([...rust.tauriCommandBodies(shadowedCrate).keys()]).toEqual([]);
		expect([...rust.tauriCommandBodies(otherCrate).keys()]).toEqual([]);
	});

	it("생 식별자 `r#이름` 의 명령 이름은 `#` 뒤다", () => {
		// 15회차 지적 3. 토크나이저가 `r`·`#`·`이름` 셋으로 가르던 동안 목록에는
		// `r` 이 실렸고, 프런트의 `invoke("ghost_wipe_everything")` 은 그 목록에서
		// 이름을 못 찾아 확인 검사를 통째로 건너뛰었다.
		const source = [
			"#[tauri::command]",
			"pub fn r#ghost_wipe_everything(root: String) -> Result<(), String> {",
			"    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())",
			"}",
		].join("\n");
		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");
	});

	it("생 식별자와 생 문자열을 가른다", () => {
		// `r#"…"#` 는 문자열이고 `r#type` 은 식별자다. 둘을 섞으면 문자열 안의
		// `#` 가 이름이 되거나, 이름이 문자열로 삼켜진다.
		const tokens = rust.tokenizeRust(
			[
				'let a = r##"he said "#" here"##;',
				'let b = r#"plain"#;',
				"let r#type = r#match;",
			].join("\n"),
		);
		expect(tokens.map((t) => `${t.kind}:${t.text}`)).toEqual([
			"ident:let",
			"ident:a",
			"punct:=",
			'string:he said "#" here',
			"punct:;",
			"ident:let",
			"ident:b",
			"punct:=",
			"string:plain",
			"punct:;",
			"ident:let",
			"ident:type",
			"punct:=",
			"ident:match",
			"punct:;",
		]);
	});

	it("생 식별자 `r#use` 는 `use` 키워드가 아니다", () => {
		// 16회차 지적 1. 15회차가 `r#이름` 의 이름을 `#` 뒤로 바로잡으면서 키워드와
		// 생 식별자가 **같은 글자**가 됐다. 낱말 비교가 `text === "use"` 이던 동안
		// `fn r#use()` 가 선언의 시작으로 읽혀 함수 본문의 `{` 를 `use` 나무로
		// 건너뛰었고, 그 뒤에 오는 진짜 `use tauri::command;` 가 통째로 사라져
		// `#[command]` 가 명령이 아니게 됐다.
		const source = [
			"fn r#use() {",
			"    let _ghost = 1;",
			"}",
			"use tauri::command;",
			"#[command]",
			"fn ghost_wipe_everything() {",
			'    let _ = std::fs::remove_dir_all("/tmp/ghost-wipe");',
			"}",
		].join("\n");

		// 뒤따르는 진짜 `use` 가 선언으로 읽힌다.
		const leaves = rust
			.useDeclarations(rust.tokenizeRust(source))
			.map((leaf) => [leaf.path.join("::"), leaf.local]);
		expect(leaves).toEqual([["tauri::command", "command"]]);

		// 그래서 `#[command]` 가 명령이고, 본문 판정까지 살아 있다.
		const commands = rust.tauriCommandBodies(source);
		expect([...commands.keys()]).toEqual(["ghost_wipe_everything"]);
		expect(commands.get("ghost_wipe_everything")).toContain("remove_dir_all");
	});

	it("키워드와 같은 이름의 생 식별자도 그냥 이름이다", () => {
		// 이름이 `use` 인 명령이 목록에 `use` 로 실린다 — 프런트도 그 이름으로 부른다.
		expect([...rust.tauriCommandBodies("#[tauri::command]\nfn r#use() {}").keys()]).toEqual([
			"use",
		]);
		expect([...rust.tauriCommandBodies("#[tauri::command]\npub fn r#fn() {}").keys()]).toEqual([
			"fn",
		]);
		// 아이템 시작 낱말과 같은 이름이어도 함수는 함수다.
		expect([...rust.tauriCommandBodies("#[tauri::command]\nfn r#struct() {}").keys()]).toEqual([
			"struct",
		]);
		// 진짜 아이템 시작은 여전히 명령이 아니다.
		expect([...rust.tauriCommandBodies("#[tauri::command]\nstruct X;").keys()]).toEqual([]);
	});

	it("`r#pub use` 는 재수출이 아니다", () => {
		const leaves = rust
			.useDeclarations(rust.tokenizeRust("let r#pub = 1;\nuse a::b;"))
			.map((leaf) => [leaf.path.join("::"), leaf.pub]);
		expect(leaves).toEqual([["a::b", false]]);
		expect(
			rust
				.useDeclarations(rust.tokenizeRust("pub use a::b;"))
				.map((leaf) => [leaf.path.join("::"), leaf.pub]),
		).toEqual([["a::b", true]]);
	});

	it("낱말 판정은 글자가 아니라 `keyword` 표시로 한다", () => {
		// 이 모듈의 **모든** 낱말 비교가 이 판정을 지나야 한다. 글자 비교가 하나라도
		// 남으면 그 자리로 생 식별자가 들어온다 — 16회차 지적 1 이 그 자리였다.
		const words = ["use", "fn", "pub", "as", "const", "struct", "enum", "impl", "mod", "match"];
		for (const word of words) {
			const [plain] = rust.tokenizeRust(`${word} `);
			const [raw] = rust.tokenizeRust(`r#${word} `);
			expect(rust.isKeyword(plain, word), `${word} 는 키워드다`).toBe(true);
			expect(rust.isKeyword(raw, word), `r#${word} 는 키워드가 아니다`).toBe(false);
			// 이름은 둘 다 같다 — 가르는 것은 글자가 아니라 표시다.
			expect(raw.text).toBe(word);
			expect(rust.keywordIn(raw, new Set(words))).toBe(false);
			expect(rust.keywordIn(plain, new Set(words))).toBe(true);
		}
		// 키워드가 아닌 이름은 생 식별자든 아니든 키워드가 아니다.
		const [ordinary] = rust.tokenizeRust("ghost ");
		expect(rust.keywordIn(ordinary, new Set(words))).toBe(false);
	});

	it("문자열의 값은 적는 법이 아니라 뜻이다", () => {
		// 17회차 지적 3. 이스케이프를 한 글자씩 삼키던 동안 `"\x48OME"` 의 값이
		// `x48OME` 라서 금지 집합(`HOME`)에 들지 않았고, `"\x2enaia"` 도 `.naia`
		// 마디로 읽히지 않았다 — 같은 글자를 다르게 적는 것만으로 홈을 짚을 수
		// 있었다. 조각을 이어 붙이는 위조와 달리 이것은 리터럴 하나다.
		const source = [
			'let a = "\\x48OME";',
			'let b = "\\x2enaia";',
			'let c = "\\u{48}OME";',
			'let d = "\\u{2e}naia";',
			'let e = b"\\x48OME";',
			'let f = "a\\nb\\tc\\\\d\\"e";',
			'let g = r"\\x48OME";',
		].join("\n");
		const values = rust
			.tokenizeRust(source)
			.filter((token) => token.kind === "string")
			.map((token) => token.value);
		expect(values).toEqual([
			"HOME",
			".naia",
			"HOME",
			".naia",
			"HOME",
			'a\nb\tc\\d"e',
			// 생 문자열에는 이스케이프가 없다 — 적힌 그대로가 값이다.
			"\\x48OME",
		]);
	});

	it("줄 끝 `\\` 이어쓰기는 줄바꿈과 공백을 지운다", () => {
		const source = 'let a = "line\\\n        cont";';
		const [string] = rust.tokenizeRust(source).filter((token) => token.kind === "string");
		expect(string.value).toBe("linecont");
	});

	it("값을 보는 자리가 어느 필드를 읽든 답이 같다", () => {
		// 15~17회차에 값을 읽는 자리가 셋으로 늘었다(홈 검사·`.naia` 마디·이름표).
		// 그중 하나가 `text` 를 읽어도 틀리지 않아야 한다 — 그래서 두 필드가 언제나
		// 같은 값이다. 소스에서 `.text` 를 찾아 없애는 것보다 이 불변식이 강하다.
		const source = [
			'let a = "\\x48OME";',
			'let b = r#"raw \\x48 stays"#;',
			"let c = '\\n';",
			'let d = b"\\u{2e}naia";',
		].join("\n");
		for (const token of rust.tokenizeRust(source)) {
			if (token.kind !== "string" && token.kind !== "char") continue;
			expect(token.text, `${token.kind} 토큰의 두 필드가 다르다`).toBe(token.value);
		}
	});

	it("코드와 문자열을 가를 때도 값을 넘긴다", () => {
		// 데이터 홈 검사가 금지 환경 변수와 `.naia` 마디를 여기서 받는다.
		const { strings } = rust.splitCodeAndStrings(
			['let home = std::env::var("\\x48OME");', 'let path = "\\x2enaia/logs";'].join("\n"),
		);
		expect(strings.map((entry) => [entry.line, entry.value])).toEqual([
			[1, "HOME"],
			[2, ".naia/logs"],
		]);
	});

	it("`extern crate tauri as t;` 도 크레이트 별명이다", () => {
		// 17회차 지적 4. 별명 표를 `use` 만 채우던 동안 이 형태가 빠졌다.
		const aliased = "extern crate tauri as t;\n#[t::command]\nfn wipe_extern_alias() {}";
		const plain = "extern crate tauri;\n#[tauri::command]\nfn wipe_extern_plain() {}";
		const otherCrate = "extern crate clap as t;\n#[t::command]\nfn not_a_command() {}";
		expect([...rust.tauriCommandBodies(aliased).keys()]).toEqual(["wipe_extern_alias"]);
		expect([...rust.tauriCommandBodies(plain).keys()]).toEqual(["wipe_extern_plain"]);
		expect([...rust.tauriCommandBodies(otherCrate).keys()]).toEqual([]);

		// `extern "C" fn` 의 `extern` 은 뒤가 문자열이라 크레이트 선언이 아니다.
		const abi = 'extern "C" fn ghost() {}\n#[tauri::command]\nfn wipe_after_abi() {}';
		expect([...rust.tauriCommandBodies(abi).keys()]).toEqual(["wipe_after_abi"]);

		expect(
			rust
				.externCrateDeclarations(rust.tokenizeRust(`${aliased}\nextern crate serde;`))
				.map((declared) => [declared.crate, declared.local]),
		).toEqual([
			["tauri", "t"],
			["serde", "serde"],
		]);
	});

	it("`rename` 인자가 있으면 프런트가 부르는 이름은 그 리터럴이다", () => {
		// 18회차 지적 7. 목록이 Rust 함수 이름만 담던 동안, 이름을 바꿔 적으면
		// 프런트의 `invoke("ghost_wipe_everything")` 이 `commands.includes` 에서
		// 통째로 건너뛰어졌다 — 확인 없는 전체 삭제가 그것만으로 통과했다.
		//
		// 근거는 이 기계에 받아 둔 매크로 소스다:
		// tauri-macros-2.6.2/src/command/wrapper.rs:300 이 RenamePolicy::Rename 일 때
		// 외부에서 부르는 이름을 그 리터럴로 둔다.
		const source = [
			'#[tauri::command(rename = "ghost_wipe_everything")]',
			"fn innocent_placeholder(root: String) {",
			"    let _ = std::fs::remove_dir_all(&root);",
			"}",
		].join("\n");
		const [declared] = rust.tauriCommandDeclarations(source);
		expect(declared.fnName).toBe("innocent_placeholder");
		expect(declared.ipcName).toBe("ghost_wipe_everything");
		expect(declared.body).toContain("remove_dir_all");
		expect(rust.tauriCommandNames(source)).toEqual(["ghost_wipe_everything"]);
	});

	it("`rename_all` 은 명령 이름을 바꾸지 않는다 — 인자 키의 표기다", () => {
		// 같은 매크로 소스 62~78 줄에서 `rename_all` 은 "camelCase" 와 "snake_case"
		// 둘만 받아 `argument_case` 를 정하고, 510~520 줄이 그것으로 **인자 키**를
		// 바꾼다. 이름을 그 규칙으로 바꾸면 Tauri 가 등록하지도 않는 이름을 목록에
		// 넣고 진짜 이름을 잃는다.
		const camel = '#[tauri::command(rename_all = "camelCase")]\nfn ghost_wipe_everything() {}';
		const snake = '#[tauri::command(rename_all = "snake_case")]\nfn ghostWipeEverything() {}';
		expect(rust.tauriCommandNames(camel)).toEqual(["ghost_wipe_everything"]);
		expect(rust.tauriCommandNames(snake)).toEqual(["ghostWipeEverything"]);
	});

	it("`rename_all` 과 `rename` 이 함께 있으면 `rename` 이 이름이다", () => {
		const source =
			'#[tauri::command(rename_all = "camelCase", rename = "ghost_wipe_everything")]\nfn innocent() {}';
		const [declared] = rust.tauriCommandDeclarations(source);
		expect([declared.fnName, declared.ipcName]).toEqual([
			"innocent",
			"ghost_wipe_everything",
		]);
	});

	it("인자가 없으면 IPC 이름은 함수 이름이다", () => {
		const plain = "#[tauri::command]\nfn plain_name() {}";
		const withAsync = "#[tauri::command(async)]\nfn async_name() {}";
		const argsOnly = '#[tauri::command(rename_all = "snake_case")]\nfn args_only() {}';
		for (const [source, name] of [
			[plain, "plain_name"],
			[withAsync, "async_name"],
			[argsOnly, "args_only"],
		] as Array<[string, string]>) {
			const [declared] = rust.tauriCommandDeclarations(source);
			expect([declared.fnName, declared.ipcName]).toEqual([name, name]);
		}
	});

	it("`rename` 은 중첩·별명 형태에서도 읽힌다", () => {
		const nested = '#[cfg_attr(all(), tauri::command(rename = "ghost"))]\nfn plain() {}';
		const aliased = 'use tauri as t;\n#[t::command(rename = "ghost")]\nfn plain() {}';
		const macroCrate = '#[tauri_macros::command(rename = "ghost")]\nfn plain() {}';
		for (const source of [nested, aliased, macroCrate]) {
			expect(rust.tauriCommandNames(source)).toEqual(["ghost"]);
		}
		// 이름이 비슷한 다른 인자는 이름이 아니다.
		const decoy = '#[tauri::command(rename_all = "camelCase")]\nfn plain() {}';
		expect(rust.tauriCommandNames(decoy)).toEqual(["plain"]);
	});

	it("`tauriCommandBodies` 는 예전 그대로 함수 이름을 열쇠로 쓴다", () => {
		// 게이트가 옮겨 가기 전까지 두 답이 함께 있어야 한다. 옮기고 나면 이 항목이
		// 그 사실을 알려 주는 자리다.
		const source = '#[tauri::command(rename = "ghost")]\nfn plain() { let _ = 1; }';
		expect([...rust.tauriCommandBodies(source).keys()]).toEqual(["plain"]);
		expect(rust.tauriCommandNames(source)).toEqual(["ghost"]);
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
