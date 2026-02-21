# Naia OS

Bazzite 기반 배포형 AI OS. Naia(AI 아바타)가 상주하는 개인 운영체제.

## 필수 읽기 (세션 시작 시)

**아래 파일들을 반드시 먼저 읽어주세요:**

1. `.agents/context/agents-rules.json` — 프로젝트 핵심 규칙 (SoT)
2. `.agents/context/project-index.yaml` — 컨텍스트 인덱스 + 미러링 규칙

필요 시 `.agents/context/`에서 관련 컨텍스트를 온디맨드로 로드합니다.

## Dual-directory (컨텍스트 구조)

```
.agents/                    # AI용 (영어, JSON/YAML, 토큰 최적화)
├── context/
│   ├── agents-rules.json   # SoT ← 필수 읽기
│   ├── project-index.yaml  # 인덱스 + 미러링 ← 필수 읽기
│   ├── vision.yaml         # 비전 (요약)
│   ├── plan.yaml           # 구현 계획 (요약)
│   └── careti-reuse.yaml   # 재사용 전략 (요약)
├── workflows/              # 작업 워크플로우 (온디맨드)
└── skills/                 # 스킬 정의

.users/                     # 사람용 (한국어, Markdown, 상세)
├── context/
│   ├── agents-rules.md     # 규칙 상세 (미러)
│   ├── vision.md           # 비전 상세
│   ├── plan.md             # 구현 계획 상세
│   └── careti-reuse.md     # 재사용 전략 상세
└── workflows/
```

## 핵심 원칙

1. **최소주의** — 필요한 것만 만든다
2. **배포 먼저** — Phase 0부터 ISO 자동 빌드
3. **Avatar 중심** — Naia가 살아있는 경험
4. **데몬 아키텍처** — AI가 항상 켜져있다
5. **프라이버시** — 로컬 실행 기본

## 프로젝트 구조

```
Naia-OS/
├── shell/          # Nextain Shell (Tauri 2, Three.js Avatar)
├── agent/          # AI 에이전트 코어 (LLM 연결, 도구)
├── gateway/        # 항상 실행되는 데몬 (채널, Skills, 메모리)
├── recipes/        # BlueBuild recipe
├── config/         # BlueBuild config (scripts, files)
├── os/             # OS 테스트, 유틸리티
└── work-logs/      # 개발 작업 로그 (이 프로젝트 전용)
```

## 컨벤션 (요약)

- **한국어 응답**
- **커밋**: 영어, `<type>(<scope>): <description>`
- **포맷터**: Biome (tab, double quote, semicolons)
- **테스트**: Integration-first TDD (Vitest + tauri-driver)
- **로깅**: 구조화된 Logger만 (console.log 금지)
- **보안**: Tier 0-3 권한 계층

상세 규칙은 `.agents/context/agents-rules.json` 참조.

## 주요 명령어

```bash
# Shell (Tauri 앱 — Gateway + Agent 자동 관리)
cd shell && pnpm run tauri dev       # 개발 실행 (Gateway 자동 spawn)
cd shell && pnpm test                # Shell 테스트
cd shell && pnpm build               # 프로덕션 빌드

# Agent
cd agent && pnpm test                # Agent 테스트
cd agent && pnpm exec tsc --noEmit   # 타입 체크

# Rust
cargo test --manifest-path shell/src-tauri/Cargo.toml

# Tauri Webview E2E (실제 앱 자동화, Gateway + API key 필요)
cd shell && pnpm run test:e2e:tauri

# Gateway (수동 실행 시)
~/.naia/openclaw/node_modules/.bin/openclaw gateway run --bind loopback --port 18789

# Gateway E2E
cd agent && CAFE_LIVE_GATEWAY_E2E=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts
```

## 개발 사이클

**코딩 전 반드시 읽기:** `.agents/workflows/development-cycle.yaml`

```
PLAN → CHECK → BUILD → VERIFY → CLEAN → COMMIT
```

핵심: **기존 코드 먼저 검색, 중복 생성 금지, 미사용 코드 정리, 셀프 리뷰 후 커밋.**
