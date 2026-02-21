# E2E 중단/원인 분석 로그 (토큰 인증 + UI 실시간 추적)

## 날짜
- 2026-02-20

## 범위
- `Naia-OS/shell` UI E2E 디버깅
- `skill_time`, `skill_weather`, `skill_notify*` 등 스킬 실행 검증
- 게이트웨이 연결/인증 상태와 UI 메시지 불일치 원인 추적

## 수행 내용
1. E2E 반복 실행 및 실패 spec 수정
- `17-skill-notify.spec.ts` 검증 로직 보강/조정
- `16-skill-weather.spec.ts` 실패 조건 조정
- `04-skill-time.spec.ts` self-contained 설정 강화(도구/게이트웨이 설정)

2. 공통 E2E 헬퍼 보강
- `helpers/chat.ts`
  - `waitForToolSuccess` 실패 시 마지막 UI 메시지/툴 목록 포함 에러로 확장
  - Tool placeholder(`Tool Call`, `print(skill_...)`, `잠시만`) 탐지 강화
  - UI 메시지 실시간 파일 추적 추가: `e2e-tauri/.artifacts/ui-message-trace.ndjson`
- `helpers/semantic.ts`
  - Gemini semantic judge 추가
  - judge 호출 타임아웃 추가(무한 대기 방지)

3. 런타임 안정화/라이프사이클 정합
- `src-tauri/src/lib.rs`
  - poisoned lock 복구(`lock_or_recover`) 적용
  - E2E debug 로깅 추가(`CAFE_DEBUG_E2E=1`일 때만)
- `ChannelsTab/DiagnosticsTab/SkillsTab`
  - gateway URL 판단을 `resolveGatewayUrl` 기준으로 통일

## 확인된 핵심 원인
1. 스킬 미실행의 직접 원인
- UI 최종 에러: `[오류] unauthorized: gateway token missing (set gateway.remote.token to match gateway.auth.token)`
- 즉, 모델/스킬 문제가 아니라 게이트웨이 토큰 인증 실패로 tool call이 막힘

2. 추가 인증 이슈
- 이후 UI 에러: `[오류] unauthorized: device token mismatch (rotate/reissue device token)`
- 토큰 미스매치가 이어져 도구 실행 연쇄 실패

3. 환경 변수 상태
- `shell/.env` 키 확인 결과:
  - 존재: `GEMINI_API_KEY`, `GATEWAY_MASTER_KEY`
  - 없음: `CAFE_GATEWAY_TOKEN`
- 따라서 E2E가 `CAFE_GATEWAY_TOKEN`만 참조하면 인증 실패 가능
- 관련 fallback 수정 적용:
  - `CAFE_GATEWAY_TOKEN || GATEWAY_MASTER_KEY || naia-dev-token`

## 산출물(로그)
- UI 실시간 추적:
  - `Naia-OS/shell/e2e-tauri/.artifacts/ui-message-trace.ndjson`
- 앱 런타임 로그:
  - `~/.naia/logs/naia.log`

## 중단 시점 상태
- 사용자 요청으로 E2E 실행 중지
- 완전 통과(53/53) 미완료
- 현재 블로커는 테스트 코드보다 인증 환경(게이트웨이 토큰/디바이스 토큰) 정합 이슈

## 다음 작업 권장
1. 게이트웨이 토큰 정합
- Gateway 서버 설정의 `gateway.auth.token`과 E2E에서 전달되는 token 일치 확인
- `.env`에서 E2E token key를 단일화(`CAFE_GATEWAY_TOKEN` 권장)

2. device token mismatch 정리
- 필요 시 device token rotate/reissue 후 재로그인/재페어링

3. 재검증 순서
- `01 -> 02 -> 03 -> 04` 최소 체인 검증
- 이후 전체 `pnpm run test:e2e:tauri` 재개

