# Naia 프로젝트 규칙

> SoT: `.agents/context/agents-rules.json`의 한국어 미러

## 프로젝트 정체성

- **이름**: Naia
- **성격**: Bazzite 기반 개인 AI OS, 가상 아바타 탑재
- **철학**: OS 자체가 AI의 도구. 처음부터 만들지 않고 조립한다.
- **핵심**: USB 부팅 → Alpha 아바타가 맞이 → AI가 OS를 제어

## 아키텍처 4계층

| 계층 | 기술 | 역할 |
|------|------|------|
| Shell | Tauri 2 + Three.js | Avatar UI, 사용자 상호작용 |
| Agent | Node.js | LLM 연결, 도구, 서브에이전트 |
| Gateway | WebSocket 데몬 | 채널, Skills, 메모리 |
| OS | Bazzite (Fedora Atomic) | 불변 OS, BlueBuild |

### 통신 프로토콜

```
Shell ←stdio JSON lines→ Agent Core
Shell ←WebSocket→ Gateway ←stdio→ Agent Core
Gateway ←채널 SDK→ Discord, Telegram 등
```

### 소스 디렉토리

```
naia-os/
├── shell/      # Tauri 데스크탑 앱 (Avatar + UI)
├── agent/      # AI 에이전트 코어
├── gateway/    # 항상 실행되는 데몬
└── os/         # BlueBuild 레시피 + systemd
```

---

## 코딩 컨벤션

### 언어 & 런타임
- **TypeScript**: Shell 프론트엔드, Agent, Gateway
- **Rust**: Tauri 백엔드
- **패키지 매니저**: pnpm (모노레포 워크스페이스)
- **런타임**: Node.js 22+

### 포맷터: Biome
- 들여쓰기: 탭
- 따옴표: 쌍따옴표
- 세미콜론: 항상
- 트레일링 콤마: 항상
- 줄 너비: 100

### 네이밍 규칙

| 대상 | 스타일 | 예시 |
|------|--------|------|
| 파일/디렉토리 | kebab-case | `agent-core.ts` |
| 클래스 | PascalCase | `AvatarRenderer` |
| 함수 | camelCase | `sendMessage()` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| 타입/인터페이스 | PascalCase | `AgentConfig` (I- 접두사 없음) |
| Rust 파일 | snake_case | `stdio_bridge.rs` |

### import 순서
1. Node.js 내장 모듈
2. 외부 패키지
3. 내부 모듈
4. 상대 경로

### 주석
- 코드 주석: 영어
- 문서: 한국어
- 자명한 로직에는 주석 달지 않음

### 에러 핸들링
- 시스템 경계에서만 검증 (사용자 입력, 외부 API, LLM 응답)
- Rust: `Result<T, Error>` 패턴
- TypeScript: 경계에서 try-catch

---

## 테스트

### 철학
**Integration-first TDD.** 실제 사용 시나리오를 먼저 테스트.

### TDD 순서
```
❌ 잘못: 헬퍼 함수 유닛 테스트 → 구현 → 나중에 통합
✅ 올바름: 통합/E2E 테스트 작성(RED) → 최소 구현(GREEN) → 리팩터(REFACTOR)
```

### 테스트 프레임워크

| 종류 | 프레임워크 |
|------|-----------|
| 유닛/통합 | Vitest |
| E2E (Shell) | @tauri-apps/cli (tauri-driver) + WebDriver |
| E2E (OS) | QEMU VM boot (libvirt in CI) |
| 모킹 | msw (Mock Service Worker) |
| Rust | cargo test |

### 테스트 파일 위치

```
<module>/__tests__/*.test.ts      # 유닛
tests/integration/*.test.ts       # 통합
tests/e2e/*.spec.ts               # E2E
<crate>/src/*.rs                  # Rust (#[cfg(test)])
```

### E2E 시나리오

**Shell:**
- 앱 실행 → 아바타 렌더링 → idle 애니메이션
- 메시지 입력 → LLM 응답 → 립싱크
- 파일 편집 요청 → 권한 승인 → 파일 수정
- 앱 크래시 → 자동 재시작 → 세션 복구

