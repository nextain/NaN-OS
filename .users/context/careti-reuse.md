# Careti에서 가져올 전략

> project-careti 개발 경험과 코드를 Naia OS에 재사용하는 전략

## 직접 재사용 가능한 코드

### 1. Desktop stdio 프로토콜 (거의 그대로)

**출처:** `project-careti/desktop/src-tauri/src/lib.rs` + `src/standalone/stdio-adapter.ts`

**가져올 것:**
- Tauri ↔ Node.js child process stdio 브릿지
- JSON lines 프로토콜 (요청/응답/스트리밍)
- 자동 재시작 로직 (크래시 복구)
- 비동기 메시지 큐

**적용:** Shell(Tauri) ↔ Agent Core 통신에 그대로 사용
```
Careti:  webview-ui → Tauri → cline-core (stdio)
Naia: shell      → Tauri → agent-core (stdio)
```

### 2. LLM 프로바이더 연결 (핵심 엔진)

**출처:** `project-careti/src/api/providers/`

**가져올 것:**
- 31개 프로바이더 어댑터 (Anthropic, OpenAI, Google, etc.)
- 스트리밍 응답 처리
- 에러 핸들링, 재시도 로직
- 모델 목록 자동 조회

**적용:** agent-core의 LLM 연결 레이어
- 처음부터 만들 필요 없음
- 사용자가 원하는 모델 자유롭게 선택

### 3. 도구 세트 (핵심 손)

**출처:** `project-careti/src/services/tree-sitter/`, `src/core/`

**가져올 것:**
- `read_file` — 파일 읽기 (라인 범위 지원)
- `write_to_file` — 파일 쓰기
- `apply_diff` + SmartEditEngine — 정밀 파일 편집
- `execute_command` — 터미널 명령 실행
- `browser_action` — 브라우저 제어
- `search_files` — ripgrep 기반 검색
- `list_files` — 디렉토리 탐색

**적용:** Phase 3 도구 시스템의 기반
- 코딩 전용이 아님 — 설정 파일 편집, 시스템 관리에도 사용

### 4. 서브에이전트 구조

**출처:** `project-careti/src/core/task/` (SubTask, 병렬 실행)

**가져올 것:**
- 서브태스크 생성/관리
- 병렬 실행 (여러 에이전트 동시 작업)
- 컨텍스트 전달

**적용:** Alpha가 전문가를 소환하는 능력

### 5. MCP 통합

**출처:** `project-careti/src/services/mcp/`

**가져올 것:**
- MCP 서버 연결/관리
- 도구 디스커버리
- MCP를 통한 외부 도구 확장

**적용:** 사용자가 MCP 서버로 Alpha의 능력을 확장

## 아키텍처/패턴 재사용

### 6. PlatformType 추상화 패턴

**출처:** `webview-ui/src/config/platform.config.ts`

**가져올 것:**
- 플랫폼별 코드 분기 패턴
- 빌드 타임 `__PLATFORM__` 주입
- 플랫폼별 설정 JSON

**적용:** Naia OS도 향후 Web/Mobile 확장 시 동일 패턴 사용

### 7. 메시지 큐 패턴

**출처:** `project-careti/src/core/task/`의 메시지 처리

**가져올 것:**
- 요청 ID 기반 비동기 메시지 매칭
- 스트리밍 응답 처리
- 취소(cancel) 메커니즘

**적용:** Shell ↔ Agent ↔ Gateway 전 구간에서 동일 패턴

### 8. 페르소나 시스템

**출처:** `project-careti/src/core/prompts/`

**가져올 것:**
- 시스템 프롬프트 구조
- 페르소나 프로필 (성격, 말투, 전문분야)
- 커스텀 지침

**적용:** Alpha의 성격 정의. 사용자가 커스터마이징 가능.

## 개발 프로세스 재사용

### 9. esbuild 번들링

**출처:** `project-careti/esbuild.mjs`

**가져올 것:**
- Node.js 코드를 단일 JS 파일로 번들
- `--standalone` 빌드 플래그
- tree-sitter WASM 포함

**적용:** agent-core를 단일 파일로 번들 → Tauri에서 spawn

### 10. gRPC/Protobuf 서비스 정의

**출처:** `project-careti/proto/`

**가져올 것:**
- 서비스별 메서드 정의 패턴
- 스트리밍 RPC 패턴

**적용:** Gateway ↔ Agent Core 프로토콜 정의 시 참조
(실제로는 stdio JSON이지만, 서비스 분리 패턴은 동일)

## 특별히 잘 활용할 것: 컨텍스트 & 문서 관리

### 11. Dual-Directory 아키텍처 (.agents/ + .users/)

