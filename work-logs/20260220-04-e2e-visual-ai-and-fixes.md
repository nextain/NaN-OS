# 20260220-04-e2e-visual-ai-and-fixes.md

## 개요
- **주제**: E2E 테스트 안정화 및 시각적(Visual) AI 검증 도입
- **상태**: Doing
- **날짜**: 2026-02-20
- **목표**: 
  1. 잔여 E2E 실패 케이스 재검증 (spec 14, 38, 43)
  2. spec 62-63 간 `invalid session id` 크래시 분석 및 해결
  3. 시각적 검증 프로토타입(`assertVisual`) 도입

## 진행 상황

### Step 1: 잔여 실패 케이스 검증 (Spec 14, 38, 43) [완료]
- `14-skills-tab.spec.ts`: PASS 확인 (로딩 대기 정상 동작)
- `38-file-operations.spec.ts`: PASS 확인 (의미론적 조건 완화 정상 동작)
- `43-device-management.spec.ts`: PASS 확인 (의미론적 조건 완화 정상 동작)

### Step 2: 62-63 Spec 크래시 분석 [완료]
- `63-sessions-actions.spec.ts` 실행 중 발생하는 `invalid session id` 원인 분석
- 원인: `63-sessions-actions.spec.ts`의 `before` 블록에서 호출되는 `safeRefresh()` (즉, `browser.refresh()`)가 WebKitGTK/Tauri 렌더러와 충돌을 일으켜 Tauri 앱 자체가 강제 종료(Terminating agent-core...)되는 현상 확인.
- 해결: 불필요한 `safeRefresh()` 제거 (이미 62번 spec 끝에서 정상 상태로 초기화되므로 불필요).

### Step 3: 시각적 검증(Visual Assertion) 프로토타입 개발 [완료]
- `helpers/semantic.ts`에 `assertVisual` 및 `judgeVisualSemantics` 헬퍼 함수를 추가 완료.
- Gemini의 멀티모달 능력을 활용하여 `browser.takeScreenshot()`으로 얻은 base64 이미지를 `inlineData`로 전송하고 결과를 분석하는 구조 완성.