**Agent:**
- stdin 메시지 → LLM 호출 → stdout 스트리밍 응답
- 도구 호출 → 권한 확인 → 실행 → 결과
- 서브에이전트 생성 → 병렬 실행 → 결과 병합

**OS:**
- ISO 부팅 → 로그인 → Naia Shell 자동 시작
- 첫 부팅 → 온보딩 위자드 → API 키 설정 → 첫 대화

### 테스트 명령어

```bash
pnpm test:unit         # 유닛 테스트
pnpm test:integration  # 통합 테스트
pnpm test:e2e          # E2E 테스트
pnpm test              # 전체
pnpm test:coverage     # 커버리지 포함
```

### 커버리지 목표
- Agent Core: 80%+
- Shell 컴포넌트: 70%+
- Gateway: 80%+
- E2E: 모든 핵심 사용자 플로우

---

## 로깅

### TypeScript (Shell frontend, Agent)

**금지**: `console.log`, `console.warn`, `console.error`

```typescript
import { Logger } from "./logger"; // shell/src/lib/logger.ts

Logger.debug("[AgentCore] Processing message", { id });
Logger.info("[AgentCore] LLM response received", { model, tokens });
Logger.warn("[Gateway] Channel reconnecting", { channel: "discord" });
Logger.error("[Shell] Avatar render failed", error);
```

| 레벨 | 용도 |
|------|------|
| debug | 개발 디버깅 (프로덕션에서 strip) |
| info | 중요한 작업 완료, 상태 변경 |
| warn | 잠재적 문제, 성능 저하 |
| error | 실제 오류, 예외 |

### Rust (Tauri backend — `shell/src-tauri/src/lib.rs`)

**금지**: raw `eprintln!`, `println!`

| 함수 | stderr | 파일 | 용도 |
|------|--------|------|------|
| `log_both` | 항상 | 항상 | 세션 시작/종료, 에러, 인증 이벤트, 중요 상태 변경 |
| `log_verbose` | debug 빌드만 | 항상 | 경로 탐색, PID, 환경변수, 진행 상황, 윈도우 상태 |
| `log_to_file` | 안 찍힘 | 항상 | 고빈도 내부 이벤트 |

```rust
// ✅ 올바른 사용
log_both("[Naia] Gateway healthy after 25s");                    // 릴리즈에서도 보임
log_verbose(&format!("[Naia] Found agent at: {}", path));        // 릴리즈에서 파일만
log_verbose(&format!("[Naia] Gateway env: {}=***", key));        // 값은 마스킹

// ❌ 금지
eprintln!("[Naia] some debug info");  // raw eprintln 금지
```

**보안**: API 키, 토큰, 비밀번호는 절대 로그에 노출 불가. 환경변수 값은 `***`로 마스킹.

**로그 파일 위치**: `~/.naia/logs/` (naia.log, gateway.log, node-host.log)

### 감사 로그 (Audit Log)
- **목적**: AI의 모든 행동을 기록 (보안 + 투명성)
- **저장**: `~/.naia/audit.db` (SQLite)
- **필드**: timestamp, tier, action, target, result
- **보존**: 90일 기본

---

## 보안

### 권한 계층 (Permission Tiers)

| Tier | 정책 | 예시 |
|------|------|------|
| **0: 자유** | 확인 불필요 | 파일 읽기, 정보 조회, 대화, 검색 |
| **1: 알림** | 사후 보고 | 파일 생성/수정(~/내), 비파괴 명령, 앱 실행 |
| **2: 승인** | 사전 확인 필요 | 파일 삭제, 패키지 설치/제거, 시스템 설정, git push |
| **3: 금지** | 절대 불가 | 시스템 파일 수정, 타 사용자 데이터, 보안 설정 변경, 인증정보 외부 전송 |

### 샌드박스
- **기본 범위**: 사용자 홈 디렉토리만
- **위험 명령**: Podman 일회용 컨테이너에서 실행
- **네트워크 격리**: 민감 작업은 네트워크 차단 컨테이너

### OS 기본 보안
- **불변 OS**: rpm-ostree, 시스템 파괴 불가, 롤백 가능
- **SELinux**: 프로세스별 접근 제어
- **Flatpak**: 앱 샌드박싱
- **Podman**: 루트리스 컨테이너

