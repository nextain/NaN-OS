// Rust 명령 목록은 게이트마다 따로 세지 않는다 (19회차 지적 6).
//
// 왜 이 테스트가 있는가: 명령 목록을 뽑는 게이트가 둘이다 — 확인 없는 파괴 조작을
// 보는 `check-destructive-affordance.mjs` 와, 스펙이 부르는 명령이 실제로 있는지
// 보는 `check-dead-ui-specs.mjs`. 파괴 쪽은 11회차에 원문 정규식을 버리고
// 토크나이저로 옮겼는데, 죽은 UI 쪽은 그대로 남아 있었다. 그래서 주석에 명령
// 속성을 적어 두면 그 옆의 `fn` 이 명령으로 셌고 — 주석은 토큰이 아니므로 파괴
// 쪽은 같은 소스를 명령으로 읽지 않는다 — 스펙이 없는 명령을 불러도 초록이었다.
//
// 여기서 고정하는 것은 둘이다. 하나, 죽은 UI 게이트의 소스에 그 정규식이 다시
// 적히지 않는다. 둘, 이름과 소스 뿌리를 정하는 판단이 각각 공용 모듈 하나다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// 모듈 표면은 여기 적는다. `.mjs` 를 정적으로 가져오면 루트 tsc 프로그램이 그
// 파일과 자기 dist 를 함께 끌어들여 컴파일 무결성 게이트가 붉어진다.
interface RustTokensModule {
	tauriCommandNames(source: string): string[];
}

interface CrateRootsModule {
	crateSourceRoots(entry?: string): string[];
	localCrateReferences(text: string): string[];
	DEFAULT_CRATE_MANIFEST: string;
}

let rust: RustTokensModule;
let crateRoots: CrateRootsModule;

function readRepoFile(relative: string): string {
	return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");
}

beforeAll(async () => {
	rust = (await import(
		fileURLToPath(new URL("../../scripts/lib/rust-tokens.mjs", import.meta.url))
	)) as RustTokensModule;
	crateRoots = (await import(
		fileURLToPath(new URL("../../scripts/lib/crate-roots.mjs", import.meta.url))
	)) as CrateRootsModule;
});

describe("명령 목록은 한 자리에서 센다", () => {
	it("죽은 UI 게이트에 명령 속성 정규식이 없다", () => {
		// 이 이름이 그 파일에 **한 번도** 나오지 않아야 한다. 정규식으로 다시 세는
		// 순간 주석과 문자열이 명령이 되고, 파괴 쪽이 닫은 구멍이 여기서 열린다.
		const source = readRepoFile("scripts/check-dead-ui-specs.mjs");
		expect(source).not.toContain("tauri::command");
		expect(/#\\?\[tauri/.test(source)).toBe(false);
	});

	it("죽은 UI 게이트가 이름과 소스 뿌리를 공용 모듈에서 받는다", () => {
		const source = readRepoFile("scripts/check-dead-ui-specs.mjs");
		expect(source).toContain('from "./lib/rust-tokens.mjs"');
		expect(source).toContain("tauriCommandNames");
		expect(source).toContain('from "./lib/crate-roots.mjs"');
		expect(source).toContain("crateSourceRoots");
	});

	it("주석에 적어 둔 명령 속성은 명령이 아니다", () => {
		// 리뷰어가 심은 그대로다 — 주석 두 줄로 없는 명령을 만들어 냈다.
		const source = ["// #[tauri::command]", "fn ghost_r19_cmd() {}"].join("\n");
		expect(rust.tauriCommandNames(source)).toEqual([]);

		// 같은 자리에서 주석을 떼면 명령이다. 판정이 살아 있다는 대조다.
		const real = ["#[tauri::command]", "fn ghost_r19_cmd() {}"].join("\n");
		expect(rust.tauriCommandNames(real)).toEqual(["ghost_r19_cmd"]);
	});

	it("문자열 안에 적어 둔 명령 속성도 명령이 아니다", () => {
		const source = [
			'const SAMPLE: &str = "#[tauri::command] fn ghost_from_string() {}";',
			"#[tauri::command]",
			"fn the_real_one() {}",
		].join("\n");
		expect(rust.tauriCommandNames(source)).toEqual(["the_real_one"]);
	});

	it("소스 뿌리는 Cargo.toml 이 정한다 — 플러그인 크레이트가 들어 있다", () => {
		const roots = crateRoots.crateSourceRoots();
		expect(roots).toContain("packages/shell/src-tauri/src");
		expect(roots).toContain("packages/shell/src-tauri/plugins/tauri-plugin-stt/src");
	});

	it("`path` 와 `members` 는 따옴표 모양을 가리지 않는다", () => {
		const manifest = [
			"[workspace]",
			"members = ['crates/a', \"crates/b\"]",
			"[dependencies]",
			"c = { path = 'crates/c' }",
			'# path = "ghost/commented"',
		].join("\n");
		expect(crateRoots.localCrateReferences(manifest)).toEqual([
			"crates/a",
			"crates/b",
			"crates/c",
		]);
	});
});
