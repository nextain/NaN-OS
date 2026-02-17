# 구현 계획

## 핵심 전략: 배포 먼저, 기능은 점진적으로

```
❌ 기존: 기능 완성 → 배포
✅ 변경: 배포 파이프라인 먼저 → 기능을 계속 추가
```

BlueBuild + GitHub Actions는 push할 때마다 자동으로 OS 이미지를 빌드한다.
즉, **Day 1부터 배포 가능**. 매 Phase마다 새 ISO가 나온다.

---

## Phase 0: 배포 파이프라인 (Day 1-3)

> **결과물**: GitHub에 push하면 Cafelua OS 이미지가 자동 빌드됨

### 0-1. BlueBuild 템플릿 세팅

**작업:**
- `os/` 디렉토리에 BlueBuild recipe 생성
- GitHub Actions 워크플로우 설정
- Bazzite를 base-image로 지정

```yaml
# os/recipe.yml
name: cafelua-os
description: Personal AI OS with Alpha
base-image: ghcr.io/ublue-os/bazzite
image-version: latest

modules:
  - type: rpm-ostree
    install: [nodejs20]
  - type: files
    files:
      - source: usr/
        destination: /usr/
```

### 0-2. GitHub Actions 자동 빌드

**작업:**
- BlueBuild GitHub Action 설정
- push → 이미지 빌드 → ghcr.io 게시
- ISO 생성 (ublue-os/isogenerator)

**결과:**
```
git push → GitHub Actions → ghcr.io/luke-n-alpha/cafelua-os:latest
                          → cafelua-os.iso (Releases)
```

### Phase 0 완료 = 배포 가능
```
✅ BlueBuild recipe 동작
✅ push마다 OS 이미지 자동 빌드
✅ ISO 다운로드 가능 (GitHub Releases)
✅ USB에 구워서 부팅 확인 (아직 Bazzite 그대로)
```

**이 시점에 공유 가능:** "Cafelua OS 첫 이미지 나왔다" (아직은 Bazzite + Node.js뿐이지만)

---

## Phase 1: Alpha가 화면에 나타난다 (Week 1)

> **결과물**: Bazzite 부팅 → Alpha 아바타가 자동으로 화면에 등장

### 스택
- **Tauri 2** (데스크탑 앱)
- **React 18+ / TypeScript / Vite**
- **Three.js r0.182 + @pixiv/three-vrm ^3.4.5**
- **shadcn/ui** (UI 컴포넌트)
- **Zustand** (상태관리)
- **Biome** (포맷터: 탭, 더블쿼트, 세미콜론)

### 1-1. Tauri 2 + React 프로젝트 초기화

**작업:**
- `shell/`에 React + TS + Vite 프로젝트 셋업
- Biome 설정, shadcn/ui 설치
- Three.js + @pixiv/three-vrm + zustand 설치
- Tauri 2 백엔드 (Cargo.toml, tauri.conf.json, main.rs, lib.rs)

### 1-2. AIRI VRM 코어 추출

**AIRI에서 그대로 복사 (순수 Three.js):**
| 원본 | 대상 |
|------|------|
| `stage-ui-three/composables/vrm/core.ts` | `src/lib/vrm/core.ts` |
| `stage-ui-three/composables/vrm/loader.ts` | `src/lib/vrm/loader.ts` |
| `stage-ui-three/composables/vrm/utils/eye-motions.ts` | `src/lib/vrm/eye-motions.ts` |
| `stage-ui-three/assets/vrm/animations/idle_loop.vrma` | `public/animations/idle_loop.vrma` |

**순수 함수 추출:**
- `animation.ts` → `loadVRMAnimation`, `clipFromVRMAnimation`, `reAnchorRootPositionTrack`

### 1-3. Vue → React 훅 포팅

| 훅 | 원본 | 변경 내용 |
|-----|------|-----------|
| `useBlink.ts` | `animation.ts`의 `useBlink()` | Vue `ref()` → React `useRef` |
| `useIdleEyes.ts` | `animation.ts`의 `useIdleEyeSaccades()` | Vue `ref()` → React `useRef`, `Ref<>` 제거 |

### 1-4. AvatarCanvas 컴포넌트

**작업:**
- Three.js WebGLRenderer + Scene + Camera 셋업
- VRM 로딩 (core.ts 사용)
- idle 애니메이션 재생 (idle_loop.vrma)
- 렌더 루프 순서: animation → humanoid → lookAt → blink → saccade → expression → springBone

### 1-5. Tauri 윈도우 설정
- 기본 윈도우 (투명/borderless는 Phase 2에서)
- 앱 타이틀: "Cafelua Shell"

### 1-6. 통합 확인
- `pnpm tauri dev` 실행 → 아바타 표시 확인

### Phase 1 완료 = 첫 데모
```
✅ USB 부팅하면 Alpha가 화면에 나타남
✅ VRM 3D 아바타, 눈 깜빡임, idle 모션, 눈 미세 움직임
✅ Spring Bone 물리 (머리카락 흔들림)
✅ 아직 대화 불가 (다음 Phase)
```

