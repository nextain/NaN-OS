# Naia OS: 독립 AI 에이전트 OS 비전 리서치

> **작성일**: 2026-02-15
> **상태**: 🟡 리서치 완료, 방향 결정 필요
> **목적**: MoltBot + OpenCode + Careti + AIRI + jikime 장점을 합친 독립 AI OS 구상
> **배경**: 코딩 에이전트 시장 포화 → "AI가 상주하는 OS" 방향으로 전환

## 문제 인식

### 코딩 에이전트의 강점이 사라지고 있다
- Claude Code, Cursor, Copilot 등이 시장 장악 → 코딩 에이전트는 commoditized
- Careti의 코딩 에이전트 차별점만으로는 지속 가능한 포지셔닝이 어려움
- **새로운 방향**: 코딩을 포함하되, 더 넓은 "개인 AI OS"로 확장

### 왜 "OS"인가?
- 에이전트가 많아지면 관리할 '운영체제'가 필요 (Agent OS 트렌드)
- 기존 비전(`20260125-careti-future-vision`)의 "AI 메신저 플랫폼"을 OS 레벨로 확장
- **Nextain = Lu(ke) + A(lpha)** — 루크와 낸가 함께하는 공간이 곧 OS

---

## 조사한 프로젝트 6개 요약

### 1. MoltBot (OpenClaw) — 멀티채널 AI 데몬

| 항목 | 내용 |
|------|------|
| **핵심** | 단일 Gateway WebSocket 허브로 18+ 채널 통합 |
| **스택** | TypeScript, Node.js 22+, Pi Agent Runtime |
| **강점** | 멀티에이전트 라우팅, 세션 격리, 50+ Skills |
| **특징** | 로컬 데몬 (self-hosted), Canvas(A2UI), 디바이스 노드 프로토콜 |
| **Naia OS에 가져올 것** | **Gateway 아키텍처**, 채널 통합, Skills 시스템, 프라이버시 퍼스트 |

### 2. OpenCode — Provider-Agnostic AI 코딩 에이전트

| 항목 | 내용 |
|------|------|
| **핵심** | Client/Server 분리, 20+ LLM 프로바이더, neovim급 TUI |
| **스택** | TypeScript, Bun 1.3+, Hono, SolidJS |
| **강점** | LSP 네이티브, MCP 통합, 세션 포크/내보내기, 플러그인 |
| **특징** | TUI + Web + Desktop(Tauri) 멀티 프론트엔드 |
| **Naia OS에 가져올 것** | **Client/Server 분리**, Provider 추상화, LSP, Permission 시스템 |

### 3. Careti — VS Code AI 확장 (Cline 포크) + Desktop Mode

| 항목 | 내용 |
|------|------|
| **핵심** | 266+ 모델, 31 프로바이더, 페르소나 시스템, 문서 읽기 |
| **스택** | TypeScript, Go (CLI), gRPC, Tauri 2 (Desktop) |
| **강점** | SmartEditEngine, 다국어 i18n, AAIF 표준, Message Queue |
| **특징** | Tauri Desktop 모드 이미 구현됨 (3-tier: webview-ui → Tauri → cline-core) |
| **Naia OS에 가져올 것** | **페르소나 시스템**, SmartEditEngine, 문서 파서, 계정 시스템 |

**Careti Desktop 아키텍처 (이미 구현됨):**
```
webview-ui (React 19)
  ↓ standalonePostMessage(json)
Tauri 2 (Rust) — stdio 브릿지, 창 관리, 파일 다이얼로그
  ↓ child.stdin (JSON lines)
cline-core (Node.js 번들, 45MB) — 전체 AI 로직
  ↓ stdout (JSON response)
```

**Desktop 장점 (Naia OS 관점):**
- 266+ 모델 연결 + 31 프로바이더 — LLM 연결 인프라 그대로 재사용
- 20+ 코딩 툴 (파일 편집, 브라우저, 터미널 실행, MCP) — 이미 검증된 도구 세트
- 서브에이전트 구조 (Task tool) — 병렬 에이전트 실행 가능
- 터미널 실행 (execute_command) — AI가 시스템 명령 직접 호출
- stdio 프로토콜 — Tauri ↔ cline-core 분리 이미 완성
- 자동 재시작 — cline-core 크래시 시 500ms 내 복구
- PlatformType.STANDALONE 추상화 — VS Code/Desktop 코드 95% 공유

