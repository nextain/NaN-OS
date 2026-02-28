# Naia

Bazzite 기반 배포형 AI OS. Naia(AI 아바타)가 상주하는 개인 운영체제.

## 필수 읽기 (세션 시작 시)

**아래 파일들을 반드시 먼저 읽어주세요:**

1. `.agents/context/agents-rules.json` — 프로젝트 핵심 규칙 (SoT)
2. `.agents/context/project-index.yaml` — 컨텍스트 인덱스 + 미러링 규칙

필요 시 `.agents/context/`에서 관련 컨텍스트를 온디맨드로 로드합니다.

## Triple-mirror 컨텍스트 구조

```
.agents/                    # AI용 (영어, JSON/YAML, 토큰 최적화)
├── context/
│   ├── agents-rules.json   # SoT ← 필수 읽기
│   ├── project-index.yaml  # 인덱스 + 미러링 규칙 ← 필수 읽기
│   ├── architecture.yaml   # 아키텍처 (agent/gateway/Rust)
│   ├── distribution.yaml   # 배포 (Flatpak/ISO/AppImage)
│   ├── bazzite-rebranding.yaml # Bazzite 리브랜딩 가이드
│   ├── openclaw-sync.yaml  # OpenClaw 동기화
│   └── ...                 # 전체 목록은 project-index.yaml 참조
├── workflows/              # 작업 워크플로우 (온디맨드)
└── skills/                 # 스킬 정의

.users/                     # 사람용 (한국어, Markdown, 상세)
├── context/                # .agents/context/ 한국어 미러
│   └── en/                 # 영문 미러 (오픈소스 커뮤니티용)
└── workflows/              # .agents/workflows/ 미러
```

**삼중 미러링**: `.agents/` (AI) ↔ `.users/context/` (한국어) ↔ `.users/context/en/` (영문)
- README는 한국어 유지, 컨텍스트 문서는 세 버전 모두 관리
- 변경 시 세 레이어 모두 전파

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
└── assets/         # 로고, 월페이퍼, 인스톨러 이미지
```

## 컨벤션 (요약)

- **응답 언어**: 기여자의 선호 언어
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
node ~/.naia/openclaw/node_modules/openclaw/openclaw.mjs gateway run --bind loopback --port 18789

# Gateway E2E
cd agent && CAFE_LIVE_GATEWAY_E2E=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts

# 데모 영상 (상세: .agents/context/demo-video.yaml)
cd shell && pnpm test:e2e -- demo-video.spec.ts   # 1) Playwright 녹화
cd shell && npx tsx e2e/demo-tts.ts                # 2) TTS 나레이션 생성
cd shell && bash e2e/demo-merge.sh                 # 3) ffmpeg 합성 → MP4
```

## 배포 빌드

배포 관련 상세 컨텍스트: `.agents/context/distribution.yaml`

```bash
# Flatpak 로컬 빌드 (MUST clean before build)
rm -rf flatpak-repo build-dir .flatpak-builder
flatpak-builder --force-clean --disable-rofiles-fuse --repo=flatpak-repo build-dir flatpak/io.nextain.naia.yml
flatpak build-bundle flatpak-repo Naia-Shell-x86_64.flatpak io.nextain.naia

# GitHub Release에 업로드
gh release upload v0.1.0 Naia-Shell-x86_64.flatpak --clobber

# OS 이미지 (BlueBuild → GHCR) — CI에서 자동
# ISO 생성 — GHCR 이미지 필요, CI에서 자동 또는 수동 트리거
gh workflow run iso.yml
```

### 필수 SDK (Flatpak 로컬 빌드)
- `flatpak-builder`
- `org.gnome.Platform//49` + `org.gnome.Sdk//49`
- `org.freedesktop.Sdk.Extension.rust-stable`
- `org.freedesktop.Sdk.Extension.node22`

### Flatpak 주의사항
- **NEVER use `cargo build --release`** — 흰 화면 발생 (WebKitGTK asset protocol 미설정)
- **ALWAYS use `npx tauri build --no-bundle --config src-tauri/tauri.conf.flatpak.json`**
- 로컬 테스트: `bash scripts/local-reinstall-run-naia-flatpak.sh`
- 상세: `.agents/context/distribution.yaml`

## 개발 사이클

**코딩 전 반드시 읽기:** `.agents/workflows/development-cycle.yaml`

```
PLAN → CHECK → BUILD → VERIFY → CLEAN → COMMIT
```

핵심: **기존 코드 먼저 검색, 중복 생성 금지, 미사용 코드 정리, 셀프 리뷰 후 커밋.**

## 병렬 세션 파일 잠금 (File Lock Protocol)

여러 Claude 세션이 동시에 작업할 때 파일 충돌을 방지하는 규칙.

**잠금 파일**: `/home/luke/dev/.claude/file-locks.json` (절대경로, 양쪽 세션 공유)

### 규칙

1. **편집 전 확인**: 파일 수정 전 `file-locks.json`을 읽고 해당 파일이 다른 세션에 잠겨있는지 확인
2. **잠금 등록**: 새 파일 편집 시작 시 `locks`에 등록 (owner = 브랜치명)
3. **완료 후 해제**: 작업 완료 시 해당 잠금 제거
4. **충돌 시 중단**: 잠긴 파일을 수정해야 하면, 사용자에게 알리고 대기
5. **free 목록**: `free` 배열에 있는 파일은 누구나 자유롭게 생성/수정 가능
6. **CSS 규칙**: `global.css`가 잠겨있어도, 고유 prefix(`.googlechat-*` 등)의 새 클래스는 추가 가능

### 사용법

```bash
# 잠금 확인 (세션 시작 시)
cat /home/luke/dev/.claude/file-locks.json
```
