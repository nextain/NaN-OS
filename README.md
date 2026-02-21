# Naia OS

Bazzite 기반 배포형 AI OS. USB 꽂으면 Naia가 맞이하는 개인 AI 운영체제.

## 비전

```
USB 꽂기 → Bazzite 부팅 → Naia(AI 아바타)가 화면에 등장 → 대화 시작
```

- **OS 자체가 AI의 도구** — AI에게 OS를 통째로 준다
- **Virtual Avatar** — Naia가 화면에 살아있는 존재
- **개인 AI 데몬** — 항상 켜져있고, 어디서든 대화 가능
- **게임도 같이** — AI랑 Minecraft, Factorio 등을 함께 플레이

## 왜 Naia OS인가?

기존 AI 도구들은 **"사람이 AI를 도구로 쓰는"** 구조다. ChatGPT에 질문하고, Copilot에 코드 완성 요청하고, CLI 에이전트에 명령을 내린다. AI는 특정 앱 안에 갇혀 있다.

Naia OS는 이 관계를 뒤집는다 — **"AI에게 OS를 통째로 준다."** Naia는 파일을 읽고 쓰고, 터미널을 실행하고, 앱을 제어한다. 특정 도구가 아니라 운영체제 자체가 AI의 작업 공간이다.

### 기존 접근과의 차이

| 기존 접근 | 한계 | Naia OS |
|-----------|------|-----------|
| **VS Code 확장** (Copilot, Cline 등) | IDE를 열어야 AI를 쓸 수 있음 | IDE 불필요. 항상 켜져있음 |
| **CLI 에이전트** (Claude Code, Aider 등) | 터미널 안에서만 동작 | 파일, 브라우저, 시스템 전체를 제어 |
| **챗봇 앱** (ChatGPT, Gemini 등) | 대화만 가능, 실행 불가 | 대화 + 실행. "파일 만들어줘"하면 실제로 만듦 |
| **macOS 데몬** (MoltBot/OpenClaw 등) | brew 설치 필요, macOS 전용 | USB 하나로 어디서든 부팅. Linux 기반 |
| **AI 에이전트 프레임워크** (LangChain 등) | 개발자만 사용 가능 | 비개발자도 USB 꽂으면 바로 사용 |

### 실제 구현된 차별 기능

- **3D VRM 아바타**: Naia가 Three.js로 렌더링된 3D 캐릭터로 존재. 대화 중 감정 표현(기쁨, 놀람, 생각 중)과 립싱크가 실시간으로 동작
- **불변 OS (Bazzite/Fedora Atomic)**: rpm-ostree 기반으로 시스템이 깨져도 롤백 가능. AI가 OS를 제어해도 안전
- **멀티 LLM**: Gemini, Grok, Claude 등 여러 LLM 프로바이더를 선택해서 사용. 특정 회사에 종속되지 않음
- **8개 도구 실행**: 파일 읽기/쓰기/편집, 터미널 명령, 웹 검색, 브라우저 제어, 파일 검색, 서브에이전트 생성이 실제로 동작
- **4단계 권한 시스템**: 읽기(자동) → 생성/수정(알림) → 삭제/설치(승인 필요) → 시스템 파일(차단). 모든 작업은 감사 로그에 기록
- **Gateway 데몬**: 앱을 닫아도 AI가 백그라운드에서 계속 동작. 외부 채널(Discord, Telegram 등)에서도 접근 가능한 구조
- **Skills 시스템**: 시간 조회, 시스템 상태, 메모 등의 경량 스킬을 LLM 호출 없이 즉시 실행
- **USB 부팅**: 설치 없이 USB에 ISO를 구워서 어떤 PC에서든 바로 사용. BlueBuild로 push할 때마다 자동 빌드
- **음성 대화**: Google TTS/STT 연동으로 음성 입출력 + 아바타 립싱크 지원 (Gemini 프로바이더)
- **Tauri Webview E2E**: 실제 Tauri 바이너리를 tauri-driver + WebdriverIO로 자동화하는 E2E 테스트 (7개 시나리오, 실제 LLM 호출)

## 아키텍처