### 4. Project AIRI — AI VTuber 프레임워크

| 항목 | 내용 |
|------|------|
| **핵심** | LLM 기반 "디지털 생명체" — 눈(CV), 귀(ASR), 입(TTS), 몸(VRM) |
| **스택** | Vue 3, Electron, Capacitor, Rust (Tauri 플러그인) |
| **강점** | 모듈러 플러그인 SDK, Spark 오케스트레이션 프로토콜, MCP |
| **특징** | Web + Desktop(Electron) + Mobile(Capacitor), DuckDB WASM |
| **Naia OS에 가져올 것** | **아바타 렌더링(VRM/Live2D)**, 플러그인 프로토콜, 멀티에이전트 조율 |

### 5. jikime-adk — Agentic Development Kit

| 항목 | 내용 |
|------|------|
| **핵심** | 레거시 코드 현대화 전문 ADK, 57+ 에이전트, 67 스킬 |
| **스택** | Go 1.24+, SQLite, ChromaDB |
| **강점** | J.A.R.V.I.S./F.R.I.D.A.Y. 듀얼 오케스트레이션, 2-Layer 메모리 |
| **특징** | Agent Teams (병렬 멀티에이전트), Ralph Loop (LSP 피드백) |
| **Naia OS에 가져올 것** | **스킬 카탈로그 패턴**, 에이전트 팀 오케스트레이션, 메모리 아키텍처 |

### 6. jikime-mem — 세션 메모리 시스템

| 항목 | 내용 |
|------|------|
| **핵심** | Claude Code 세션 간 컨텍스트 지속성 |
| **스택** | TypeScript/Bun, Next.js 16, SQLite + ChromaDB |
| **강점** | 하이브리드 검색 (0.7 벡터 + 0.3 BM25), 프로젝트별 DB 격리 |
| **특징** | 웹 대시보드, MCP 서버, 훅 기반 자동 수집 |
| **Naia OS에 가져올 것** | **하이브리드 메모리 검색**, 세션 영속성, 대시보드 UI 패턴 |

---

## Naia OS 합성 아키텍처 (초안)

### 계층 구조

```
┌─────────────────────────────────────────────────────────┐
│                    Naia OS                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [UI Layer]                                             │
│   ├── Nextain Space (공간 메타포 UX)  ← naia.com    │
│   ├── Naia Avatar (VRM/Live2D)       ← AIRI           │
│   ├── TUI Mode (터미널)               ← OpenCode       │
│   └── 채널 UI (Discord, Telegram...) ← MoltBot         │
│                                                         │
│  [Agent Layer]                                          │
│   ├── 페르소나 시스템                  ← Careti         │
│   ├── 멀티에이전트 라우팅              ← MoltBot        │
│   ├── Plan/Build 모드                  ← OpenCode       │
│   ├── 에이전트 팀 오케스트레이션       ← jikime-adk     │
│   └── Spark 프로토콜                   ← AIRI           │
│                                                         │
│  [Core Layer]                                           │
│   ├── Gateway (WebSocket 허브)         ← MoltBot        │
│   ├── Client/Server 분리               ← OpenCode       │
│   ├── Provider 추상화 (20+ LLM)       ← OpenCode       │
│   ├── MCP + A2A 프로토콜               ← 공통           │
│   └── Permission 시스템                ← OpenCode       │
│                                                         │
│  [Memory Layer]                                         │
│   ├── 하이브리드 검색                  ← jikime-mem     │
│   ├── DuckDB WASM (브라우저)           ← AIRI           │
│   ├── 세션 영속성                      ← jikime-mem     │
│   └── Skills 카탈로그                  ← jikime-adk     │
│                                                         │
│  [Platform Layer]                                       │
│   ├── Bazzite (불변 Linux OS)          ← 기반 OS        │
│   ├── Tauri (데스크탑 셸)              ← Careti/AIRI    │
│   ├── 디바이스 노드                    ← MoltBot        │
│   └── Mobile (Capacitor)               ← AIRI           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 빠른 데모 경로: Bazzite + MoltBot

```
Phase 0 (가장 빠른 데모):
  Bazzite ISO + MoltBot 데몬 = "AI가 항상 켜져있는 리눅스"
  → systemd로 MoltBot 자동 시작
  → WebChat으로 로컬 AI 대화
  → Naia 페르소나 적용 (Careti에서 가져옴)
