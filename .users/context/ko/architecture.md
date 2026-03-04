# Naia 하이브리드 아키텍처

## 핵심 설계 철학

> **처음부터 만들지 않는다. 검증된 3개 생태계를 조합한다.**

Naia는 3개의 모체 프로젝트에서 각각의 강점을 가져와 조합하는 **하이브리드** 방식:

| 모체 | 역할 | 가져오는 것 |
|------|------|------------|
| **OpenClaw** | 런타임 백엔드 | Gateway 데몬, 명령 실행, 채널, 스킬, 메모리 |
| **project-careti** | 에이전트 지능 | 멀티 LLM, 도구 정의, Alpha 페르소나, 비용 추적 |
| **OpenCode** | 아키텍처 패턴 | 클라이언트/서버 분리, 프로바이더 추상화 |

---

## 왜 하이브리드인가?

### 하나만 쓰면 안 되는 이유

**OpenClaw만?** → CLI 전용, 아바타 없음, Claude Code에 종속, 멀티 LLM 미지원
**Careti만?** → VS Code 확장, always-on 불가, 채널/스킬 없음
**OpenCode만?** → TUI 전용, Gateway/데몬 없음, 채널 없음

### 하이브리드 해법

```
OpenClaw의 데몬+실행+채널+스킬 생태계 (런타임 백엔드)
+ Careti의 멀티 LLM+도구+페르소나 (에이전트 지능)
+ OpenCode의 클라이언트/서버 분리 패턴 (아키텍처)
= Tauri 데스크톱 셸 + VRM 아바타로 포장 (접근성)
```

---

## 런타임 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Naia Shell (Tauri 2 + React + Three.js VRM Avatar) │
│  역할: 데스크톱 UI, 아바타 렌더링, 채팅 패널           │
│  출처: Naia 자체 + AIRI (VRM) + shadcn/ui            │
└──────────────────────┬──────────────────────────────────┘
                       │ stdio JSON lines
┌──────────────────────▼──────────────────────────────────┐
│  Naia Agent (Node.js)                                │
│  역할: LLM 연결, 도구 오케스트레이션, Alpha 페르소나    │
│  출처: Careti 프로바이더 + OpenCode 패턴                │
│  기능: 멀티 LLM, TTS, 감정, 비용 추적                  │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws://127.0.0.1:18789)
┌──────────────────────▼──────────────────────────────────┐
│  OpenClaw Gateway (systemd user service)                │
│  역할: 명령 실행, 보안, 채널, 스킬, 메모리             │
│  출처: OpenClaw 생태계 (npm: openclaw)                  │
│  인증: 디바이스 ID + 토큰 스코프 (protocol v3)          │
│  메서드: 프로파일별 동적 노출 (agent, node.invoke,      │
│  sessions, browser.request, skills, channels 등)         │
└─────────────────────────────────────────────────────────┘
```

## 3대 축 상세

### 축 1: OpenClaw (런타임 백엔드)

OpenClaw이 제공하는 것:
- **Gateway 데몬**: systemd 유저 서비스, 항상 실행
- **명령 실행**: exec.bash 우선 + node.invoke(system.run) 폴백
- **보안**: 디바이스 인증, 토큰 스코프, exec approval
- **채널**: Discord, Telegram, WhatsApp, Slack, IRC 등
- **스킬**: 50+ 내장 (날씨, 시간, 메모 등)
- **메모리**: 대화 영속, 컨텍스트 리콜
- **세션**: 멀티 세션, sub-agent spawn
- **ACP**: Agent Control Protocol (클라이언트↔에이전트 브릿지)
- **TTS**: 통합 프로바이더 셀렉터 (Edge TTS 무료, Google Cloud, OpenAI, ElevenLabs) — 직접 API 호출

### 축 2: project-careti (에이전트 지능)

Careti가 제공하는 것:
- **멀티 LLM**: Gemini (기본), xAI (Grok), Claude
- **도구 정의**: GATEWAY_TOOLS (8개 도구)
- **Function calling**: Gemini 네이티브 (xAI/Claude = 기술 부채)
- **Alpha 페르소나**: 시스템 프롬프트, 감정 매핑
- **비용 추적**: 요청별 비용 표시
- **stdio 프로토콜**: Shell ↔ Agent JSON lines

### 축 3: OpenCode (아키텍처 패턴)

OpenCode가 제공하는 것:
- **클라이언트/서버 분리**: Shell (클라이언트) / Agent (서버)
- **프로바이더 추상화**: buildProvider 팩토리 패턴
- **모듈 경계**: shell / agent / gateway 분리

---

## Shell UI 레이아웃

```
App
├── TitleBar (패널 토글 버튼 + 창 컨트롤)
└── .app-layout [data-panel-position="left"|"right"|"bottom"]
    ├── .side-panel (ChatPanel — panelVisible=true일 때만 렌더링)
    └── .main-area (AvatarCanvas — 항상 표시)
