// FR-SHELL-ISO.1 (#425, 8/6 dual-instance 설계 수확): OAuth 콜백 URL 단일 SoT.
// 격리된 dev 인스턴스(Naia Dev)는 VITE_NAIA_OAUTH_CALLBACK_URL 로 자기 포트
// (:18892)를 쓰고, 운영/기본은 :18792 를 유지한다 — 동시 실행 시 콜백 포트 충돌 차단.
const DEFAULT_OAUTH_CALLBACK_URL = "http://127.0.0.1:18792/auth/callback";

export const OAUTH_CALLBACK_URL =
	import.meta.env.VITE_NAIA_OAUTH_CALLBACK_URL?.replace(/\/$/, "") ??
	DEFAULT_OAUTH_CALLBACK_URL;