```
┌─────────────────────────────────────┐
│         Naia Shell (UI)          │
│  ┌──────────┬──────────────────┐    │
│  │  Naia   │  대화 / 작업     │    │
│  │  Avatar  │  패널            │    │
│  │ (VRM 3D) │                  │    │
│  └──────────┴──────────────────┘    │
├──────────────┬──────────────────────┤
│ stdio JSON   │  Tauri 2 (Rust)     │
│ lines        │  Gateway lifecycle  │
├──────────────┴──────────────────────┤
│         Agent Core (Node.js)        │
│  LLM 연결 · 도구 · 서브에이전트     │
│         ↓ WebSocket (ws://127.0.0.1:18789)
├─────────────────────────────────────┤
│     OpenClaw Gateway (데몬)         │
│  도구 실행 · 채널 · Skills · 메모리  │
│  (앱 시작 시 자동 spawn / 기존 재사용)│
├─────────────────────────────────────┤
│         Bazzite (불변 Linux OS)      │
│  GPU 드라이버 · Podman · rpm-ostree │
└─────────────────────────────────────┘
```

## 프로젝트 구조

```
Naia-OS/
├── shell/          # Naia Shell (Tauri 2 + Three.js Avatar)
├── agent/          # AI 에이전트 코어 (Node.js, LLM + 도구)
├── config/         # OS 이미지 설정 (scripts, systemd, wrapper)
├── recipes/        # BlueBuild recipe
├── os/             # Bazzite 커스텀 이미지 (BlueBuild)
├── work-logs/      # 개발 작업 로그
├── .agents/        # AI용 컨텍스트 (영어, JSON/YAML)
└── .users/         # 사람용 컨텍스트 (한국어, Markdown)
```

## 문서

- [비전](.users/context/vision.md) — 핵심 컨셉: "OS 자체가 AI의 도구"
- [구현 계획](.users/context/plan.md) — Phase 0-5 상세 계획, 각 단계 결과물
- [Careti 재사용](.users/context/careti-reuse.md) — project-careti에서 가져올 코드/전략
- [프로젝트 규칙](.users/context/agents-rules.md) — 코딩 컨벤션, 테스트, 로깅, 보안, 개발 프로세스

## 기술 스택

| 계층 | 기술 |
|------|------|
| OS 기반 | Bazzite (Fedora Atomic, 불변) |
| 이미지 빌드 | BlueBuild + GitHub Actions |
| 데스크탑 셸 | Tauri 2 + Three.js (VRM Avatar) |
| AI 엔진 | Node.js (멀티 LLM 프로바이더) |
| 데몬 | systemd 서비스 |
| 메모리 | SQLite + 벡터 검색 |
| 포맷터 | Biome |
| 테스트 | Vitest + tauri-driver (WebDriver) |

## 참조 프로젝트