```

- **panelPosition**: `"left" | "right" | "bottom"` — CSS flex-direction으로 패널 위치 제어
- **panelVisible**: `boolean` — 채팅 패널 토글; 아바타는 항상 표시
- **아바타 리사이즈**: `ResizeObserver`로 컨테이너 크기 변경 감지 (window resize 아님)
- **설정 동기화**: panelPosition + panelVisible은 Lab에 동기화 (`LAB_SYNC_FIELDS`)

---

## 데이터 흐름

| 시나리오 | 흐름 |
|---------|------|
| **채팅** | User → Shell → Agent → LLM → Agent → Shell → User |
| **도구 실행** | LLM → Agent (tool_use) → Gateway (exec.bash 또는 node.invoke) → OS → result → LLM |
| **승인** | Gateway → Agent (approval_request) → Shell (모달) → 사용자 결정 → Agent → Gateway |
| **외부 채널** | Discord msg → Gateway → Agent → LLM → Agent → Gateway → Discord reply |

## 데스크톱 아바타 로컬 파일 파이프라인

VRM/배경을 로컬 파일에서 안정적으로 로드하기 위한 규칙:

- `file://` 경로는 저장/렌더 전에 절대 경로로 정규화한다.
- 경로가 `http://localhost/...` 형태로 들어오면 Tauri 자산 프로토콜 호환을 위해 `http://asset.localhost/...`로 변환한다.
- 절대 로컬 VRM은 Rust 커맨드 `read_local_binary`로 바이트를 읽고, 프론트엔드에서 `ArrayBuffer`로 직접 parse한다.
  URL fetch 방식의 CORS/접근 제어 실패를 피하기 위함.
- 배경 이미지는 자산 URL 변환을 사용하고, 실패 시 기본 그라데이션 배경으로 폴백한다.

### E2E 실행 주의

- `e2e-tauri`는 `src-tauri/target/debug/naia-shell` 고정 바이너리를 실행한다 (`pnpm build` 산출물과 별개).
- Rust `#[tauri::command]` 또는 `invoke_handler` 변경 후에는 E2E 전에 반드시 `src-tauri`에서 `cargo build`를 실행한다.

## 채널/온보딩 Discord 라우팅 규칙

- Discord 봇 추가 플로우는 Shell에서 직접 토큰/웹훅을 다루지 않고 `naia.nextain.io` 라우팅을 사용한다.
- Channels 탭의 Discord 로그인 버튼과 온보딩 마지막 단계 선택 버튼은 모두 아래 경로를 연다.
  `https://naia.nextain.io/ko/discord/connect?source=naia-shell`
- 보안 원칙:
  - `DISCORD_BOT_TOKEN`은 shell 프론트엔드에서 사용/노출하지 않는다.
  - 봇 비밀키는 `naia.nextain.io` 서버 환경변수에서만 관리한다.

## 딥링크 저장 계약 (중요)

OAuth 딥링크 페이로드는 특정 탭(설정/온보딩) 렌더 여부와 무관하게 반드시 저장되어야 한다.

- 필수 규칙:
  - 런타임 동작에 영향 주는 딥링크 이벤트(`discord_auth_complete` 등)는 **항상 마운트된 계층(App 루트)** 에서 수신/저장한다.
  - Settings/Onboarding 리스너는 UI 상태 동기화 용도로만 쓰고, 저장 로직은 공통 라이브러리로 단일화한다.
  - Agent 기본 전송 타깃 결정은 "설정 탭이 열려 있었는지"에 의존하면 안 된다.
