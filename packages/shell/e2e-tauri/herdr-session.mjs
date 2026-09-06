/**
 * 하네스가 붙는 herdr 세션 이름 — **한 자리**.
 *
 * 워크스페이스 탭이 사람의 herdr 세션을 그대로 보여 주는 것은 설계다. 그런데
 * 하네스가 그 설계를 그대로 타면, e2e 가 워크스페이스를 열 때마다 사람이 지금
 * 쓰고 있는 세션에 클라이언트가 하나 더 붙어 그 세션을 앱 터미널 크기로
 * 리사이즈한다(#573 조사에서 서버 로그로 실측). 그래서 하네스일 때만
 * `herdr --session <이름>` 으로 빈 세션에 붙는다.
 *
 * 이름을 만드는 곳이 둘이다 — 세션을 **만드는** Rust
 * (`src-tauri/src/herdr/config.rs` 의 `session_name_for_runtime`)와, 실행이 끝난 뒤
 * 그 세션을 **내리는** wdio teardown. 두 규칙이 어긋나면 실행마다 서버 하나와
 * `~/.config/herdr/sessions/` 아래 디렉터리 하나가 남는다. 이 파일은 부수효과가
 * 없어 계약 테스트가 그대로 불러 Rust 쪽 예제와 대조할 수 있다.
 */
import { basename } from "node:path";

export function harnessHerdrSessionName(runtimeDir) {
	const raw = basename(runtimeDir) || "run";
	const tag = raw
		.replace(/^naia-shell-e2e-/u, "")
		.replace(/[^A-Za-z0-9]/gu, "-")
		.replace(/^-+|-+$/gu, "");
	return tag ? `naia-e2e-${tag}` : "naia-e2e";
}