| 프로젝트 | 가져오는 것 |
|---------|------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | 불변 Linux OS, GPU, 게이밍 최적화 |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, 플러그인 프로토콜, 게임 에이전트 |
| [MoltBot/OpenClaw](https://github.com/steipete/openclaw) | Gateway 데몬, 채널 통합, Skills |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server 분리, Provider 추상화 |
| Careti | LLM 연결, 도구 세트, 서브에이전트, 컨텍스트 관리 |

## 개발 환경

### 전제조건

| 항목 | 버전 | 비고 |
|------|------|------|
| Node.js | 22+ | nvm 권장 |
| Rust | stable | `rustup update` |
| pnpm | 9+ | `corepack enable` |
| 시스템 패키지 | — | `sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora) |

### Gateway 설치 (최초 1회)

```bash
# OpenClaw Gateway 설치 (~/.naia/openclaw/)
bash config/scripts/setup-openclaw.sh
```

### 개발 빌드 + 실행

```bash
# 1. 의존성 설치
cd shell && pnpm install
cd ../agent && pnpm install

# 2. Tauri 앱 실행 (Gateway + Agent 자동 시작)
cd shell && pnpm run tauri dev
```

앱 실행 시 자동으로:
1. OpenClaw Gateway health check → 이미 실행 중이면 재사용, 아니면 자동 spawn
2. Agent Core spawn (Node.js, stdio 연결)
3. 앱 종료 시 자동 spawn한 Gateway만 종료 (systemd 서비스는 유지)

### 테스트

```bash
cd agent && pnpm test              # Agent 유닛 테스트
cd shell && pnpm test              # Shell 유닛 테스트
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust 테스트

# Tauri Webview E2E (실제 앱 자동화, Gateway 실행 중일 때)
cd shell && pnpm run test:e2e:tauri

# Gateway E2E (Gateway 실행 중일 때)
cd agent && CAFE_LIVE_GATEWAY_E2E=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts
```

### 수동 Gateway 실행 (개발용)

```bash
# 별도 터미널에서 수동 실행 시
~/.naia/openclaw/node_modules/.bin/openclaw gateway run --bind loopback --port 18789
```

## 배포

```
Phase 0 (Day 1-3):  BlueBuild 파이프라인 → push하면 ISO 자동 생성
Phase 1 (Week 1):   아바타 탑재 → Naia가 보이는 ISO
Phase 2 (Week 2):   대화 추가 → Naia와 대화하는 ISO ← 공개 데모
Phase 3 (Week 3-4): 도구 → Naia가 일하는 ISO          ✅ 완료
Phase 4 (Week 5-7): 데몬 → 완성된 AI OS               🟡 진행 중
Phase 5 (Week 8+):  게임 → AI랑 마인크래프트
```

## Google Gemini 설정 가이드

### 1. API 키 발급

1. [Google AI Studio](https://aistudio.google.com/) 접속 → 로그인
2. 좌측 메뉴 **Get API Key** → **Create API Key** 클릭
3. 프로젝트 선택 (없으면 새로 생성) → API 키 복사

### 2. Cloud API 활성화 (TTS/STT용)

AI Studio에서 발급한 키는 기본적으로 Gemini만 사용 가능합니다.
음성 기능(TTS/STT)을 쓰려면 Google Cloud Console에서 추가 API를 활성화해야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. AI Studio 키가 속한 **같은 프로젝트** 선택
3. **APIs & Services** → **Enable APIs and Services** 클릭
4. 아래 두 API를 검색하여 각각 **Enable** 클릭:
   - **Cloud Text-to-Speech API** (TTS — AI 음성 합성)
   - **Cloud Speech-to-Text API** (STT — 음성 인식)

> 두 API 모두 매월 무료 할당량이 있습니다:
> - TTS: 월 400만 글자 무료 (WaveNet)
> - STT: 월 60분 무료

### 3. Naia OS에서 설정

1. 앱 실행 후 우측 상단 ⚙️ (설정) 클릭
2. 아래와 같이 입력:

| 항목 | 값 |
|------|------|
| **프로바이더** | `gemini` |
| **모델** | `gemini-2.5-flash` (권장) 또는 `gemini-2.5-pro` |
| **API 키** | AI Studio에서 발급한 키 붙여넣기 |

3. **저장** 클릭

### 4. 기능별 동작

| 기능 | 설명 | 필요 API |
|------|------|----------|
| **대화** | 텍스트 입력 → AI 응답 | Gemini API (기본) |
| **TTS (음성 합성)** | AI 응답 완료 후 자동 음성 재생 + 립싱크 | Cloud Text-to-Speech |
| **STT (음성 인식)** | 🎤 버튼 누른 채로 말하기 → 텍스트 변환 | Cloud Speech-to-Text |

### 5. 다른 프로바이더 사용 시

| 프로바이더 | 대화 | TTS | STT |
|-----------|------|-----|-----|
| **Gemini** | ✅ | ✅ 자동 | ✅ 마이크 버튼 |
| **xAI (Grok)** | ✅ | ❌ | ❌ |
| **Claude** | ✅ | ❌ | ❌ |

> TTS/STT는 현재 Google API 키를 재사용하는 Gemini 프로바이더에서만 작동합니다.

## 상태

- **Phase 3 완료**: 8개 도구(파일/터미널/검색/웹/브라우저/서브에이전트), 권한 승인, 감사 로그, 작업 패널
- **Phase 4 진행 중**: Gateway 자동 라이프사이클, Skills 시스템 (time/system_status/memo), Tauri Webview E2E 테스트 (7/7 통과)

## 참고

- Bazzite fork 불필요 — BlueBuild 레이어링으로 충분
- 상세 보안 정책은 [규칙 문서](.users/context/agents-rules.md#보안) 참조