- 금지 패턴:
  - 탭 컴포넌트 내부에서만 인증 페이로드를 저장하는 구조
  - 컴포넌트별로 서로 다른 fallback 규칙을 중복 구현하는 구조

## 메모리 아키텍처 (2계층)

Alpha가 사용자를 기억하고 성장하기 위한 2계층 메모리 시스템.

### 단기기억 (Short-Term Memory)

| 항목 | 내용 |
|------|------|
| **저장소** | Zustand (인메모리) + SQLite messages 테이블 |
| **범위** | 현재 세션 전체 메시지 |
| **수명** | 현재 세션 ~ 최근 7일 |
| **구현** | Rust memory.rs + Frontend db.ts + Chat store |

### 장기기억 (Long-Term Memory)

| 유형 | 저장소 | 내용 |
|------|--------|------|
| **Episodic (에피소드)** | sessions.summary | LLM이 생성한 세션 요약 |
| **Semantic (사실/선호)** | facts 테이블 | "사용자는 Rust 선호" 같은 추출된 사실 |

### 검색 엔진 진화 (MemoryProcessor 인터페이스로 교체 가능)

```
4.4a: SQLite LIKE (키워드 매칭)
4.4b: SQLite FTS5 BM25 (전문검색)
4.5:  Gemini Embedding API (의미 검색)
5+:   sLLM (Ollama, llama.cpp) 로컬 요약/임베딩
```

### DB 스키마

```sql
-- 단기기억
CREATE TABLE sessions (id TEXT PK, created_at INT, title TEXT, summary TEXT);
CREATE TABLE messages (id TEXT PK, session_id TEXT FK, role TEXT, content TEXT,
                       timestamp INT, cost_json TEXT, tool_calls_json TEXT);

-- 장기기억 (Phase 4.4c+)
CREATE TABLE facts (id TEXT PK, key TEXT, value TEXT, source TEXT, updated_at INT);
```

---

## 보안 4계층 (심층 방어)

| 계층 | 역할 | 설정 |
|------|------|------|
| **OS** | Bazzite immutable rootfs + SELinux | 시스템 파일 보호 |
| **Gateway** | OpenClaw 디바이스 인증 + 토큰 스코프 + exec approval | protocol v3, Ed25519 |
| **Agent** | Permission tiers 0-3 + 도구별 차단 | Tier 3: rm -rf, sudo 등 차단 |
| **Shell** | 사용자 승인 모달 + 도구 on/off 토글 | 사용자가 직접 제어 |

**원칙: 각 계층이 독립적. 한 계층이 뚫려도 나머지가 방어.**

---

## Gateway 연결 프로토콜

Naia Agent가 OpenClaw Gateway에 연결하는 과정:

```
1. WebSocket 연결: ws://127.0.0.1:18789
2. Gateway → connect.challenge 이벤트 (nonce 포함)
3. Agent → connect 요청 (토큰 + protocol v3 + client info)
4. Gateway → hello-ok 응답 (88개 메서드 + 기능 목록)
5. Agent → req/res 프레임으로 도구 실행 (exec.bash / node.invoke 등)
```

### 인증 파라미터

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| auth.token | gateway.auth.token | Gateway 설정의 공유 토큰 |
| client.id | "cli" | 페어링된 디바이스 ID |
| client.platform | "linux" | 플랫폼 |
| client.mode | "cli" | 클라이언트 모드 |
| minProtocol | 3 | 최소 프로토콜 버전 |
| maxProtocol | 3 | 최대 프로토콜 버전 |

---

## 음성 아키텍처

> 최종 업데이트: 2026-03-05

### 개요

Naia는 두 가지 음성 출력 모드를 지원하며, 하나의 음성 설정을 공유한다:

1. **실시간 음성 대화** — Gemini Live API를 통한 양방향 실시간 오디오
2. **TTS (텍스트 음성 변환)** — 텍스트 채팅 응답을 소리로 읽어줌

Naia 계정 사용자는 동일한 Chirp 3 HD 음성(예: "Kore")을 양쪽 모두에 사용한다.

### 음성 설정 통합

