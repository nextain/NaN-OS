[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — AI 아바타가 살고 있는 개인 데스크톱 운영체제

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "OS 자체가 AI의 도구다. AI가 OS 위에서 실행되는 게 아니라, AI가 OS를 제어한다."

## Naia란?

Naia는 3D 아바타 AI가 상주하는 Linux 데스크톱 앱입니다. 채팅과 음성으로 AI와 대화하고, AI가 파일 관리, 터미널 명령, 웹 검색, 코드 작성까지 직접 수행합니다. 개발자가 아니어도 누구나 자신만의 AI 에이전트를 가질 수 있습니다.

### 핵심 기능

- **3D 아바타** — VRM 캐릭터가 감정 표현(기쁨/슬픔/놀람/생각 등)과 립싱크로 살아있는 대화
- **멀티 LLM** — Gemini, Claude, GPT, Grok, zAI, Ollama, Claude Code CLI 등 7개 제공업체 지원
- **도구 실행** — 파일 읽기/쓰기, 터미널 실행, 웹 검색, 브라우저, 서브 에이전트 등 8가지 도구
- **70개 스킬** — 7개 내장 + 63개 커스텀 (날씨, GitHub, Slack, Notion, Spotify, Discord 등)
- **음성 대화** — TTS 5개 제공업체 (Nextain Cloud, Edge, Google, OpenAI, ElevenLabs) + STT
- **14개 언어** — 한국어, 영어, 일본어, 중국어, 프랑스어, 독일어, 러시아어 등
- **채널 연동** — Discord DM으로 언제 어디서나 AI와 대화
- **4단계 보안** — T0(읽기) ~ T3(위험) 권한 계층, 도구별 승인 시스템, 감사 로그
- **Nextain 계정** — API 키 없이 크레딧 기반으로 바로 사용 가능
- **개인화** — 이름, 성격, 말투, 아바타, 테마(8종) 모두 커스터마이즈

## 왜 Naia인가?

기존 AI 도구들은 "사람이 AI를 도구로 쓰는" 구조입니다. Naia는 이 관계를 뒤집습니다 — **"AI에게 OS를 통째로 준다."**

| 기존 접근 | 한계 | Naia |
|-----------|------|---------|
| **VS Code 확장** (Copilot, Cline) | IDE를 열어야 AI 사용 | IDE 불필요. 항상 켜져있음 |
| **CLI 에이전트** (Claude Code, Aider) | 터미널 안에서만 동작 | 파일, 브라우저, 시스템 전체 제어 |
| **챗봇 앱** (ChatGPT, Gemini) | 대화만 가능, 실행 불가 | 대화 + 실행. "파일 만들어줘"하면 실제로 만듦 |
| **macOS 데몬** (OpenClaw) | brew 설치, macOS 전용, CLI | 데스크톱 앱 + 3D 아바타. Linux 기반 |
| **AI 프레임워크** (LangChain) | 개발자만 사용 가능 | 7단계 온보딩으로 누구나 시작 |

## OpenClaw과의 관계

Naia는 [OpenClaw](https://github.com/openclaw-ai/openclaw) 생태계 위에 구축되었지만, 근본적으로 다른 제품입니다.

| | OpenClaw | Naia |
|---|---------|---------|
| **형태** | CLI 데몬 + 터미널 | 데스크톱 앱 + 3D 아바타 |
| **대상** | 개발자 | 누구나 |
| **UI** | 없음 (터미널) | Tauri 2 네이티브 앱 (React + Three.js) |
| **아바타** | 없음 | VRM 3D 캐릭터 (감정, 립싱크, 시선) |
| **LLM** | 단일 프로바이더 | 멀티 프로바이더 7개 + 실시간 전환 |
| **음성** | TTS 3개 (Edge, OpenAI, ElevenLabs) | TTS 5개 (+Google, Nextain) + STT + 아바타 립싱크 |
| **감정** | 없음 | 6가지 감정 → 표정 매핑 |
| **온보딩** | CUI | GUI + VRM 아바타 선택 |
| **비용 추적** | 없음 | 실시간 크레딧 대시보드 |
| **배포** | npm install | Flatpak / AppImage / DEB / RPM + OS 이미지 |
| **다국어** | 영어 CLI | 14개 언어 GUI |
| **채널** | 서버 봇 (멀티채널) | Naia 전용 Discord DM 봇 |

**OpenClaw에서 가져온 것:** 데몬 아키텍처, 도구 실행 엔진, 채널 시스템, 스킬 생태계 (5,700+ Clawhub 스킬 호환)

**Naia가 새로 만든 것:** Tauri Shell, VRM 아바타 시스템, 멀티 LLM 에이전트, 감정 엔진, TTS/STT 통합, 온보딩 마법사, 비용 추적, Nextain 계정 연동, 메모리 시스템 (STM/LTM), 보안 계층

## 아키텍처

```
┌──────────────────────────────────────────────────┐
│  Naia Shell (Tauri 2 + React + Three.js)         │
│  Chat · Avatar · Skills · Channels · Settings    │
│  State: Zustand │ DB: SQLite │ Auth: OAuth        │
└──────────────┬───────────────────────────────────┘
               │ stdio JSON lines
┌──────────────▼───────────────────────────────────┐
│  Naia Agent (Node.js + TypeScript)               │
│  LLM: Gemini, Claude, GPT, Grok, zAI, Ollama    │
│  TTS: Nextain, Edge, Google, OpenAI, ElevenLabs  │
│  Skills: 7 built-in + 63 custom                  │
└──────────────┬───────────────────────────────────┘
               │ WebSocket (ws://127.0.0.1:18789)
┌──────────────▼───────────────────────────────────┐
│  OpenClaw Gateway (systemd user daemon)          │
│  88 RPC methods │ Tool exec │ Channels │ Memory  │
└──────────────────────────────────────────────────┘
```

**3개 프로젝트의 융합:**
- **OpenClaw** → 데몬 + 도구 실행 + 채널 + 스킬 생태계
- **Careti** → 멀티 LLM + 도구 프로토콜 + stdio 통신
- **OpenCode** → 클라이언트/서버 분리 패턴

## 프로젝트 구조

```
naia-os/
├── shell/              # Tauri 2 데스크톱 앱 (React + Rust)
│   ├── src/            #   React 컴포넌트 + 상태 관리
│   ├── src-tauri/      #   Rust 백엔드 (프로세스 관리, SQLite, 인증)
│   └── e2e-tauri/      #   WebDriver E2E 테스트
├── agent/              # Node.js AI 에이전트 코어
│   ├── src/providers/  #   LLM 제공업체 (Gemini, Claude, GPT 등)
│   ├── src/tts/        #   TTS 제공업체 (Edge, Google, OpenAI 등)
│   ├── src/skills/     #   내장 스킬 (13개 Naia 전용 TypeScript)
│   └── assets/         #   번들 스킬 (64개 skill.json)
├── gateway/            # OpenClaw Gateway 브릿지
├── flatpak/            # Flatpak 패키징 (io.nextain.naia)
├── recipes/            # BlueBuild OS 이미지 레시피
├── config/             # OS 설정 (systemd, 래퍼 스크립트)
├── .agents/            # AI 컨텍스트 (영어, JSON/YAML)
└── .users/             # 사람 문서 (한국어, Markdown)
```

## 컨텍스트 문서 (Dual-directory Architecture)

AI 에이전트와 사람 개발자를 위한 이중 문서 구조입니다. `.agents/`는 AI가 토큰 효율적으로 읽는 JSON/YAML, `.users/`는 사람이 읽는 한국어 Markdown입니다.

| AI 컨텍스트 (`.agents/`) | 사람 문서 (`.users/`) | 설명 |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | 프로젝트 규칙 (SoT) |
| `context/project-index.yaml` | — | 컨텍스트 인덱스 + 미러링 규칙 |
| `context/vision.yaml` | `context/vision.md` | 프로젝트 비전, 핵심 컨셉 |
| `context/plan.yaml` | `context/plan.md` | 구현 계획, 페이즈별 진행 상태 |
| `context/architecture.yaml` | `context/architecture.md` | 하이브리드 아키텍처, 보안 계층 |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | OpenClaw Gateway 동기화 |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Discord 통합 아키텍처 |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | 개발 사이클 (PLAN->BUILD->VERIFY) |

**미러링 규칙:** 한쪽을 수정하면 반드시 다른 쪽도 동기화합니다.

## 기술 스택

| 레이어 | 기술 | 용도 |
|--------|------|------|
| OS | Bazzite (Fedora Atomic) | 불변 Linux, GPU 드라이버 |
| OS 빌드 | BlueBuild | 컨테이너 기반 OS 이미지 |
| 데스크톱 앱 | Tauri 2 (Rust) | 네이티브 셸 |
| 프론트엔드 | React 18 + TypeScript + Vite | UI |
| 아바타 | Three.js + @pixiv/three-vrm | 3D VRM 렌더링 |
| 상태 관리 | Zustand | 클라이언트 상태 |
| LLM 엔진 | Node.js + 멀티 SDK | 에이전트 코어 |
| 프로토콜 | stdio JSON lines | Shell ↔ Agent 통신 |
| 게이트웨이 | OpenClaw | 데몬 + RPC 서버 |
| DB | SQLite (rusqlite) | 메모리, 감사 로그 |
| 포매터 | Biome | 린팅 + 포매팅 |
| 테스트 | Vitest + tauri-driver | 단위 + E2E |
| 패키지 | pnpm | 의존성 관리 |

## 빠른 시작

### 사전 요구사항

- Linux (Bazzite, Ubuntu, Fedora 등)
- Node.js 22+, pnpm 9+
- Rust stable (Tauri 빌드용)
- 시스템 패키지: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### 개발 실행

```bash
# 의존성 설치
cd shell && pnpm install
cd ../agent && pnpm install

# Tauri 앱 실행 (Gateway + Agent 자동 spawn)
cd ../shell && pnpm run tauri dev
```

앱 실행 시 자동으로:
1. OpenClaw Gateway health check → 실행 중이면 재사용, 아니면 자동 spawn
2. Agent Core spawn (Node.js, stdio 연결)
3. 앱 종료 시 자동 spawn한 Gateway만 종료

### 테스트

```bash
cd shell && pnpm test                # Shell 단위 테스트
cd agent && pnpm test                # Agent 단위 테스트
cd agent && pnpm exec tsc --noEmit   # 타입 체크
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust 테스트

# E2E (Gateway + API 키 필요)
cd shell && pnpm run test:e2e:tauri
```

### Flatpak 빌드

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## 보안 모델

Naia는 **다층 방어(Defense in Depth)** 보안 모델을 적용합니다:

| 계층 | 보호 수단 |
|------|----------|
| OS | Bazzite 불변 rootfs + SELinux |
| Gateway | OpenClaw 디바이스 인증 + 토큰 스코프 |
| Agent | 4단계 권한 (T0~T3) + 도구별 차단 |
| Shell | 사용자 승인 모달 + 도구 ON/OFF 토글 |
| 감사 | SQLite 감사 로그 (모든 도구 실행 기록) |

## 메모리 시스템

- **단기 기억 (STM):** 현재 세션 대화 (Zustand + SQLite)
- **장기 기억 (LTM):** 세션 요약 (LLM 생성) + 사용자 사실/선호 자동 추출
- **메모 스킬:** `skill_memo`로 명시적 메모 저장/조회

## 현재 상태

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 배포 파이프라인 (BlueBuild → ISO) | ✅ 완료 |
| 1 | 아바타 탑재 (VRM 3D 렌더링) | ✅ 완료 |
| 2 | 대화 (텍스트/음성 + 립싱크 + 감정) | ✅ 완료 |
| 3 | 도구 실행 (8개 도구 + 권한 + 감사) | ✅ 완료 |
| 4 | 상시 데몬 (Gateway + Skills + 메모리 + Discord) | ✅ 완료 |
| 5 | Nextain 계정 연동 (OAuth + 크레딧 + LLM 프록시) | ✅ 완료 |
| 6 | Tauri 앱 배포 (Flatpak/DEB/RPM/AppImage) | 🟡 진행 중 |
| 7 | OS ISO 이미지 (USB 부팅 → AI OS) | ⏳ 예정 |

## 개발 프로세스

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — 테스트 먼저 (RED) → 최소 구현 (GREEN) → 리팩터
- **VERIFY** — 실제 앱 실행 확인 (타입체크만으로 불충분)
- **커밋** — 영어, `<type>(<scope>): <description>`
- **포매터** — Biome (tab, double quote, semicolons)

## 참조 프로젝트

| 프로젝트 | 가져오는 것 |
|---------|------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | 불변 Linux OS, GPU, 게이밍 최적화 |
| [OpenClaw](https://github.com/steipete/openclaw) | Gateway 데몬, 채널 통합, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, 플러그인 프로토콜 |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server 분리, Provider 추상화 |
| Careti | LLM 연결, 도구 세트, 서브에이전트, 컨텍스트 관리 |

## 라이선스

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## 링크

- **공식 사이트:** [naia.nextain.io](https://naia.nextain.io)
- **매뉴얼:** [naia.nextain.io/ko/manual](https://naia.nextain.io/ko/manual)
- **대시보드:** [naia.nextain.io/ko/dashboard](https://naia.nextain.io/ko/dashboard)