```

### 본격 경로: Naia OS

```
Phase 1: AIRI 아바타 + MoltBot Gateway 통합
  → Naia가 화면에 상주하면서 멀티채널 대응

Phase 2: OpenCode 코어 + jikime 메모리 합체
  → 코딩 에이전트 기능 + 세션 메모리 영속성

Phase 3: Nextain Space UX
  → 카페 공간 메타포의 OS 인터페이스
  → 1층(라운지) = 일상 대화, 2층(아틀리에) = 작업 공간
```

---

## 기존 문서와의 관계

| 기존 문서 | 이 문서와의 관계 |
|-----------|-----------------|
| `20260125-01-careti-future-vision.md` | AI 메신저 비전 → **OS로 확장** |
| `20260127-01-careti-standalone-architecture.md` | Tauri 독립앱 → **OS의 셸** |
| `20260114-cline-opencode-caret-analysis.md` | 기술 비교 → **합성 근거** |
| `20260109-opencode-vs-caret-analysis.md` | OpenCode 강점 → **Core Layer 반영** |
| `naia.com/data/alpha/project소개.md` | Naia 비전 → **OS의 주인공** |

---

## 참고: jikime ≠ MoltBot

혼동 방지를 위해 기록:
- **MoltBot(OpenClaw)**: Peter Steinberger의 멀티채널 AI 메신저 데몬 (MIT)
- **jikime-adk**: Goos.Kim의 MoAI-ADK 기반 레거시 현대화 도구 (Copyleft-3.0)
- **jikime-mem**: jikime의 Claude Code 세션 메모리 (MIT)
- 세 프로젝트는 **완전히 별개**이며, 목적과 저자가 다름

---

## 결정된 방향: Bazzite + Avatar + 독립 UI = 배포형 AI OS

### 핵심 결정 (2026-02-15)

```
❌ 맥북 대상 → ✅ Bazzite (배포형 Linux OS)
❌ 텍스트 채팅 위주 → ✅ Virtual Avatar (Naia, VRM/Live2D)
❌ 코딩 도구 느낌 → ✅ 독립 UI (OS 셸)
❌ 앱 설치 → ✅ ISO 배포 (설치하면 바로 AI OS)
```

### 왜 Bazzite인가?

| 특성 | Naia OS에 유리한 이유 |
|------|------------------------|
| **불변 OS** (rpm-ostree) | 사용자가 시스템을 망가뜨릴 수 없음, 원자적 업데이트/롤백 |
| **GPU 드라이버 내장** | NVIDIA/AMD 자동 설정 → Avatar 렌더링에 필수 |
| **게이밍 최적화** | 3D 아바타, WebGPU, 실시간 렌더링 성능 보장 |
| **Fedora Atomic 기반** | 안정적, 최신 패키지, 컨테이너 네이티브 (Podman) |
| **BlueBuild 커스텀** | 커스텀 이미지 빌드 파이프라인 존재 → Naia OS ISO 제작 가능 |
| **Steam Deck 호환** | 게이밍 디바이스까지 확장 가능 |

### 왜 Virtual Avatar인가?

MoltBot이 맥에서 열광받은 이유 = **내 기기에서 돌아가는 강력한 개인 AI**
하지만 텍스트만으로는 "OS" 느낌이 안 남. Avatar가 있어야:
- Naia가 **화면에 살아있는** 존재감
- 텍스트 채팅 → **음성 대화** 자연 확장
- 감정 표현, 상태 표시 → **비언어적 소통**
- "코딩 도구"가 아닌 **"AI 동료가 사는 OS"** 라는 정체성

---

## 구체적 구현 계획

### Phase 0: PoC (2주) — "Bazzite에서 Naia가 인사하는 순간"

**목표**: Bazzite 부팅 → Naia 아바타가 화면에 나타나서 대화 가능

```
[Bazzite ISO]
  → 부팅
  → [Nextain Shell] 자동 시작 (Electron/Tauri)
      ├── Naia Avatar (VRM, AIRI stage-ui 기반)
      ├── 채팅 패널 (텍스트 + 음성)
      └── cline-core (백엔드, AI 로직)
  → "안녕, 루크! 오늘 뭐 할까?"
