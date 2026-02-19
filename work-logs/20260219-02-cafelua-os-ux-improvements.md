# Cafelua OS UX 개선 & 매뉴얼 작업

## 날짜
- 시작: 2026-02-19
- 진행 중

## 프로젝트
`cafelua-os` (Shell + Agent) + `project-lab.cafelua.com` (매뉴얼)

---

## 완료된 작업

### 1. OnboardingWizard Lab 로그인 스킵 수정 ✅
- **문제**: Lab 로그인 후 `lab_auth_complete` 이벤트에서 무조건 `setStep("complete")` → 첫 사용자도 이름/캐릭터/성격 설정 스킵됨
- **수정**: `existing?.agentName && existing?.userName` 체크 → 기존 사용자만 완료로, 신규는 `agentName` 단계로
- **파일**: `shell/src/components/OnboardingWizard.tsx` (193-199줄)

### 2. Settings Lab 섹션 개선 ✅
- "Lab 계정" → "Cafelua 랩 계정" 이름 변경
- 크레딧 잔액 표시 (Gateway `/v1/profile/balance` API)
- 대시보드/충전 링크 버튼 추가
- 연결 해제 버튼 추가
- **파일**: `shell/src/components/SettingsTab.tsx`, `shell/src/lib/i18n.ts`, `shell/src/styles/global.css`

### 3. 설정 Lab 자동 동기화 ✅
- 설정 저장 시 Lab 연결 상태면 Gateway에 config 동기화 (PATCH `/v1/users/{userId}`)
- 비밀키 제외, fire-and-forget 방식
- **파일**: `shell/src/components/SettingsTab.tsx`, `shell/src/components/OnboardingWizard.tsx`

### 4. Skills 탭 UX 개선 ✅
- 스킬 카드 클릭 시 상세 설명 펼침 (expandable)
- "?" 버튼으로 AI에게 스킬 설명 요청 (채팅 탭으로 전환)
- **파일**: `shell/src/components/SkillsTab.tsx`, `shell/src/components/ChatPanel.tsx`

### 5. 탭 순서 변경 ✅
- 채팅 → 기록 → 작업 → 스킬 → 설정
- **파일**: `shell/src/components/ChatPanel.tsx`

### 6. AI 앱 지식 강화 ✅
- system-prompt.ts에 "App Features" 섹션 추가 (모든 탭/기능 설명)
- **파일**: `agent/src/system-prompt.ts`

### 7. 설정에 매뉴얼 링크 ✅
- Settings 하단에 사용자 매뉴얼 버튼 추가
- **파일**: `shell/src/components/SettingsTab.tsx`

### 8. 날씨 스킬 수정 ✅ (2026-02-19)
- **문제**: Gateway `skills.invoke("weather")` 의존 → Gateway에 날씨 서비스 미구성 시 실패
- **수정**: Gateway 의존 제거, wttr.in 무료 API 직접 호출로 변경
  - `requiresGateway: false`, `tier: 0`
  - 온도(°C/°F), 체감온도, 습도, 바람, UV 지수 반환
- **파일**: `agent/src/skills/built-in/weather.ts`, `agent/src/skills/__tests__/weather.test.ts`

### 9. 도구 파이프라인 수정 — Gateway 없이 스킬 사용 가능 ✅ (2026-02-19)
- **문제**: `index.ts`에서 `enableTools && gatewayUrl` 조건으로 모든 도구를 Gateway에 묶음
  → Gateway URL 미설정 시 `skill_skill_manager`, `skill_time` 등 Gateway 불필요 스킬도 사용 불가
  → Alpha가 스킬 관리 요청에 "그 기능 없다"고 답함
- **원인 분석**:
  1. `index.ts:104-107`: `tools = enableTools && gatewayUrl ? getAllTools(true, disabled) : undefined`
  2. `index.ts:172`: `if (toolCalls.length === 0 || !gateway) break` — gateway null이면 도구 실행 중단
  3. `executeTool()`: `client: GatewayClient` 필수 → null 전달 불가
- **수정**:
  1. `index.ts`: `tools = enableTools ? getAllTools(hasGateway, disabled) : undefined` — Gateway 없어도 비Gateway 스킬 활성
  2. `index.ts`: `!gateway` 조건 제거 — 도구 실행 루프가 gateway null에서도 계속
  3. `executeTool()`: `client: GatewayClient | null` — 스킬을 먼저 체크, gateway 도구만 연결 필요
  4. 스킬 실행을 switch 앞에 배치 (gateway 체크 전에 처리)