### 인증 정보
- **저장**: `~/.naia/credentials/` (암호화)
- **규칙**: Agent는 키를 사용할 수 있지만 값을 볼 수 없음
- **금지**: API 키, 토큰, 비밀번호는 로그/감사에 절대 노출 불가

### 원격 접근
- **기본**: localhost만 (127.0.0.1)
- **허용**: Tailscale VPN 또는 SSH 터널
- **외부 채널**: Discord/Telegram은 Tier 0-1 권한만

---

## 개발 프로세스

### 브랜치 전략

```
main ← 항상 배포 가능 (BlueBuild가 main에서 빌드)
  └── dev ← 통합 브랜치
        └── feature/<name> ← 기능 브랜치 (짧은 수명, PR to dev)
```

### 커밋 컨벤션

```
<type>(<scope>): <description>

types: feat, fix, refactor, test, docs, chore, ci
scopes: shell, agent, gateway, os, context

예시:
feat(shell): add VRM avatar idle animation
fix(agent): handle LLM timeout gracefully
ci(os): add BlueBuild GitHub Action
```

### PR 프로세스
1. dev에서 feature 브랜치 생성
2. 테스트 먼저 작성 (TDD)
3. 최소 코드 구현
4. 모든 테스트 통과 확인
5. dev로 PR (설명 포함)
6. Squash merge
7. 주기적으로 dev → main 머지 (릴리스)

### CI 파이프라인

| 트리거 | 실행 |
|--------|------|
| push | lint, typecheck, unit tests, build |
| PR | 위 + 통합 테스트 |
| main merge | 위 + E2E + BlueBuild 이미지 + ISO 생성 |

### 코드 리뷰

AI 리뷰 권장, 보안 관련은 사람 리뷰 필수.

**코드 품질:**
- [ ] 새 행동에 대한 테스트 추가/업데이트?
- [ ] 중복 코드 없는가? (같은 로직이 2곳 이상)
- [ ] 미사용 import/함수/파일 없는가? (knip clean)
- [ ] 이전 구현의 좀비 코드 없는가?
- [ ] 구조화된 로거 사용? (console.log 없음)

**보안:**
- [ ] 새 도구의 권한 Tier 올바른지?
- [ ] 감사 로그에 새 AI 행동이 기록되는지?
- [ ] 하드코딩된 인증 정보 없는지?
- [ ] 위험 작업이 Podman 샌드박스를 사용하는지?
- [ ] 외부 네트워크 접근이 정당한지?
- [ ] LLM 프롬프트 변경이 안전한지?

**아키텍처:**
- [ ] 올바른 모듈에 코드가 있는가? (shell/agent/gateway/os)
- [ ] stdio 프로토콜 변경이 하위 호환인가?
- [ ] 불필요한 새 파일이 없는가? (기존 파일 확장으로 가능했는지)
- [ ] 6개월 후에도 이해할 수 있는 코드인가?

---

## 컨텍스트 관리

### Dual-directory 아키텍처
```
.agents/   → AI용 (영어, JSON/YAML, 토큰 최적화)
.users/    → 사람용 (한국어, Markdown, 상세)
```

### 규칙
- **SoT**: `.agents/context/agents-rules.json`이 유일한 규칙 소스
- **미러링**: `.agents/` 변경 시 `.users/`도 반영 (역도 마찬가지)
- **온디맨드 로딩**: 워크플로우는 필요할 때만 읽기
- **항상 읽기**: `agents-rules.json`
- **필요시 읽기**: `workflows/*`, `skills/*`

### Cascade (전파) 규칙
- 컨텍스트 변경 → `.users/` 미러 업데이트
- 모듈 추가 → parent 인덱스 업데이트
- 규칙 변경 → 모든 의존 컨텍스트에 전파
- **순서**: self → parent → siblings → children → mirror

---

## AI 워크플로우

- **응답 언어**: 한국어
- **작업 전 필수**: `agents-rules.json` 읽기
- **작업 유형 확인**: shell / agent / gateway / os 중 어디?
- **TDD 필수**: 통합 테스트 우선
- **보안 확인**: 새 도구/명령의 Tier 확인
