# E2E Discord 통합 아키텍처

## 개요

Gateway ↔ Agent ↔ Shell 간 Discord 통합 전체 아키텍처입니다.

## 컴포넌트

### Gateway (OpenClaw)
- Discord 봇 연결 관리
- RPC 메서드: `channels.status`, `channels.discord.readMessages`, `send`
- 설정 파일: `~/.openclaw/credentials/discord-allowFrom.json`, `openclaw.json`
- **소스 수정 불가**

### Agent
- `skill_naia_discord` 스킬로 Gateway와 통신
- 액션: `send`, `status`, `history`
- **채팅 라우팅**: `routeViaGateway` 플래그로 Gateway 경유 채팅 지원
  - `true` → `chat.send` RPC → Gateway Agent → LLM (통합 세션)
  - `false` → 기존 직접 LLM 호출 (fallback)
  - 설정: `chatRouting = "auto" | "gateway" | "direct"` (기본값: `"auto"`)
- 이벤트 핸들러: Gateway 이벤트를 Shell로 전달
  - `exec.approval.requested` → Shell 승인 모달
  - `logs.entry` → Shell 로그 패널
  - `channel.message` / `channels.message` → Shell Discord 메시지 표시
  - `agent.delta` → Gateway 채팅 스트리밍 텍스트/도구 사용
  - `agent.run.finished` / `chat.finished` → 사용량 + 완료

### Shell (Tauri 2 + React)
- ChatPanel: Discord 메시지를 `[Discord: <sender>]` 프리픽스로 표시
- SettingsTab / OnboardingWizard: OpenClaw 설정 동기화 트리거
- ChannelsTab: 연결 상태 표시
- OAuth deep link: `discord_auth_complete` 이벤트 처리

## OAuth Deep Link 흐름

```
Shell "Discord 봇 연결" 클릭
  → 브라우저: naia.nextain.io 통합 페이지
  → Discord OAuth 완료
  → Deep link: naia://auth/discord?user_id=<id>&channel_id=<id>
  → Rust: deep link 파싱 → discord_auth_complete 이벤트
  → Shell: persistDiscordDefaults() → config → agent env
```

### Deep Link 페이로드
- `discordUserId`: Discord 사용자 ID (숫자)
- `discordChannelId`: 채널 ID (선택)
- `discordTarget`: 사전 포맷된 타깃 (선택)

## OpenClaw 부트스트랩 파일 ↔ Shell 페르소나

| 파일 | 내용 |
|------|------|
| `SOUL.md` | 완성된 시스템 프롬프트 (페르소나 + emotion tag + 컨텍스트) |
| `IDENTITY.md` | 에이전트 이름 |
| `USER.md` | 사용자 이름 |
| `openclaw.json` | Provider/model 설정 |
| `auth-profiles.json` | API 인증 정보 |

## 채팅 라우팅

### 개요
Shell 채팅 메시지를 Gateway 경유로 전송하여 Discord와 통합 세션을 사용할 수 있습니다.

### 모드
| 모드 | 동작 |
|------|------|
| `auto` (기본) | Gateway 연결 시 Gateway 경유, 미연결 시 직접 LLM |
| `gateway` | 항상 Gateway 경유 (미연결 시 실패) |
| `direct` | 항상 직접 LLM (기존 동작) |

### 흐름
```
Gateway 경유: Shell → Agent → Gateway chat.send RPC → Gateway Agent → LLM
직접 LLM:     Shell → Agent → 직접 LLM API (Gateway 우회)
```

### 핵심 파일
- `agent/src/gateway/gateway-chat.ts` — Gateway 채팅 라우팅
- `agent/src/index.ts` — 라우팅 분기 (`routeViaGateway` 플래그)
- `shell/src/lib/config.ts` — `chatRouting` 설정
- `shell/src/lib/chat-service.ts` — request에 `routeViaGateway` 포함

## Shell 대화 동기화

### 현재
- 수동 폴링: `skill_naia_discord action=history`
- 실시간: Gateway `channel.message` 이벤트 수신 (연결 시)
- 표시: `[Discord: <sender>] <message>` 형태로 ChatPanel에 표시

### 향후
- 오프라인 → 온라인 메시지 동기화 (`chat.inject`)
- DM 외 Discord 스레드/채널 지원
- Gateway 세션 히스토리 브라우징

## 알려진 제한

- Gateway `chat.send` RPC 가용성은 OpenClaw 버전에 따름
- Batch fallback (agent → agent.wait → transcript) 시 스트리밍 손실
- SOUL.md의 emotion tag가 모든 Gateway LLM provider에서 지원되지 않을 수 있음