- **파일**: `agent/src/index.ts`, `agent/src/gateway/tool-bridge.ts`
- **NOTE**: `skill_skill_manager`는 이미 구현 완료 상태였음 (Phase 2 계획서에 미완으로 기록되어 혼동)

### 10. 단위 테스트 결과 ✅ (2026-02-19)
- Agent: 216 pass, 38 skipped (E2E) — 타입 에러 없음
- Shell: 238 pass

### 11. 매뉴얼 멀티페이지 전환 ✅ (2026-02-19)
- 단일 페이지 `manual.md` → 섹션별 10개 개별 페이지로 분리
- `/manual` (목차 TOC) → `/manual/getting-started`, `/manual/chat`, ...
- 동적 라우팅: `[slug]/page.tsx` + `generateStaticParams()`
- Prev/Next 네비게이션, 목차로 돌아가기 링크
- **매뉴얼 섹션 (10개)**: getting-started, main-screen, chat, history, progress, skills, settings, tools, lab, troubleshooting
- **파일**:
  - `project-lab.cafelua.com/src/app/[lang]/(public)/manual/page.tsx` — TOC 인덱스
  - `project-lab.cafelua.com/src/app/[lang]/(public)/manual/[slug]/page.tsx` — 동적 페이지
  - `project-lab.cafelua.com/src/lib/manual-docs.ts` — 슬러그 기반 마크다운 로더
  - `project-lab.cafelua.com/src/components/manual/manual-markdown.tsx` — 커스텀 렌더러 (이미지, 테이블, 코드 등)
  - `project-lab.cafelua.com/src/content/manual/ko/*.md` — 한국어 콘텐츠 10개
  - `project-lab.cafelua.com/src/content/manual/en/*.md` — 영어 콘텐츠 10개
  - `project-lab.cafelua.com/src/i18n/dictionaries/types.ts` — manual 섹션 타입
  - `project-lab.cafelua.com/src/i18n/dictionaries/ko.ts`, `en.ts` — 번역

---

## 진행 중 작업

### T1. Playwright 스크린샷 캡처 ✅ (완료 — 2026-02-19)

**상태**: 버그 2개 수정 완료, ko/en 전체 스크린샷 캡처 완료

**접근법**: wdio/tauri-driver 방식이 계속 실패 → **Playwright로 전환** (사용자 제안)
- Playwright는 Tauri IPC를 목(mock)으로 대체, `localhost:1420` Vite dev 서버에서 실행
- `page.screenshot()` 내장 지원
- 기존 `shell/e2e/chat-tools.spec.ts`의 목 구조 재사용 + 확장

**스크립트 파일**: `shell/e2e/screenshots.spec.ts`

**캡처 성공한 스크린샷** (ko + en 모두):
- `onboarding-provider.png` — 온보딩 제공자 선택 화면
- `main-screen.png` — 메인 채팅 화면
- `chat-text.png` — 채팅 입력 중
- `chat-response.png` — AI 응답 완료
- `history-tab.png` — 기록 탭
- `progress-tab.png` — 작업(진행) 탭

**저장 위치**:
- `project-lab.cafelua.com/public/manual/ko/*.png` (24개)
- `project-lab.cafelua.com/public/manual/en/*.png` (24개)

**남은 버그 2개**:

#### 버그 1: 온보딩 API key 단계 strict mode 위반 (해결)
```
Error: strict mode violation: locator('.onboarding-input').or(locator('.onboarding-content'))
resolved to 2 elements
```
- **원인**: `.or()` 로케이터가 `.onboarding-content`와 `.onboarding-input` 둘 다 매칭
- **적용**: `.or()` 제거, `.onboarding-input` 단일 locator로 변경
- **위치**: `cafelua-os/shell/e2e/screenshots.spec.ts`

#### 버그 2: Skills 탭 (4번째 탭) 클릭 타임아웃 (해결)
```
Error: locator.click: Test timeout of 60000ms exceeded.
waiting for locator('.chat-tab:nth-child(4)')
```
- **원인**: `nth-child` 기반 탭 클릭이 비결정적으로 실패하고, Progress 이후 탭 DOM 소실 케이스 존재
- **적용**:
  - 탭 클릭 헬퍼 추가(`clickTab`): 텍스트 후보 + key 후보 + 인덱스 fallback
  - Progress 캡처 후 `page.goto("/")`로 메인앱 재진입 후 Skills/Settings 캡처