**이 시점에 공유 가능:** "USB 꽂으면 AI 캐릭터가 맞이하는 OS" (스크린샷/영상)

---

## Phase 2: Alpha와 대화할 수 있다 (Week 2)

> **결과물**: 채팅 패널에서 Alpha와 텍스트 대화. 표정 변화 + 립싱크.

### 핵심 호환성 요구사항

| 표준 | 설명 | 참조 |
|------|------|------|
| **AAIF** | Agentic AI Foundation (리눅스 재단, 2025.12) 3대 표준 준수 | project-careti F06 |
| **AGENTS.md** | 컨텍스트 레이어 (OpenAI 기증) — 계층적 적용 | AAIF Pillar 1 |
| **SKILL.md** | 실행 레이어 — 절차적 지식 패키지 | AAIF Pillar 2 |
| **MCP** | 연결성 레이어 (Anthropic 기증) — 외부 도구 연결 | AAIF Pillar 3 |
| **Claude Code 호환** | CLAUDE.md, `.claude/` ↔ `.agents/` 상호운용 | project-careti F06 |
| **Careti 컨텍스트 호환** | project-careti의 `.agents/` 컨텍스트를 그대로 소비 가능 | project-careti F06 |

**기본 프로바이더:** Google (Gemini) — 채팅/TTS/비전 통합; Claude는 코딩 작업용
**과금 표시:** 요청별 비용 표시 (project-careti 패턴 참고)

### 2-1. Agent Core 최소 구현

**LLM 프로바이더:** xAI (Grok), Google (Gemini), Anthropic (Claude) — project-careti 프로바이더 참고

**작업:**
- `agent/`에 Node.js 프로젝트
- LLM 3개 연결 (xAI/Google/Claude) — Careti 프로바이더 코드 참고
- AAIF 컨텍스트 소비 (.agents/ + AGENTS.md 계층)
- stdio JSON lines 프로토콜 — Careti stdio-adapter 참고
- Alpha 페르소나 시스템 프롬프트
- API 사용량/과금 표시 (project-careti 참고)

**결과:** `node agent/core.js --stdio` 로 대화 가능

### 2-2. Shell ↔ Agent 연결

**작업:**
- Tauri Rust에서 agent-core spawn — Careti `lib.rs` 복사
- stdio 브릿지 (자동 재시작 포함)
- 채팅 패널 UI + 과금 표시
- 스트리밍 응답 표시

**결과:** 채팅 패널에서 Alpha와 실시간 대화

### 2-3. Avatar 감정 + 립싱크 (Google TTS)

**작업:**
- LLM 응답에서 감정 추출
- VRM 표정 변경 (기쁨, 놀람, 생각 중)
- 응답 중 립싱크

**결과:** Alpha가 말하면서 표정이 바뀌고 입이 움직임

### 2-4. OS 이미지 업데이트

**작업:**
- agent-core 바이너리를 OS 이미지에 포함
- 첫 부팅 시 API 키 입력 화면 (온보딩)
- recipe.yml 업데이트 → 자동 빌드 → 새 ISO

**결과:** 새 ISO로 USB 부팅 → 키 입력 → Alpha와 대화

### Phase 2 완료 = 사용 가능한 데모
```
✅ USB 부팅 → API 키 설정 → Alpha와 대화
✅ 스트리밍 응답
✅ 아바타 표정 변화 + 립싱크
✅ ISO 자동 빌드 (push마다)
```

**이 시점에 공유 가능:** "USB 꽂으면 AI와 대화할 수 있는 OS" (데모 영상)
**관심 끌기에 충분한 지점.**

---

## Phase 3: Alpha가 일을 한다 (Week 3-4)

> **결과물**: Alpha가 파일 편집, 터미널 실행, 웹 검색 가능

### 3-1. 도구 시스템

**작업:**
- Careti 도구 코드 복사 + 정리:
  - `file_read`, `file_write`, `apply_diff` (SmartEditEngine)
  - `execute_command` (터미널)
  - `browser_action` (웹)
  - `search_files` (ripgrep)
- LLM tool calling 연동

**결과:** "메모 만들어줘", "npm install 해줘" → Alpha가 실행

### 3-2. 권한 + 감사

**작업:**
- Tier 0-3 권한 시스템
- 승인 요청 UI
- 감사 로그 (SQLite)

**결과:** 위험 작업은 승인 요청, 전체 이력 기록

### 3-3. 작업 UI

**작업:**
- 작업 진행 패널 (Alpha가 뭘 하고 있는지)
- 터미널 출력 실시간 표시
- 파일 변경 diff

**결과:** Alpha의 작업을 시각적으로 확인

### Phase 3 완료 = 실용적인 AI OS
```
✅ Alpha가 파일 읽기/쓰기/편집
✅ 터미널 명령 실행
✅ 웹 검색
✅ 권한 시스템 + 감사 로그
✅ 작업 진행 UI
```

