/**
 * 하네스의 XDG 자리 — 앱 프로필을 실행 자리 아래로 옮긴다.
 *
 * 왜 필요한가: e2e 바이너리의 identifier 는 `com.naia.shell.e2e`
 * (`src-tauri/tauri.e2e.conf.json`)이고, 리눅스에서 그 앱의 설정·데이터 자리는
 * XDG 기본값을 따라 `~/.config/com.naia.shell.e2e/` 로 **사람 홈 아래 고정**이었다.
 * 실행 자리(`/tmp/naia-shell-e2e-<포트>`)와 무관하므로 WebKit 의 localStorage 와
 * IndexedDB 가 **스펙 사이는 물론 실행 사이에도** 살아남는다. 앞 스펙이 남긴 화면
 * 상태가 다음 스펙의 "기본 상태" 단정을 깨고, 어떤 스펙은 혼자 돌면 통과하고 전체
 * 실행에서는 붉어진다(2026-09-06 실패 우선 루프에서 확인).
 *
 * `ensureAppReady` 는 이미 설정돼 있으면 아무것도 하지 않고, 아니어도 병합만 한다 —
 * 스펙 사이에 상태를 되돌리는 자리는 하네스 어디에도 없었다.
 *
 * 그래서 자리를 옮긴다. 실행 자리가 지워지면 프로필도 함께 사라진다.
 *
 * ## 무엇을 건드리지 않는가
 *
 *   - `~/.naia`(데이터 홈)는 `$HOME` 에서 나온다(`data_home.rs` 의 `dirs::home_dir`).
 *     XDG 를 옮겨도 그 자리는 그대로다 — 데이터 홈 경계는 이 변경과 무관하다.
 *   - 실행 자리가 없으면(제품 실행) 아무 XDG 변수도 건드리지 않는다.
 *   - 윈도우는 WebView2 가 `WEBVIEW2_USER_DATA_FOLDER` 로 이미 자리를 받는다
 *     (전용 설정 둘이 그렇게 한다). XDG 는 리눅스 규약이라 거기서만 쓴다.
 *
 * ## 곁따라 오는 것
 *
 * herdr 도 `$XDG_CONFIG_HOME/herdr` 를 보므로 하네스 herdr 이 사람의 세션 자리에서
 * 완전히 떨어진다. 세션 이름 규칙(`herdr-session.mjs`)과 충돌하지 않는다 — 그 이름은
 * 실행 자리 이름에서 나오고, 세션 **자리**만 XDG 아래로 옮겨질 뿐이다. 실행이 끝난 뒤
 * 세션 서버를 내리는 teardown 이 같은 XDG 를 봐야 하므로, 이 함수는 앱에만 주는 것이
 * 아니라 **하네스 프로세스의 환경**에 세운다(앱은 그것을 물려받는다).
 */
import { join } from "node:path";

/** 실행 자리 아래의 XDG 세 자리. */
export function xdgDirsFor(runtimeDir) {
	const root = join(runtimeDir, "xdg");
	return {
		XDG_CONFIG_HOME: join(root, "config"),
		XDG_DATA_HOME: join(root, "data"),
		XDG_CACHE_HOME: join(root, "cache"),
	};
}

/**
 * 실행 자리가 있으면(=하네스) XDG 를 그 아래로 세우고 세운 자리를 돌려준다.
 * 없으면(=제품 실행) 아무것도 하지 않고 `null` 을 돌려준다.
 *
 * `platform` 과 `env` 를 인자로 받는 것은 계약 테스트가 진짜 환경을 더럽히지 않고
 * 이 규칙을 잴 수 있게 하려는 것이다.
 */
export function applyHarnessXdg(env = process.env, platform = process.platform) {
	if (platform === "win32") return null;
	const runtimeDir = env.NAIA_E2E_RUNTIME_DIR?.trim();
	if (!runtimeDir) return null;
	const dirs = xdgDirsFor(runtimeDir);
	for (const [key, value] of Object.entries(dirs)) env[key] = value;
	return dirs;
}