| 항목 | 값 |
|------|-----|
| 설정 필드 | `liveVoice` |
| 저장 형식 | 짧은 이름 (예: `"Kore"`, `"Puck"`) |
| Live API 사용 | 직접 voice 파라미터로 전달 |
| TTS 사용 | ChatPanel에서 `ko-KR-Chirp3-HD-{liveVoice}` 형식으로 변환 |

**사용 가능한 음성:**
Kore (여성, 차분), Puck (남성, 활발), Charon (남성, 깊은), Aoede (여성, 밝은), Fenrir (남성, 낮은), Leda (여성, 부드러운), Orus (남성, 단단한), Zephyr (중성), Achernar, Gacrux, Sulafat, Umbriel

비-Naia 프로바이더(google, edge, openai, elevenlabs)는 별도의 `ttsVoice` 필드 사용.

### 실시간 음성 대화 (Gemini Live API)

```
┌──────────┐  mic PCM 16kHz   ┌──────────────┐  WebSocket   ┌──────────────┐  gRPC   ┌─────────────┐
│  Shell   │ ────────────────→ │ voice-session │ ──────────→ │  any-llm GW  │ ──────→ │ Gemini Live │
│(ChatPanel)│ ←──────────────── │  (browser WS) │ ←────────── │  (live.py)   │ ←────── │    API      │
└──────────┘  PCM 24kHz audio  └──────────────┘  JSON+audio  └──────────────┘         └─────────────┘
```

**주요 컴포넌트:**

| 파일 | 역할 |
|------|------|
| `shell/src/components/ChatPanel.tsx` | UI 상태 (off/connecting/active), 이벤트 연결, 트랜스크립트 누적 |
| `shell/src/lib/voice-session.ts` | any-llm gateway `/v1/live` WebSocket 클라이언트 |
| `shell/src/lib/audio-player.ts` | 연속 PCM 재생 (24kHz Int16 mono → AudioContext) |
| `shell/src/lib/mic-stream.ts` | 마이크 캡처, 16kHz PCM 다운샘플, base64 청크 전송 |
| `project-any-llm/.../routes/live.py` | WebSocket 프록시: 클라이언트 ↔ Gemini Live SDK |

**핵심 기술 사항:**
- `session.receive()` 이터레이터는 `turnComplete` 후 종료 (SDK 동작) → `while True`로 래핑하여 멀티턴 지원
- 토큰 사용량은 턴마다 `+=`로 누적 (정확한 과금)
- AudioContext는 webkit2gtk에서 자동 suspend → `ctx.resume()` 호출 필요
- 트랜스크립트는 단어 단위로 점진적 도착 → `inputAccum`/`outputAccum`으로 누적 (덮어쓰기 아님)

**인증:** Naia API 키 (`X-AnyLLM-Key: Bearer {naiaKey}`) → any-llm gateway 검증 → Vertex AI로 Gemini 세션 생성

**모델:** `gemini-live-2.5-flash-native-audio` (config.liveModel으로 설정 가능)

### TTS (텍스트 음성 변환)

| 프로바이더 | 경로 | 음성 |
|-----------|------|------|
| nextain | ChatPanel → agent → nextain-tts.ts → any-llm gateway → Google Cloud TTS | Chirp 3 HD (liveVoice에서 변환) |
| google | ChatPanel → agent → Rust preview_tts → Google Cloud TTS 직접 호출 | Neural2 시리즈 |
| edge | ChatPanel → agent → OpenClaw gateway → Edge TTS | 무료 |
| openai | ChatPanel → agent → OpenClaw gateway → OpenAI TTS | OpenAI 음성 |
| elevenlabs | ChatPanel → agent → OpenClaw gateway → ElevenLabs | ElevenLabs 음성 |

### STT 상태

레거시 STT (`stt.ts`, `audio-recorder.ts`)는 제거됨.
실시간 음성 입력은 Gemini Live API의 내장 음성 인식 (`inputTranscription` 이벤트)으로 처리.

### 과금

- **실시간 음성 대화:** $0.10/M 입력 토큰 + $0.40/M 출력 토큰 (Gemini Live)
- **TTS:** 프로바이더별 상이 (Chirp 3 HD, Neural2, Edge 무료, OpenAI, ElevenLabs)