**이 시점에 공유 가능:** "AI가 실제로 컴퓨터를 조작하는 OS" (데모 영상)

---

## Phase 4: Alpha가 항상 켜져있다 (Week 5-7)

> **결과물**: 데몬으로 항상 실행. 외부 채널에서도 접근 가능.
> **전략**: Gateway 먼저 → Phase 3 실행 검증 → 이후 신규 기능

### 4-0. OpenClaw Gateway 로컬 설정 (선행)

**작업:**
- OpenClaw 설치 + 설정 (`setup-openclaw.sh` 이미 존재)
- Gateway 로컬 기동 (`cafelua-gateway-wrapper`)
- Shell → Agent → Gateway WebSocket 연결 확인

**결과:** `gateway_health()` = true, Agent가 WebSocket으로 연결

### 4-1. Phase 3 E2E 검증

**작업:**
- 8개 도구 런타임 테스트 (read/write/diff/command/search/web_search/browser/spawn)
- 승인 UI 실제 동작 확인 (Tier 1-2 모달)
- Sub-agent 병렬 실행 실제 검증
- Audit log 실제 기록 확인
- 런타임 테스트 중 발견되는 버그 수정

**결과:** 8개 도구 전부 Gateway를 통해 성공적으로 실행

### 4-2. 사용자 테스트 (수동)

**작업:**
- `pnpm tauri dev` → 채팅 → 도구 호출 → 결과 확인
- 파일 읽기/쓰기/편집 시나리오
- 명령 실행 시나리오
- 에러 케이스 (권한 거부, 타임아웃 등)

**결과:** Phase 3 도구 정상 동작 사용자 확인

### 4-3. Skills 시스템

**작업:**
- Skill 레지스트리 + 매칭
- 기본 Skills (날씨, 메모, 시스템 상태)
- 커스텀 Skills 로더 (~/.cafelua/skills/)

### 4-4. 메모리 시스템

**작업:**
- 대화 이력 영속 (SQLite)
- 벡터 검색 (임베딩)
- 관련 쿼리 시 컨텍스트 리콜

### 4-5. 채널 통합

**작업:**
- Discord 봇 (discord.js)
- Telegram 봇 (grammY)
- 외부 채널은 Tier 0-1 권한만

**결과:** 밖에서 "집 PC 상태?" → Alpha 응답

### 4-6. systemd 자동시작 통합

**작업:**
- Gateway 부팅 시 자동 시작
- 헬스 모니터링

### Phase 4 완료 = 완성된 AI OS
```
✅ 부팅 시 자동 시작, 항상 실행
✅ 외부 채널 접근
✅ 대화 기억
✅ Skills 시스템
```

---

## Phase 5: Alpha와 게임을 한다 (Week 8+)

> **결과물**: Minecraft 같이 플레이, 게임 중 아바타 반응

### 5-1. Minecraft (AIRI 포팅)

- Mineflayer 서버 접속
- 자율 행동 (채굴, 건축, 전투)
- 게임 상황 → 대화 반영

### 5-2. 범용 게임

- 화면 캡처 + 비전 모델
- 키/마우스 제어
- 게임별 프로필

### 5-3. 게임 오버레이

- Alpha 아바타 오버레이 표시
- 게임 상황 감정 반응
- 음성 채팅

### Phase 5 완료 = 차별화
```
✅ Minecraft에서 Alpha와 함께 플레이
✅ 게임 중 대화/반응
```

---

## 배포 타임라인

```
Day 1-3:   Phase 0 (파이프라인) → 빈 ISO 나옴
Week 1:    Phase 1 (아바타)     → Alpha가 보이는 ISO
Week 2:    Phase 2 (대화)       → Alpha와 대화하는 ISO  ← 공개 데모
Week 3-4:  Phase 3 (도구)       → Alpha가 일하는 ISO
Week 5-7:  Phase 4 (데몬)       → 완성된 AI OS ISO
Week 8+:   Phase 5 (게임)       → 게임하는 AI OS ISO
```

**매 Phase마다 새 ISO가 나온다.**
push → GitHub Actions → 빌드 → ISO → 다운로드 가능.

## 관심 끌기 포인트

| 시점 | 공유 가능한 것 | 임팩트 |
|------|--------------|--------|
| Phase 0 | "AI OS 프로젝트 시작" | 낮음 (관심자만) |
| Phase 1 | 스크린샷: 부팅하면 아바타가 나타남 | **중간** |
| **Phase 2** | **데모 영상: AI와 대화하는 OS** | **높음 — 여기서 공개** |
| Phase 3 | 데모: AI가 터미널/파일 제어 | 매우 높음 |
| Phase 4 | "Discord에서 집 AI에게 명령" | 높음 |
| Phase 5 | "AI랑 마인크래프트" | 바이럴 가능성 |
