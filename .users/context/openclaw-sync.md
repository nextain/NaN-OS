# OpenClaw 설정 동기화

## 개요

Shell(Tauri 앱) 사용자 설정을 OpenClaw Gateway 부트스트랩 파일에 동기화하는 아키텍처입니다.
이를 통해 Discord DM, TTS 등 Gateway 기능이 Shell과 동일한 페르소나/인증 정보를 사용합니다.

## 동기화 시점

| 트리거 | 파일 | 함수 |
|--------|------|------|
| Settings 저장 | `SettingsTab.tsx` | `handleSave()` |
| Onboarding 완료 | `OnboardingWizard.tsx` | `handleComplete()` |
| Lab 인증 콜백 | `SettingsTab.tsx` | `lab_auth_complete` listener |

## 동기화 항목

### 1. `openclaw.json` — Provider/Model
Shell provider를 OpenClaw provider 이름으로 매핑합니다.

| Shell Provider | OpenClaw Provider |
|---------------|-------------------|
| gemini | google |
| anthropic | anthropic |
| xai | xai |
| openai | openai |
| nextain | nextain |
| claude-code-cli | anthropic |
| ollama | ollama |

### 2. `auth-profiles.json` — API 키
- Lab 프록시(nextain) 및 키 불필요 provider는 건너뜀

### 3. `SOUL.md` — 시스템 프롬프트 (완성본)
`buildSystemPrompt()`의 결과를 그대로 저장합니다:
- 페르소나 원문 (이름 치환 적용됨)
- Emotion tag 지시문
- 사용자 이름 컨텍스트
- 최근 메모리 요약 (빌드 시점 가용 시)

### 4. `IDENTITY.md` / `USER.md`
- 에이전트 이름, 사용자 이름

## 핵심 파일

- `shell/src/lib/openclaw-sync.ts` — `syncToOpenClaw()`
- `shell/src/lib/persona.ts` — `buildSystemPrompt()`
- `shell/src-tauri/src/lib.rs` — `sync_openclaw_config` Tauri 커맨드

## 채팅 라우팅 모드

채팅 메시지를 Gateway 경유로 보낼 수 있습니다.

| 설정 | 값 | 동작 |
|------|---|------|
| `AppConfig.chatRouting` | `"auto"` (기본) | Gateway 연결 시 Gateway 경유, 아니면 직접 LLM |
| | `"gateway"` | 항상 Gateway 경유 |
| | `"direct"` | 항상 직접 LLM (기존 동작) |

Agent 측 필드: `ChatRequest.routeViaGateway` (boolean)

관련 파일:
- `agent/src/gateway/gateway-chat.ts`
- `shell/src/lib/config.ts`

## 제약사항

- **OpenClaw 소스 수정 불가** — 우리 코드만 수정
- 동기화는 best-effort — 에러 시 로그만 남기고 UI 차단하지 않음
- SOUL.md에는 emotion tag 포함 **완성된** 시스템 프롬프트가 저장됨