```

**구체적 작업:**

1. **BlueBuild로 Naia OS 이미지 정의**
   ```yaml
   # recipe.yml (BlueBuild)
   base-image: ghcr.io/ublue-os/bazzite
   modules:
     - type: rpm-ostree
       install: [nodejs, chromium]  # cline-core 런타임
     - type: files
       files:
         - source: naia-shell
           destination: /usr/share/naia/
     - type: systemd
       system:
         enabled: [naia-agent.service]
   ```

2. **AIRI stage-ui에서 Avatar 추출**
   - `packages/stage-ui` → Avatar 렌더링 컴포넌트
   - `packages/stage-ui-three` → Three.js VRM 로더
   - `packages/model-driver-lipsync` → 립싱크
   - 최소 세트만 가져와서 독립 앱으로 패키징

3. **Careti cline-core를 백엔드로 연결**
   - stdio 프로토콜 그대로 활용 (이미 검증됨)
   - 266+ 모델, 20+ 도구 즉시 사용 가능
   - 서브에이전트 구조 유지

4. **Nextain Shell (독립 UI)**
   ```
   ┌──────────────────────────────────────┐
   │  Naia OS                    ─ □ × │
   │ ┌────────────┬───────────────────┐   │
   │ │            │                   │   │
   │ │   Naia    │   대화 / 작업     │   │
   │ │  (VRM 3D)  │   패널            │   │
   │ │            │                   │   │
   │ │  감정표시   │   [터미널]        │   │
   │ │  상태표시   │   [파일탐색]      │   │
   │ │            │   [브라우저]       │   │
   │ └────────────┴───────────────────┘   │
   │  🎤 음성 입력    ⌨️ 텍스트 입력      │
   └──────────────────────────────────────┘
   ```

### Phase 1: MVP (4주) — "실제로 일을 시키는 OS"

**추가 기능:**
- **터미널 통합** — Naia가 시스템 명령 직접 실행 (Careti execute_command)
- **파일 관리** — AI가 파일 편집/생성 (SmartEditEngine)
- **메모리** — 세션 간 기억 유지 (jikime-mem 패턴, SQLite)
- **시스템 트레이** — 최소화해도 항상 상주
- **음성 I/O** — Whisper(ASR) + ElevenLabs(TTS) 기본 탑재

### Phase 2: 확장 (8주) — "멀티채널 + 멀티에이전트"

**추가 기능:**
- **MoltBot Gateway 통합** — Discord, Telegram 등 외부 채널 연결
- **서브에이전트** — Naia가 전문 에이전트를 소환 (코딩, 검색, 분석)
- **Skills 시스템** — 사용자가 스킬 추가 가능 (MoltBot 패턴)
- **MCP 서버** — 외부 도구 연결 확장
- **Nextain Space UX** — 공간 메타포 (라운지/아틀리에) 도입

### Phase 3: 배포 (12주) — "누구나 설치할 수 있는 AI OS"

- **Naia OS ISO** 공개 배포 (BlueBuild CI/CD)
- **온보딩 위자드** — 첫 부팅 시 Naia가 설정 안내
- **API 키 설정** — 사용자 본인 키 or Nextain 프록시
- **커뮤니티** — 스킬/아바타 마켓플레이스

---

## 기술 스택 결정

| 계층 | 기술 | 출처 |
|------|------|------|
| **OS 기반** | Bazzite (Fedora Atomic) | 불변 OS |
| **이미지 빌드** | BlueBuild | Bazzite 커스텀 |
| **데스크탑 셸** | Electron 또는 Tauri 2 | AIRI(Electron) / Careti(Tauri) |
| **Avatar 렌더링** | Three.js + @pixiv/three-vrm | AIRI stage-ui |
| **프론트엔드** | Vue 3 (AIRI) 또는 React (Careti) | **미결정** |
| **AI 백엔드** | cline-core (Node.js) | Careti |
| **프로토콜** | stdio JSON lines | Careti Desktop |
| **음성** | Whisper (ASR) + ElevenLabs (TTS) | AIRI |
| **메모리** | SQLite + 벡터 검색 | jikime-mem |
| **채널 통합** | MoltBot Gateway (Phase 2) | MoltBot |
| **컨테이너** | Podman (Bazzite 네이티브) | - |

### 미결정 사항

- [ ] **Electron vs Tauri**: AIRI는 Electron, Careti는 Tauri. 어느 쪽?
  - Electron: AIRI 코드 그대로 활용, 무거움 (~150MB)
  - Tauri: 가벼움 (~10MB), Careti Desktop 이미 구현, 하지만 AIRI 포팅 필요
- [ ] **Vue vs React**: AIRI는 Vue 3, Careti는 React 19. 어느 쪽?
  - 또는 Avatar만 Vue iframe으로 격리하고 메인 UI는 React?

---

## Careti에서 가져올 핵심 자산

코딩 에이전트의 강점이 사라진다고 했지만, **도구로서의 강점은 OS에서 더 빛남**:

| Careti 자산 | OS에서의 역할 |
|------------|--------------|
| 266+ 모델 연결 | Naia의 두뇌 선택지 (사용자가 모델 교체 가능) |
| 20+ 코딩 툴 | OS의 "시스템 도구" (파일 편집, 검색, 브라우저) |
| 서브에이전트 (Task tool) | Naia가 전문가를 소환하는 능력 |
| 터미널 실행 | AI가 OS를 직접 제어 (패키지 설치, 서비스 관리 등) |
| SmartEditEngine | 파일 편집 정확도 (코딩뿐 아니라 설정 파일도) |
| 페르소나 시스템 | Naia의 성격/말투 커스터마이징 |
| Desktop stdio 프로토콜 | UI ↔ AI Core 분리 이미 검증됨 |

**핵심 통찰**: 코딩 에이전트의 도구들은 "OS 제어 도구"로 자연스럽게 확장됨.
터미널 실행 = 앱 설치, 서비스 관리, 시스템 설정
파일 편집 = 설정 파일 수정, 문서 작성
브라우저 = 정보 검색, 웹 자동화

---

## 기존 문서와의 관계

| 기존 문서 | 이 문서와의 관계 |
|-----------|-----------------|
| `20260125-01-careti-future-vision.md` | AI 메신저 비전 → **OS로 확장** |
| `20260127-01-careti-standalone-architecture.md` | Tauri 독립앱 → **OS의 셸** |
| `20260114-cline-opencode-caret-analysis.md` | 기술 비교 → **합성 근거** |
| `20260109-opencode-vs-caret-analysis.md` | OpenCode 강점 → **Core Layer 반영** |
| `naia.com/data/alpha/project소개.md` | Naia 비전 → **OS의 주인공** |

---

## 참고: jikime ≠ MoltBot

혼동 방지를 위해 기록:
- **MoltBot(OpenClaw)**: Peter Steinberger의 멀티채널 AI 메신저 데몬 (MIT)
- **jikime-adk**: Goos.Kim의 MoAI-ADK 기반 레거시 현대화 도구 (Copyleft-3.0)
- **jikime-mem**: jikime의 Claude Code 세션 메모리 (MIT)
- 세 프로젝트는 **완전히 별개**이며, 목적과 저자가 다름

---

## 조사 원본

이 문서는 아래 프로젝트들을 조사한 결과를 종합한 것:
- `/home/luke/dev/ref-moltbot/` (MoltBot/OpenClaw)
- `/home/luke/dev/ref-opencode/` (OpenCode)
- `/home/luke/dev/project-careti/` (Careti + Desktop Mode)
- `/home/luke/dev/ref-project-airi/` (Project AIRI)
- `/home/luke/dev/ref-jikime-adk/` (jikime-adk)
- `/home/luke/dev/ref-jikime-mem/` (jikime-mem)
- `/home/luke/dev/naia.com/` (Nextain 개인 홈페이지)
