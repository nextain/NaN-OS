# Naia Shell 기능 및 회귀 테스트 현황

이 문서는 `.agents/context/feature-test-coverage.yaml`의 사용자용 미러입니다. 세부 사용자 여정 S01–S72는 `docs/user-scenarios.md`에 유지하며, 여기서는 제품 기능과 자동화 수준을 한눈에 연결합니다.

## 테스트 단계

- `deterministic_ci`: 비밀키나 특정 장치 없이 PR마다 실행합니다.
- `browser_mock`: Playwright로 실제 UI 여정을 실행하고 Tauri·외부 provider 경계를 통제합니다.
- `native_local`: 실제 Tauri 데스크톱 경계와 패키지 런타임을 확인합니다.
- `credentialed_live`: API 키, 계정, 오디오 장치 또는 GPU가 필요한 선택 실행입니다.
- `manual_package`: 서명·설치·스토어 심사처럼 릴리스 산출물에서 확인합니다.

## 개발자 명령

```powershell
pnpm -C packages/shell test:regression:store
pnpm -C packages/shell test
pnpm -C packages/shell test:e2e
pnpm -C packages/shell test:e2e:tauri
pnpm -C packages/shell test:regression:store:native
pnpm -C packages/shell build
```

## 기능별 보장 범위

| 요구사항 | 기능 | 상태 | 대표 자동화 | 남은 외부 검증 |
|---|---|---|---|---|
| REQ-001 | 다중 LLM 채팅·모델 선택 | 부분 | ChatArea, SettingsTab, chat-tools, Store certification | 실제 provider 성공은 키 필요 |
| REQ-002 | VRM/NVA 아바타·동작 | 보호 | avatar unit, onboarding avatar, NVA E2E | 전용 자산은 선택 실행 |
| REQ-003 | 클라우드·로컬 TTS | 부분 | TTS unit, fallback E2E | 실제 음성·GPU·클라우드 키 |
| REQ-004 | 권한 승인·단축키 | 보호 | permission unit, approval E2E | OS별 권한 대화상자 |
| REQ-005 | 감사 로그·진행 이벤트 | 보호 | progress unit, logging gate | 장기 운영 로그 |
| REQ-006 | Gateway 상태·세션 | 보호 | gateway session unit, capability E2E | 실제 장애 복구 |
| REQ-007 | 로컬·동기화 메모리 | 보호 | memory tests, settings/sync E2E | 원격 동기화 계정 |
| REQ-008 | 스킬 탐색·설정·실행 | 보호 | skills/config unit, BGM E2E | 외부 스킬 서비스 |
| REQ-009 | Shell–Agent 스트리밍 계약 | 보호 | chat-service, new-core, native suites | 실제 Agent 묶음 실행 |
| REQ-010 | Discord 연결·relay | 부분 | auth unit, settings/channel E2E | 실제 계정·채널 |
| REQ-011 | 온보딩·안전한 키 적용 | 보호 | onboarding, Store certification | Store 클린 설치 |
| REQ-012 | 실시간 음성·STT·립싱크 | 부분 | voice unit, pipeline E2E | 마이크·스피커·GPU·WebSocket |
| REQ-013 | 워크스페이스·터미널·Herdr | 보호 | workspace unit, panel E2E | 대형 실제 저장소 |
| REQ-014 | 비밀 제거·로컬 설정 | 보호 | config-secrets, config SoT, secure settings | OS 키 저장소 |
| REQ-015 | 번들 런타임·설치·업데이트 | 부분 | staging unit, updater E2E | 서명 설치·Store 인증 |
| REQ-016 | 패널·도구 결과 표시 | 보호 | panel bridge, chat-tools | 외부 도구 다양성 |
| REQ-017 | 다국어 UI·출력 | 보호 | i18n unit, screenshot E2E | 전체 언어 육안 QA |
| REQ-018 | 토큰·비용 집계 | 보호 | cost/progress unit, Store zero-token E2E | provider 영수증 대조 |
| REQ-019 | MCP·외부 도구 연결 | 부분 | chat-tools, native suites | 제3자 서버·인증 |
| REQ-020 | OS 이미지 업데이트 | 부분 | startup update prompt E2E | 이미지 릴리스 파이프라인 |

## Microsoft Store 핵심 회귀

`store-certification.spec.ts`는 심사자가 수행한 경로를 자동화합니다. Google Gemini 선택, API 키 적용, `GEMINI_API_KEY` 저장, Agent 설정 reload, 메시지 전송을 거친 뒤 `usage(0)` 다음 오류가 사용자에게 표시되고 `$0.000000 · 0 tokens`가 성공처럼 남지 않으며 HTTP 500이 없음을 검증합니다.

브라우저 mock 통과만으로 Store 승인을 보장하지는 않습니다. 릴리스 전에는 네이티브 실행, 유효한 실제 키를 사용한 응답, 설치 파일 실행을 별도 확인해야 합니다.
