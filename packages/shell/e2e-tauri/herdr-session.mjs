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
import { sep } from "node:path";

/**
 * 실행마다 다른 이름이 되어야 하는데, 마지막 마디만 보면 그렇지 않다.
 *
 * 전용 환경의 실행 자리는 `<tmp>/naia-shell-e2e-codex-<포트>/runtime` 처럼 **일반어로
 * 끝난다.** 마지막 마디만 쓰면 codex 실행이 전부 `naia-e2e-runtime` 이라는 한 이름을
 * 나눠 갖고, 실제로 그 세션이 사람 홈에 남았다(2026-09-06 실측).
 *
 * 그래서 경로에서 `naia-shell-e2e-…` 마디를 **찾아** 그 뒤를 쓴다. 그런 마디가 없으면
 * 일반어가 아닌 마지막 마디로 내려간다.
 */
const GENERIC_SEGMENTS = new Set(["runtime", "run", "tmp", "temp", "e2e", "data", "."]);

export function harnessHerdrSessionName(runtimeDir) {
	const segments = String(runtimeDir)
		.split(/[/\\]/u)
		.filter(Boolean);
	let raw = "";
	for (let i = segments.length - 1; i >= 0; i -= 1) {
		const segment = segments[i];
		if (segment.startsWith("naia-shell-e2e-")) {
			raw = segment.slice("naia-shell-e2e-".length);
			break;
		}
	}
	if (!raw) {
		for (let i = segments.length - 1; i >= 0; i -= 1) {
			const segment = segments[i];
			if (GENERIC_SEGMENTS.has(segment.toLowerCase())) continue;
			raw = segment.replace(/^naia-shell-e2e-/u, "");
			break;
		}
	}
	const tag = raw
		.replace(/[^A-Za-z0-9]/gu, "-")
		.replace(/^-+|-+$/gu, "");
	return tag ? `naia-e2e-${tag}` : "naia-e2e";
}

/**
 * 실행이 남긴 herdr 세션 서버를 내린다.
 *
 * 셸은 워크스페이스를 열 때 이 세션의 헤드리스 서버를 띄우는데, 그 서버는 앱이
 * 꺼져도 남는다(그것이 herdr 의 뜻이다 — 세션은 오래 산다). 하네스 세션은 오래 살
 * 이유가 없으므로 실행 자리와 함께 지운다. 안 지우면 실행마다 서버 하나와 세션
 * 디렉터리 하나가 쌓이고, XDG 격리를 못 받는 전용 환경에서는 그것이 **사람 홈**에
 * 남는다(2026-09-06 실측).
 *
 * 기본 설정과 전용 설정 셋이 각자 자기 `onComplete` 를 갖고 서로 상속하지 않으므로,
 * 내리는 일도 여기 한 자리에 두고 셋이 부른다.
 */
export function stopHarnessHerdrSession(runtimeDir, spawnSync) {
	if (!runtimeDir) return null;
	const session = harnessHerdrSessionName(runtimeDir);
	for (const args of [
		["--session", session, "server", "stop"],
		["session", "delete", session],
	]) {
		try {
			spawnSync("herdr", args, { stdio: "ignore", timeout: 10_000 });
		} catch {
			// herdr 이 없는 기계에서는 할 일이 없다.
		}
	}
	return session;
}