- **위치**: `cafelua-os/shell/e2e/screenshots.spec.ts`

**캡처 결과**:
- 한국어: 24개 캡처 완료 (`project-lab.cafelua.com/public/manual/ko/*.png`)
- 영어: 24개 캡처 완료 (`project-lab.cafelua.com/public/manual/en/*.png`)

**실행 방법**: `cd cafelua-os/shell && pnpm exec playwright test e2e/screenshots.spec.ts`
**검증 결과**: `4 passed (52.1s)` (경로 수정 후 재검증)

**추가 수정 (2026-02-19)**:
- 스크린샷 저장 경로 수정:
  - `cafelua-os/shell/e2e/screenshots.spec.ts`
  - `MANUAL_BASE`: `../../project-lab.cafelua.com/public/manual` → `../../../project-lab.cafelua.com/public/manual`
- 매뉴얼 이미지 참조 경로 정합성 업데이트:
  - `project-lab.cafelua.com/src/content/manual/ko/getting-started.md`
  - `project-lab.cafelua.com/src/content/manual/en/getting-started.md`
  - `project-lab.cafelua.com/src/content/manual/ko/chat.md`
  - `project-lab.cafelua.com/src/content/manual/en/chat.md`
  - `project-lab.cafelua.com/src/content/manual/ko/settings.md`
  - `project-lab.cafelua.com/src/content/manual/en/settings.md`

---

## 남은 작업 (다음 AI가 할 것)

### ⚡ P0. 모바일 클라이언트 분리 전략 추가 (메신저 대체)
- 목표: Telegram/Slack 같은 외부 메신저 의존을 줄이고, 모바일 앱을 알림/승인 허브로 사용
- 방향:
  - `lab` 계정 로그인 기반으로 모바일 클라이언트 연결
  - 작업 성공/실패/요약을 푸시 알림으로 전달
  - 모바일에서 승인/재시도/요약 확인 가능하게 설계
  - 외부 메신저는 선택형 브리지(고급 옵션)로 유지
- 이유: Telegram 키/봇 토큰 발급 등 사용자 설정 부담이 큼

### ⚡ P1. 매뉴얼 콘텐츠에 스크린샷 경로 반영
- 완료: 주요 불일치 경로 수정
- 완료: `lab.md` 전용 이미지 4종(ko/en) 생성 완료
  - `lab-dashboard.png`, `lab-usage.png`, `lab-logs.png`, `lab-keys.png`
  - 생성 스크립트: `cafelua-os/shell/scripts/generate-lab-manual-images.mjs`

### P2. lab.cafelua.com 빌드 확인
- 완료: `npm run build` 성공 (Next.js 16.1.6)

### P3. 커밋 (기능별 분리 권장)
- 커밋 1: Agent 수정 (weather + tool pipeline)
- 커밋 2: Shell UX 개선 (onboarding + settings + skills + tabs)
- 커밋 3: 매뉴얼 (lab.cafelua.com 콘텐츠 + 스크린샷)

---

## 변경 파일 목록 (현재 uncommitted)

### cafelua-os/agent
| 파일 | 작업 | 설명 |
|------|------|------|
| `src/index.ts` | MOD | Gateway 없이 스킬 사용 가능 (도구 파이프라인 수정) |
| `src/gateway/tool-bridge.ts` | MOD | executeTool gateway nullable, 스킬 우선 실행 |
| `src/skills/built-in/weather.ts` | MOD | wttr.in 직접 호출 (Gateway 의존 제거) |
| `src/skills/__tests__/weather.test.ts` | MOD | 새 API 테스트 (mock fetch) |
| `src/__tests__/skills-e2e.test.ts` | MOD | weather 테스트 업데이트 |
| `src/__tests__/tool-bridge-filter.test.ts` | MOD | 주석 업데이트 |
| `src/system-prompt.ts` | MOD | App Features + skill_manager/weather 안내 추가 |
| `src/providers/cost.ts` | MOD | AbortSignal 지원 |
| `src/providers/factory.ts` | MOD | AbortSignal 전달 |
| `src/providers/types.ts` | MOD | stream() 시그니처 변경 |

