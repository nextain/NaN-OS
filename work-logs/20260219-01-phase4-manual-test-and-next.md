# Naia OS Phase 4: 수동 테스트 + 다음 단계

- **시작일**: 2026-02-19
- **상태**: 🟡 진행 중
- **프로젝트**: Naia-OS
- **담당**: luke + Claude

---

## 오늘 목표

1. **회귀 테스트** — 자동 테스트 전부 통과 확인
2. **수동 테스트 (Step 4-2)** — Gateway 라이프사이클 + 도구 실행 + 권한/감사
3. **버그 수정** — 수동 테스트에서 발견되는 이슈 즉시 수정
4. **다음 단계 판단** — Step 4-3(Skills) 또는 Step 4-4(메모리) 착수

## 재개 명령어

```bash
# 1. 회귀 테스트
cd Naia-OS/agent && pnpm test
cd Naia-OS/shell && pnpm test
cargo test --manifest-path Naia-OS/shell/src-tauri/Cargo.toml

# 2. E2E 테스트 (Playwright — Vite 자동 시작)
cd Naia-OS/shell && pnpm run test:e2e

# 3. 앱 실행 (수동 테스트)
cd Naia-OS/shell && pnpm run tauri dev
```

## 수동 테스트 체크리스트

### Gateway 라이프사이클

- [ ] Gateway 끈 상태 → `pnpm tauri dev` → "[Nextain] Gateway spawned" 로그
- [ ] Gateway 켠 상태 → 앱 시작 → "[Nextain] Gateway already running" 로그
- [ ] 앱 종료 → 자동 spawn한 Gateway만 종료 확인

### 도구 실행

- [x] `execute_command`: 채팅으로 "현재 디렉토리에서 ls 해줘" ← E2E 자동화
- [x] `write_file`: "~/test-alpha.txt에 hello 써줘" ← E2E 자동화
- [x] `read_file`: "~/test-alpha.txt 읽어줘" ← E2E 자동화
- [ ] `apply_diff`: "~/test-alpha.txt에서 hello를 world로 바꿔줘"
- [x] `search_files`: "agent 폴더에서 gateway 포함된 파일 찾아줘" ← E2E 자동화

### 권한 + 감사

- [ ] Tier 1-2 도구 실행 시 승인 모달 표시
- [ ] 거부(reject) 시 정상 처리
- [ ] 작업 탭 → Audit Log 기록 확인

### 에러 케이스

- [ ] 존재하지 않는 파일 읽기 요청
- [ ] 권한 거부 후 재시도

---

## 작업 기록

### 2026-02-19

**세션 17** — Playwright E2E 테스트 자동화:

1. **Playwright 설치 + 설정**
   - `@playwright/test` devDep 추가, `test:e2e` 스크립트 추가
   - `playwright.config.ts` — webServer로 Vite 자동 시작, chromium only
   - `vite.config.ts` — Vitest에서 e2e/ 폴더 제외 설정 추가

2. **Tauri IPC 모킹 해결**
   - Playwright는 순수 브라우저에서 접근 → `__TAURI_INTERNALS__` 없어서 React 마운트 실패
   - `addInitScript`로 Tauri IPC 전체 모킹: metadata, invoke, event system, convertFileSrc
   - `localStorage`에 config 주입 → SettingsModal 차단 해결

3. **E2E 테스트 5개 구현** (`shell/e2e/chat-tools.spec.ts`)
   - 앱 로드 — chat panel visible ✅
   - 채팅 전송 — assistant 응답 수신 ✅
   - execute_command — tool activity + tool-success 표시 ✅
   - write_file + read_file — 파일 쓰기/읽기 검증 ✅
   - search_files — tool activity 표시 ✅

4. **전체 자동 검증 구조 완성**
   - `pnpm test:e2e` 한 번으로 Vite 시작 → E2E 실행 → 종료
   - 수동 테스트 항목 중 도구 실행 4개를 자동화 완료

**검증 결과:**
- Shell 유닛: 124 passed (16 files)
- Agent 유닛: 123 passed (14 files)
- Shell E2E: 5 passed (15.3s)
