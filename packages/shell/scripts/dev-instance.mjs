/**
 * FR-SHELL-ISO.1 (#425): 격리된 개발 인스턴스의 포트/플래그 env.
 * 2026-08-06 dual-instance 설계(codex/dual-instance-dev-20260806)에서 수확 —
 * 원안의 HOME/USERPROFILE 전면 재지정은 NAIA_HOME 방식(tauri-with-mode)이
 * 대체했으므로 포트 분리와 dev 플래그만 남긴다.
 *
 *  - NAIA_DEV_INSTANCE=1: Rust 가 debug 빌드에서만 인정하는 dev 게이트
 *    (포트 오버라이드 허용 + updater 비활성). release 에선 무시된다.
 *  - BGM 사이드카: 운영 :18791 / dev :18891 (Rust bgm_server_port +
 *    VITE_NAIA_BGM_BASE 프런트 소비 — 기존 소비부 재사용).
 *  - OAuth 콜백: 운영 :18792 / dev :18892 (Rust oauth_callback_port +
 *    lib/oauth-callback-url.ts).
 * 호출자가 이미 지정한 값은 보존(?? 기본값).
 */
export const DEV_BGM_PORT = "18891";
export const DEV_OAUTH_CALLBACK_PORT = "18892";

export function developmentInstanceEnv(sourceEnv) {
	const env = { ...sourceEnv };
	env.NAIA_DEV_INSTANCE = "1";
	env.NAIA_BGM_PORT = sourceEnv.NAIA_BGM_PORT ?? DEV_BGM_PORT;
	env.NAIA_OAUTH_CALLBACK_PORT =
		sourceEnv.NAIA_OAUTH_CALLBACK_PORT ?? DEV_OAUTH_CALLBACK_PORT;
	env.VITE_NAIA_BGM_BASE =
		sourceEnv.VITE_NAIA_BGM_BASE ?? `http://localhost:${env.NAIA_BGM_PORT}`;
	env.VITE_NAIA_OAUTH_CALLBACK_URL =
		sourceEnv.VITE_NAIA_OAUTH_CALLBACK_URL ??
		`http://127.0.0.1:${env.NAIA_OAUTH_CALLBACK_PORT}/auth/callback`;
	return env;
}