### cafelua-os/shell
| 파일 | 작업 | 설명 |
|------|------|------|
| `src/components/OnboardingWizard.tsx` | MOD | Lab 로그인 스킵 수정 + Lab 동기화 |
| `src/components/SettingsTab.tsx` | MOD | Lab 섹션 개선 + 매뉴얼 링크 |
| `src/components/SkillsTab.tsx` | MOD | 확장형 카드 + AI 질문 버튼 |
| `src/components/ChatPanel.tsx` | MOD | 탭 순서 + onAskAI 콜백 + config_update 핸들러 |
| `src/components/__tests__/OnboardingWizard.test.tsx` | MOD | 테스트 업데이트 |
| `src/components/__tests__/SkillsTab.test.tsx` | MOD | 테스트 업데이트 |
| `src/lib/config.ts` | MOD | LAB_GATEWAY_URL 상수 |
| `src/lib/i18n.ts` | MOD | 새 번역 키 |
| `src/lib/types.ts` | MOD | config_update 청크 타입 |
| `src/styles/global.css` | MOD | Lab/스킬 스타일 |
| `src-tauri/src/lib.rs` | MOD | skill_skill_manager 빌트인 추가 |
| `e2e/screenshots.spec.ts` | NEW→MOD | Playwright 스크린샷 캡처 (버그 수정 완료) |
| `e2e-tauri/helpers/selectors.ts` | MOD | 탭 순서 셀렉터 수정 |
| `e2e-tauri/specs/01-app-launch.spec.ts` | MOD | localStorage 바이패스 |
| `e2e-tauri/specs/02-configure.spec.ts` | MOD | before hook + 셀렉터 수정 |
| `e2e-tauri/specs/16-skill-weather.spec.ts` | NEW | 날씨 스킬 E2E |
| `e2e-tauri/specs/99-screenshots.spec.ts` | NEW | wdio 스크린샷 (Playwright로 대체됨, 삭제 가능) |

### project-lab.cafelua.com
| 파일 | 작업 | 설명 |
|------|------|------|
| `src/app/[lang]/(public)/manual/page.tsx` | NEW→MOD | 목차 인덱스 페이지 |
| `src/app/[lang]/(public)/manual/[slug]/page.tsx` | NEW | 동적 섹션 페이지 |
| `src/lib/manual-docs.ts` | NEW→MOD | 슬러그 기반 마크다운 로더 |
| `src/components/manual/manual-markdown.tsx` | NEW | 커스텀 마크다운 렌더러 |
| `src/content/manual/ko/*.md` (10개) | NEW | 한국어 매뉴얼 콘텐츠 |
| `src/content/manual/en/*.md` (10개) | NEW | 영어 매뉴얼 콘텐츠 |
| `src/i18n/dictionaries/types.ts` | MOD | manual 섹션 타입 |
| `src/i18n/dictionaries/ko.ts` | MOD | 한국어 번역 |
| `src/i18n/dictionaries/en.ts` | MOD | 영어 번역 |
| `src/components/layout/header.tsx` | MOD | 매뉴얼 네비게이션 |
| `public/manual/ko/*.png` (28개) | NEW | 한국어 스크린샷 (Shell 24 + Lab 4) |
| `public/manual/en/*.png` (28개) | NEW | 영어 스크린샷 (Shell 24 + Lab 4) |

---

## 기술 참고사항

### Playwright 스크린샷 접근법
- wdio/tauri-driver 방식은 온보딩 오버레이, 세션 격리, 포트 충돌 등으로 반복 실패
- Playwright는 `localhost:1420` Vite dev에 직접 연결, Tauri IPC를 `page.addInitScript()`로 목 주입
- 기존 `e2e/chat-tools.spec.ts`의 목 구조를 확장하여 `list_skills`, `get_audit_log`, `memory_*` 등 추가 명령어 처리
- `page.screenshot()` 네이티브 지원으로 안정적 캡처

### 온보딩 단계 순서 (STEPS 배열)
1. provider → 2. apiKey → 3. agentName → 4. userName → 5. character → 6. personality → 7. complete
- Lab key가 있으면 apiKey 단계 자동 스킵

### 탭 순서 (현재)
1. 채팅 → 2. 기록 → 3. 작업(Progress) → 4. 스킬 → 5. 설정
