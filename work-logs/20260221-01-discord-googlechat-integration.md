# 20260221-01: Discord/Google Chat 양방향 통신 + 빌드/Flatpak 수정

## 날짜
- 시작: 2026-02-21
- 상태: 완료

## 요약

Nextain 서비스에 Discord/Google Chat 양방향 통신 기능 구현 및 빌드 수정.

## 완료 작업

### Phase 1: 빌드 에러 수정
- Port 1420 충돌 없음 확인
- shell `tsc + vite build` 성공
- agent `tsc` 빌드 성공

### Phase 2: Discord/Google Chat 양방향 통신

#### Gateway (any-llm) 변경
- `CaretUser` 모델에 `provider_account_id` 컬럼 추가 (인덱스 포함)
- `SocialLoginRequest`에 `provider_account_id` 필드 추가
- `social_login` 엔드포인트에서 신규/기존 유저 모두 `provider_account_id` 저장
- `GET /v1/auth/lookup` 엔드포인트 추가 (master key 전용)
  - provider + provider_account_id 또는 email로 유저 조회
- Alembic 마이그레이션 `a2f7b8c9d0e1` 생성

#### Lab (naia.nextain.io) 변경
- `socialLogin()` 함수에 `providerAccountId` 파라미터 추가
- `lookupUser()` 함수 추가 (봇/웹훅에서 유저 조회용)
- NextAuth JWT callback에서 `account.providerAccountId` 전달
- Session에 `provider` 필드 추가 (연동 상태 표시용)

#### Discord 봇 서비스
- `src/lib/discord-bot.ts` — 봇 코어 (discord.js WebSocket)
  - 멘션/DM 감지 → 유저 조회 → LLM 호출 → 응답
  - 미등록 유저 안내 메시지
  - Rate limiting (분당 10회)
  - 메시지 2000자 분할
- `src/lib/discord-bot-config.ts` — 봇 설정 상수
- `scripts/start-discord-bot.ts` — 봇 프로세스 진입점
- `package.json` — discord.js, dotenv, tsx 의존성 + `bot:discord` 스크립트

#### Google Chat 웹훅
- `src/app/api/webhooks/googlechat/route.ts`
  - POST 웹훅 수신 → 이메일로 유저 조회 → LLM 호출 → 응답

#### 연동 가이드 UI
- `src/app/[lang]/(protected)/settings/integrations/page.tsx`
  - Discord/Google Chat 연동 상태 표시
  - 봇 초대 링크 (DISCORD_OAUTH2_URL)
  - 사용 안내
- 설정 페이지에 연동 카드 링크 추가
- i18n: ko/en 사전에 `integrations` 섹션 추가

#### 환경변수
- `naia.nextain.io/.env`에 `DISCORD_BOT_TOKEN`, `DISCORD_OAUTH2_URL` 추가

### Phase 3: Flatpak 빌드 수정
- GNOME 48 → 47 런타임 다운그레이드 (javascriptcoregtk-4.1 호환)
- `npx pnpm` + `CI=true`로 패키지 설치 (SDK 읽기 전용 파일시스템 대응)
- `tauri build` → `cargo build --release`로 변경 (번들링 건너뛰기)
- agent node_modules 복사 추가 (런타임 필요)
- **빌드 성공**: x86-64 ELF 바이너리 (204.9 MB, stripped)
- 참고: GNOME 47은 EOL이지만 Tauri 2가 webkit2gtk-4.1 의존성이므로 불가피

## 수정 파일 목록

### any-llm gateway
| 파일 | 변경 |
|------|------|
| `db/caret_models.py` | `provider_account_id` 컬럼 추가 |
| `routes/auth.py` | request/normalize/login에 provider_account_id, lookup 엔드포인트 |
| `alembic/versions/a2f7b8c9d0e1_*.py` | 마이그레이션 |

### naia.nextain.io
| 파일 | 변경 |
|------|------|
| `src/lib/gateway-client.ts` | socialLogin 파라미터, lookupUser 함수 |
| `src/lib/auth.ts` | providerAccountId 전달, session.provider |
| `src/lib/discord-bot.ts` | 새로 생성 |
| `src/lib/discord-bot-config.ts` | 새로 생성 |
| `scripts/start-discord-bot.ts` | 새로 생성 |
| `src/app/api/webhooks/googlechat/route.ts` | 새로 생성 |
| `src/app/[lang]/(protected)/settings/integrations/page.tsx` | 새로 생성 |
| `src/app/[lang]/(protected)/settings/page.tsx` | 연동 카드 링크 |
| `src/types/next-auth.d.ts` | Session.provider 추가 |
| `src/i18n/dictionaries/types.ts` | integrations 타입, install 프로퍼티 |
| `src/i18n/dictionaries/ko.ts` | 한국어 사전 |
| `src/i18n/dictionaries/en.ts` | 영어 사전 |
| `package.json` | discord.js, dotenv, tsx, bot:discord |
| `.env` | DISCORD_BOT_TOKEN, DISCORD_OAUTH2_URL |

### Naia-OS
| 파일 | 변경 |
|------|------|
| `flatpak/com.naia.shell.yml` | GNOME 47, pnpm, node_modules 복사 |

## 아키텍처 요약

```
Discord 유저 → @봇 멘션/DM → Discord WebSocket (discord.js)
                                    ↓
                           naia.nextain.io (봇 프로세스)
                                    ↓
                           GET /v1/auth/lookup (provider_account_id)
                                    ↓
                           POST /v1/chat/completions (user=gwUserId)
                                    ↓
                           응답 → Discord reply

Google Chat → POST /api/webhooks/googlechat
                                    ↓
                           GET /v1/auth/lookup (email)
                                    ↓
                           POST /v1/chat/completions (user=gwUserId)
                                    ↓
                           JSON 응답 → Google Chat
```

## 다음 단계
- Flatpak 빌드 결과 확인
- Discord 봇 실제 실행 테스트 (`npm run bot:discord`)
- Google Chat 앱 등록 및 webhook URL 설정
- 프로덕션 배포 계획