**출처:** Caretive 워크스페이스의 컨텍스트 전파 시스템

```
.agents/                    # AI용 (영어, 토큰 최적화, JSON/YAML)
├── context/
│   ├── agents-rules.json   # SoT (Single Source of Truth)
│   └── project-index.yaml  # 진입점 맵
├── workflows/              # 작업별 절차
└── commands/               # 슬래시 명령

.users/                     # 사람용 (한국어, 상세, Markdown)
├── context/
│   └── agents-rules.md     # 규칙 상세 설명
└── workflows/
```

**Naia OS에서의 활용:**
- Alpha의 프로젝트/작업 컨텍스트 관리에 동일 패턴 적용
- **Alpha가 새 프로젝트를 만들 때** 자동으로 `.agents/context/` 구조 생성
- 사용자 문서와 AI 컨텍스트를 1:1 미러링

### 12. Cascade Rules (컨텍스트 전파)

**출처:** `.agents/context/agents-rules.json`의 `cascadeRules`

```
트리거: 서브모듈 추가 → 전파: parent 컨텍스트 업데이트
트리거: 내부 구조 변경 → 전파: parent, siblings
트리거: 규칙 변경 → 전파: .users/ 미러
```

**Naia OS에서의 활용:**
- Alpha가 파일/설정을 변경하면 관련 컨텍스트 자동 업데이트
- Skills 추가/제거 시 관련 문서 자동 갱신
- **Alpha 스스로가 자신의 컨텍스트를 관리**

### 13. CLAUDE.md / AGENTS.md 패턴

**출처:** 각 서브모듈의 진입점 파일

**Naia OS에서의 활용:**
- 각 프로젝트/작업 디렉토리에 Alpha용 컨텍스트 파일
- Alpha가 새 디렉토리에 진입 시 해당 컨텍스트 자동 로드
- 사용자가 "이 프로젝트는 이렇게 작업해줘"를 파일로 지시 가능

### 14. 작업 로그 시스템

**출처:** `docs-work-logs/` 구조

```
todo/    → 할 일
doing/   → 진행 중
done/    → 완료
파일명: YYYYMMDD-{번호}-{주제}.md
```

**Naia OS에서의 활용:**
- Alpha의 작업 이력을 동일 포맷으로 자동 기록
- 사용자가 "어제 뭐 했어?" → 작업 로그에서 조회
- 일간/주간/월간 요약 자동 생성

### 종합: Alpha의 "자기 관리 능력"

```
기존 Careti: 개발자가 컨텍스트 파일을 수동으로 관리
Naia OS: Alpha가 자신의 컨텍스트를 스스로 관리

- 새 작업 시작 → 작업 로그 자동 생성
- 프로젝트 구조 변경 → 컨텍스트 자동 갱신 (cascade)
- 규칙 변경 → 미러 자동 동기화
- 메모리 누적 → 벡터 DB + 구조화 문서 병행
```

이것이 단순 챗봇과 차별화되는 핵심.
Alpha는 **자기가 아는 것을 정리하고, 업데이트하고, 활용하는** 능력을 가짐.

---

## 가져오지 않을 것

| Careti 요소 | 이유 |
|-------------|------|
| VS Code 확장 구조 | OS이므로 불필요 |
| webview-ui React 앱 전체 | UI를 새로 만듦 (Avatar 중심) |
| Cline 포크 코드 | 업스트림 의존성 제거 |
| gRPC 서버 | stdio로 충분, 오버엔지니어링 |
| i18n 시스템 | 초기에는 한국어/영어만 |
| 계정/인증 시스템 | 로컬 OS이므로 불필요 (Phase 4 이후 검토) |

## 재사용 전략

```
방법 1: 코드 복사 후 정리 (권장)
  - Careti에서 필요한 파일만 복사
  - Cline/VS Code 의존성 제거
  - Naia OS 구조에 맞게 리팩토링

방법 2: 패키지로 분리
  - 공통 코드를 npm 패키지로 추출
  - Careti와 Naia OS 모두에서 사용
  - 유지보수 비용은 높아짐

방법 3: 참조만 (새로 구현)
  - Careti 코드를 보면서 동일 패턴으로 새로 작성
  - 깔끔하지만 시간이 더 걸림
```

**권장: Phase별로 다르게**
- Phase 1-2 (셸, 대화): 방법 1 (stdio 브릿지, LLM 프로바이더 복사)
- Phase 3 (도구): 방법 1 (도구 코드 복사 후 정리)
- Phase 4 (Gateway): 방법 3 (MoltBot 참조해서 새로 구현)
- Phase 5 (게임): 방법 3 (AIRI 참조해서 새로 구현)
