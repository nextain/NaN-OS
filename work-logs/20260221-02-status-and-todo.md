# 20260221-02: 프로젝트 현황 및 TODO

## 날짜
- 작성: 2026-02-21
- 상태: 진행 중

---

## 전체 진행 현황

| Phase | 이름 | 상태 | 비고 |
|-------|------|------|------|
| 0 | 배포 파이프라인 | ✅ 완료 | BlueBuild + GitHub Actions |
| 1 | Avatar on screen | ✅ 완료 | VRM 아바타, 눈 깜빡임, idle 모션 |
| 2 | Chat with Naia | ✅ 완료 | 3개 LLM, 립싱크, 감정, 비용 표시 |
| 3 | Naia does work | ✅ 완료 | 8개 도구, 권한 Tier 0-3, 감사 로그 |
| 4 | Always-on daemon | ✅ 완료 | Gateway, Skills, 메모리, 온보딩, Discord/Google Chat |
| 5 | Lab 통합 | 🔄 부분 | Deep link ✅, Auth UI 부분 ✅, LLM proxy ✅ |
| 6 | 앱 배포 | 🔄 부분 | Flatpak 빌드 성공, AppImage/deb/rpm 미완 |
| 7 | OS ISO | ⬜ 미시작 | |
| 8 | 게임 | ⬜ 미시작 | |

---

## 최근 완료 작업 (2026-02-21)

### 빌드 에러 수정
- Shell `tsc + vite build` 성공
- Agent `tsc` 빌드 성공

### Discord/Google Chat 양방향 통신
- **Gateway (any-llm)**: `provider_account_id` 컬럼, `/v1/auth/lookup` 엔드포인트
- **Discord 봇**: discord.js WebSocket, 멘션/DM → 유저 조회 → LLM → 응답
- **Google Chat**: POST 웹훅 수신 → 이메일 조회 → LLM → 응답
- **연동 UI**: settings/integrations 페이지 (한/영)
- **i18n**: 한국어/영어 사전 완성

### Flatpak 빌드
- GNOME 47 런타임 (webkit2gtk-4.1 호환)
- `npx pnpm` + `CI=true` 조합으로 SDK 읽기 전용 파일시스템 해결
- `cargo build --release` 성공 (204.9 MB)

---

## 사용자 수동 작업 필요 (TODO)

### 🔴 필수 (배포 전)

1. **Discord 봇 실행 테스트**
   ```bash
   cd project-naia.nextain.io
   npm run bot:discord
   ```
   - Discord에서 봇 멘션/DM → 응답 확인
   - 미등록 유저 안내 메시지 확인

2. **Google Chat 앱 등록**
   - Google Workspace Admin Console에서 Chat 앱 등록
   - Webhook URL: `https://naia.nextain.io/api/webhooks/googlechat`
   - 테스트: Google Chat에서 앱에 메시지 전송 → 응답 확인

3. **any-llm DB 마이그레이션 실행**
   ```bash
   cd project-any-llm
   alembic upgrade head  # provider_account_id 컬럼 추가
   ```

4. **환경변수 확인**
   - `naia.nextain.io/.env`: `DISCORD_BOT_TOKEN`, `DISCORD_OAUTH2_URL` 설정 확인
   - 프로덕션 환경에도 동일 변수 설정 필요

### 🟡 권장 (품질)

5. **Flatpak 런타임 테스트**
   ```bash
   cd Naia-OS
   flatpak run com.naia.shell
   ```
   - 앱 실행, 아바타 렌더링, 채팅 기능 확인
   - (참고: GNOME 47 EOL이지만 Tauri 2 + webkit2gtk-4.1 때문에 불가피)

6. **크레딧 차감 확인**
   - Discord/Google Chat 대화 후 naia.nextain.io 대시보드에서 사용량 확인

### 🟢 향후 (Phase 5-8)

7. **Phase 5 나머지**
   - Lab 데스크톱 키 발급 API 완성
   - Credit balance 실시간 조회 개선

8. **Phase 6 나머지**
   - AppImage/deb/rpm 빌드 (GitHub Actions workflow)
   - Flathub 제출

9. **Phase 7: OS ISO**
   - BlueBuild recipe에 Tauri 앱 포함
   - ISO 빌드 테스트

10. **Phase 4-3b: 51개 스킬 이식**
    - OpenClaw 스킬 매니페스트 자동 생성
    - 각 스킬 E2E 테스트

---

## 아키텍처 요약

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Naia OS  │     │ naia.nextain.io  │     │ any-llm GW   │
│ (Tauri 앱)  │────→│ (Next.js 포털)   │────→│ (FastAPI)    │
│ Shell+Agent │     │ OAuth + 크레딧    │     │ LLM 프록시    │
└─────────────┘     └──────────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              ┌─────┴─────┐ ┌────┴─────┐
              │ Discord   │ │ Google   │
              │ Bot       │ │ Chat     │
              │ (discord. │ │ Webhook  │
              │  js)      │ │          │
              └───────────┘ └──────────┘
```

---

## 수정 파일 요약 (이번 세션)

### any-llm (Python)
- `db/caret_models.py` — provider_account_id 컬럼
- `routes/auth.py` — socialLogin 수정, lookup 엔드포인트
- `alembic/versions/a2f7b8c9d0e1_*.py` — 마이그레이션

### naia.nextain.io (Next.js)
- `src/lib/gateway-client.ts` — socialLogin 파라미터, lookupUser()
- `src/lib/auth.ts` — providerAccountId 전달
- `src/lib/discord-bot.ts` — 새로 생성
- `src/lib/discord-bot-config.ts` — 새로 생성
- `scripts/start-discord-bot.ts` — 새로 생성
- `src/app/api/webhooks/googlechat/route.ts` — 새로 생성
- `src/app/[lang]/(protected)/settings/integrations/page.tsx` — 새로 생성
- `src/i18n/dictionaries/{types,ko,en}.ts` — integrations 섹션
- `package.json` — discord.js, dotenv, tsx
- `src/content/manual/{ko,en}/channels.md` — Discord/Google Chat 연동 가이드 추가
- `src/content/manual/{ko,en}/settings.md` — 연동 섹션 추가
- `src/content/manual/{ko,en}/lab.md` — 연동 섹션 추가

### Naia-OS
- `flatpak/com.naia.shell.yml` — GNOME 47, npx pnpm, cargo build
- `.agents/context/plan.yaml` — Phase 4-5-6 상태 업데이트
- `.users/context/plan.md` — 미러 업데이트
- `work-logs/20260221-01-discord-googlechat-integration.md` — 작업 로그
