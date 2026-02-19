# Cafelua OS Phase 5-7 코드 리뷰 & 수정

## 날짜
- 시작: 2026-02-19
- 진행 중

## 프로젝트
`cafelua-os` — Cafelua Shell (Tauri 2) + Agent (Node.js) + OS ISO

## 작업 내용

### Phase 5-7 구현 완료 후 코드 리뷰 5라운드 진행

Phase 5(Lab 통합), Phase 6(앱 배포), Phase 7(OS ISO) 구현 완료 후,
총 5라운드의 코드 리뷰를 통해 발견된 버그/보안 이슈를 수정.

### 라운드 5 수정 사항 (2026-02-19)

| # | 심각도 | 수정 내용 | 파일 |
|---|--------|----------|------|
| 1 | CRITICAL | `handleChatRequest` Promise `.catch()` 추가 — unhandled rejection 크래시 방지 | `agent/src/index.ts` |
| 2 | CRITICAL | `LLMProvider.stream()` AbortSignal 지원 추가 — 스트림 취소 시 fetch 연결 정리 | `types.ts`, `lab-proxy.ts`, `index.ts` |
| 3 | HIGH | webkit2gtk permission 필터링 — UserMediaPermissionRequest만 허용 | `lib.rs` |
| 4 | HIGH | CSP 활성화 — `null` → 적절한 Content-Security-Policy 설정 | `tauri.conf.json` |
| 5 | MEDIUM | Lab Proxy `stream_options: { include_usage: true }` 추가 — 비용 추적 활성화 | `lab-proxy.ts` |
| 6 | MEDIUM | TTS voice 슬라이싱 안전화 — `&voice[..5]` → `.get(..5).unwrap_or("ko-KR")` | `lib.rs` |
| 7 | MEDIUM | NVM 경로 `~/.nvm` + `~/.config/nvm` 두 경로 모두 탐색 | `lib.rs` |
| 8 | MEDIUM | `pendingApprovals` requestId 필터링 — 동시 요청 시 다른 요청 approval 보존 | `index.ts` |
| 9 | MEDIUM | GATEWAY_URL 중복 제거 — `config.ts`에 `LAB_GATEWAY_URL` 공통 상수 | `config.ts`, `CostDashboard.tsx` |

### 이전 라운드 요약

- **라운드 1** (`e59277f`): CI/CD 보안 (스크립트 인젝션 방지, 퍼미션, 캐싱)
- **라운드 2** (`5f48d79`): SSE tool call 누적, deep link 로그 마스킹, balance 캐시
- **라운드 3** (`8252391`): deep link 키 검증, RPM 의존성, GATEWAY_URL 익스포트
- **라운드 4** (`a5261ea`): user_id 검증, install 스크립트 강화, 릴리스 버전 검사

### 라운드 5 재리뷰 추가 수정 (2026-02-19)

| # | 심각도 | 수정 내용 | 파일 |
|---|--------|----------|------|
| 10 | CRITICAL | CSP `connect-src`에 외부 API 도메인 누락 — STT, memory-processor의 Google/xAI/Anthropic fetch 블로킹 | `tauri.conf.json` |
| 11 | HIGH | AbortSignal을 gemini/xai/anthropic 프로바이더에도 전달 — 취소 시 upstream HTTP abort | `gemini.ts`, `xai.ts`, `anthropic.ts` |
| 12 | HIGH | E2E 11-cost-dashboard 토글 상태 불일치 수정 — 대시보드 닫기 후 재오픈 | `11-cost-dashboard.spec.ts` |

### E2E 테스트 보강 (2026-02-19)

| # | 파일 | 추가 내용 |
|---|------|----------|
| 1 | `selectors.ts` | Lab 관련 셀렉터 8개 추가 (onboardingLabBtn, labBalanceSection 등) |
| 2 | `09-onboarding.spec.ts` | provider 스텝에서 Lab Login 버튼/섹션/디바이더 존재 확인 (+1 테스트) |
| 3 | `02-configure.spec.ts` | Settings에 Lab 섹션 존재 확인 (+1 테스트) |
| 4 | `11-cost-dashboard.spec.ts` | labKey 주입 후 Lab balance row 표시 확인 (+1 테스트, 토글 상태 수정) |
| 5 | `13-lab-login.spec.ts` | **신규** — Lab 로그인 플로우 E2E (온보딩 → Lab 키 주입 → config 확인 → balance 표시, 5 테스트) |

### 테스트 결과
- Agent: 188 pass
- Shell: 202 pass
- Rust: 58 pass
- TypeScript: agent + shell 모두 no errors
- E2E: 12/12 pass (라운드 4 기준), Lab E2E 포함 총 17 specs 추가

## 남은 백로그
- API key 보안 저장소 전환 (localStorage → Tauri secure storage)
- OAuth nonce/state (lab.cafelua.com 서버 변경 필요)
- AppImage SHA256 체크섬 검증
