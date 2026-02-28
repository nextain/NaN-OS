# Phase 3: OpenClaw 하이브리드 통합 상세 계획

> "Alpha가 일을 한다" — 파일 편집, 명령 실행, 웹 검색을 안전하게

## 1. 설계 철학

### 하이브리드 접근법

3개 레퍼런스에서 **최적의 패턴만 차용**하되, OpenClaw Gateway 데몬 설치는 Phase 4로 연기한다.
Phase 3에서는 Agent 프로세스 내부에서 직접 도구를 실행한다.

| 출처 | 차용하는 것 | 차용하지 않는 것 |
|------|------------|----------------|
| **project-careti** (Cline fork) | ToolHandler 레지스트리, AutoApprovalSettings UI 패턴, requires_approval LLM 힌트, PreToolUse/PostToolUse 훅, .caretignore 패턴 | VS Code 의존, gRPC/protobuf, Plan/Act 모드 |
| **ref-opencode** | tree-sitter bash 파싱, BashArity 사전 (160+), 패턴 기반 권한(와일드카드), once/always/reject 3단계, Zod 스키마 검증, 둠 루프 감지, 출력 truncation | Bun 런타임, Solid.js TUI, SQLite 세션, MCP (Phase 4) |
| **ref-moltbot** (OpenClaw) | Gateway 프로토콜 참조 (Phase 4 대비), 설정 프리셋 구조 | Gateway 데몬 전체, 채널 시스템, 디바이스 인증, mDNS |

### 출처 추적 규칙 (머징 용이성)

모든 차용 코드에 **출처 주석**을 남긴다:

```typescript
// ORIGIN: ref-opencode/packages/opencode/src/permission/arity.ts
// PURPOSE: Command arity dictionary for "always allow" pattern scoping
// MODIFICATIONS: Removed Bun-specific imports, added naia-specific commands
```

파일 단위로 `ORIGIN` 헤더를 붙이고, 함수/클래스 단위 변경은 인라인 주석으로 표시.

---

## 2. 충돌 분석 (3개 시스템 하이브리드)

### 2.1 권한 모델 충돌

| 영역 | project-careti | ref-opencode | 해결 |
|------|---------------|-------------|------|
| **승인 단위** | 도구 타입별 토글 (readFiles, editFiles...) | 명령 패턴별 와일드카드 (`npm *`) | **2계층**: 도구 타입 토글(UI) → 패턴 매칭(세밀 제어) |
| **LLM 힌트** | `requires_approval` 파라미터 (LLM이 판단) | 없음 (규칙만으로 결정) | **병행**: LLM 힌트 + 규칙 평가. 둘 다 allow일 때만 자동 승인 |
| **"항상 허용"** | Yolo 모드 (전체 ON/OFF) | 패턴별 always (`npm install *`) | **OpenCode 방식 채택**. Yolo 모드는 "전체 always"의 숏컷으로만 |
| **거부 시** | 단순 거부 (빈 응답) | reject + 피드백 메시지 가능 | **OpenCode 방식 채택**. 거부 시 사용자 피드백을 LLM에 전달 |

**최종 권한 평가 흐름**:
```
1. 도구 타입 토글 확인 (Settings에서 OFF면 즉시 차단)
2. Tier 3 하드 블록 확인 (rm -rf /, sudo 등)
3. tree-sitter 명령 분석 (bash 도구만)
4. 패턴 룰셋 평가 (allow/deny/ask)
5. LLM requires_approval 힌트 참고
6. ask 결정 시 → Shell에 승인 요청
```

### 2.2 도구 정의 인터페이스 충돌

| project-careti | ref-opencode | 해결 |
|---------------|-------------|------|
| `IToolHandler { name, execute, getDescription }` | `Tool.Info { id, init → { description, parameters, execute } }` | **하이브리드**: Careti의 레지스트리 구조 + OpenCode의 Zod 파라미터 검증 |

```typescript
// 최종 인터페이스 (agent/src/tools/types.ts)
interface ToolDefinition {
  id: string;                              // from: opencode
  description: string;                     // from: opencode
  parameters: z.ZodType;                   // from: opencode (Zod)
  tier: PermissionTier;                    // from: naia agents-rules.json
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolRegistry {                    // from: careti (coordinator pattern)
  register(tool: ToolDefinition): void;
  get(id: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
}
```

### 2.3 프로토콜 충돌

| 현재 (Naia) | Careti | OpenCode | 해결 |
|---------------|--------|----------|------|
| stdio JSON lines (text, audio, usage, finish, error) | gRPC/protobuf | HTTP + SSE | **기존 stdio 확장**. 새 청크 타입 추가만 |

새 청크 타입 (하위 호환):
```typescript
| { type: "tool_use"; requestId: string; toolId: string; args: Record<string, unknown> }
| { type: "tool_result"; requestId: string; toolId: string; output: string; success: boolean }
| { type: "approval_request"; requestId: string; approvalId: string; toolId: string; description: string; tier: number }
| { type: "approval_response"; requestId: string; approvalId: string; decision: "once" | "always" | "reject"; message?: string }
```

### 2.4 보안 모델 충돌

| agents-rules.json (Tier 0-3) | Careti (safe/risky) | OpenCode (rule + pattern) | 해결 |
|------|------|------|------|
| 4단계 고정 계층 | LLM이 2단계 판단 | 규칙 기반 동적 | **3계층 결합**: Tier 하드코딩 → 패턴 룰셋 → LLM 힌트 |

### 2.5 배치되지 않는 영역 (안전하게 공존)

- **TTS/아바타**: Naia 전용 (다른 프로젝트에 해당 없음)
- **감정 표현**: Naia 전용
- **tree-sitter 파싱**: OpenCode 전용 (Careti에 없음, 충돌 없이 추가)
- **BashArity 사전**: OpenCode 전용 (독립적, 충돌 없음)
- **둠 루프 감지**: OpenCode 전용 (독립적, 추가만 하면 됨)

---

## 3. 구현 단계 (Sub-phase 분할)

개발 사이클: **PLAN → CHECK → BUILD → VERIFY → CLEAN → COMMIT** (매 sub-phase마다)

### Phase 3.1: 도구 프레임워크 + 프로토콜 확장

**목표**: Agent에 도구 레지스트리와 실행 프레임워크 구축. 도구 0개 상태에서 프레임워크만.

**새 파일**:
```
agent/src/tools/
├── types.ts              # ToolDefinition, ToolContext, ToolResult, PermissionTier
├── registry.ts           # ToolRegistry (register, get, list)
├── permission.ts         # PermissionEvaluator (tier check + pattern ruleset)
├── permission-rules.ts   # 기본 ruleset, blocked patterns (Tier 3)
└── __tests__/
    ├── registry.test.ts
    └── permission.test.ts
```

**수정 파일**:
```
agent/src/protocol.ts     # 새 청크 타입 추가 (tool_use, tool_result, approval_*)
agent/src/providers/types.ts  # StreamChunk에 tool_call 타입 추가
shell/src/lib/types.ts    # AgentResponseChunk에 tool 관련 타입 추가
```

**출처 매핑**:
| 파일 | 주 출처 | 보조 출처 |
|------|---------|----------|
| `types.ts` | opencode `tool.ts` | careti `ToolExecutorCoordinator.ts` |
| `registry.ts` | careti `ToolExecutorCoordinator.ts` | opencode `registry.ts` |
| `permission.ts` | opencode `next.ts` | naia `agents-rules.json` (Tier 0-3) |
| `permission-rules.ts` | naia (Tier 3 blocklist) | opencode (pattern format) |

**E2E 테스트** (agent/tests/integration/):
```
tool-framework.test.ts:
  - "도구 레지스트리에 등록 → 조회 가능"
  - "미등록 도구 호출 → 에러 반환"
  - "Tier 3 명령 → 즉시 차단, 실행 안 됨"
  - "프로토콜: tool_use 청크 → JSON 파싱 가능"
  - "프로토콜: approval_request → approval_response 왕복"
```

**완료 조건**: `pnpm --filter agent test` 통과. 도구 0개지만 프레임워크 동작.

---

### Phase 3.2: LLM Function Calling (Gemini 먼저)

**목표**: LLM이 도구를 호출할 수 있게. Gemini부터 시작, 이후 Claude/xAI 확장.

**수정 파일**:
```
agent/src/providers/gemini.ts     # function calling 지원 추가
agent/src/providers/anthropic.ts  # tool use 지원 추가
agent/src/providers/xai.ts        # function calling 지원 추가
agent/src/providers/types.ts      # StreamChunk에 tool_call 추가
agent/src/index.ts                # 도구 호출 루프 (LLM → tool → result → LLM)
```

**새 파일**:
```
agent/src/tools/tool-loop.ts      # 도구 실행 루프 (재귀적 LLM 호출)
agent/src/__tests__/tool-loop.test.ts
```

**출처 매핑**:
| 파일 | 주 출처 | 보조 출처 |
|------|---------|----------|
| `gemini.ts` 수정 | careti `gemini.ts` (function calling) | Google GenAI SDK docs |
| `anthropic.ts` 수정 | careti `anthropic.ts` (tool use) | Anthropic SDK docs |
| `xai.ts` 수정 | careti (OpenAI compatible) | OpenAI SDK docs |
| `tool-loop.ts` | opencode `processor.ts` (도구 루프) | careti `ToolExecutor.ts` |

**핵심 흐름**:
```
User → LLM(with tools) → tool_call 응답
  → Agent: tool_call 감지
  → Agent: 도구 실행 (permission check 포함)
  → Agent: 결과를 messages에 추가
  → Agent: LLM 재호출 (with tool result)
  → LLM: 최종 텍스트 응답
  → Agent → Shell: text + audio
```

**둠 루프 감지** (from opencode):
```typescript
// 같은 도구를 3회 연속 실패하면 → 사용자에게 "계속할까요?" 요청
// agent/src/tools/tool-loop.ts
const MAX_CONSECUTIVE_FAILURES = 3;
```

**E2E 테스트** (agent/tests/integration/):
```
function-calling.test.ts (msw로 LLM API mock):
  - "Gemini: tool_call 응답 → 도구 실행 → 결과로 재호출 → 최종 텍스트"
  - "Anthropic: tool_use 블록 → 동일 흐름"
  - "xAI: function_call → 동일 흐름"
  - "도구 결과 포함 재호출 시 올바른 메시지 형식"
  - "둠 루프: 3회 연속 실패 → approval_request 발생"
  - "취소: 도구 실행 중 cancel_stream → 중단"
```

**완료 조건**: mock LLM이 tool_call 반환 → dummy 도구 실행 → 재호출 → 최종 응답. 3개 프로바이더 모두.

---

### Phase 3.3: 기본 도구 구현 (5개)

**목표**: file_read, file_write, glob, grep, bash 5개 도구 구현.

**새 파일**:
```
agent/src/tools/handlers/
├── file-read.ts          # 파일 읽기 (Tier 0)
├── file-write.ts         # 파일 쓰기 (Tier 1)
├── glob.ts               # 파일 검색 (Tier 0)
├── grep.ts               # 내용 검색 (Tier 0)
├── bash.ts               # 명령 실행 (Tier 1-2, tree-sitter 분석)
└── __tests__/
    ├── file-read.test.ts
    ├── file-write.test.ts
    ├── glob.test.ts
    ├── grep.test.ts
    └── bash.test.ts
agent/src/tools/bash/
├── parser.ts             # tree-sitter bash 파싱
├── arity.ts              # BashArity 사전 (160+ 명령)
├── blocked.ts            # Tier 3 차단 패턴
└── __tests__/
    ├── parser.test.ts
    └── arity.test.ts
```

**새 의존성** (agent/package.json):
```json
{
  "dependencies": {
    "web-tree-sitter": "^0.24.0",
    "tree-sitter-bash": "^0.23.0",
    "zod": "^3.23.0"
  }
}
```

**출처 매핑**:
| 파일 | 주 출처 | 보조 출처 |
|------|---------|----------|
| `file-read.ts` | opencode `read.ts` | careti `ReadFileToolHandler` |
| `file-write.ts` | opencode `write.ts` | careti `WriteToFileToolHandler` |
| `glob.ts` | opencode `glob.ts` | Node.js fs.glob |
| `grep.ts` | opencode `grep.ts` | ripgrep child process |
| `bash.ts` | **opencode `bash.ts`** (핵심 참조) | careti `ExecuteCommandToolHandler` |
| `parser.ts` | opencode `bash.ts` (tree-sitter 부분) | — |
| `arity.ts` | **opencode `arity.ts`** (거의 그대로) | — |
| `blocked.ts` | naia `agents-rules.json` Tier 3 | — |

**보안 계층** (도구별):
| 도구 | 기본 Tier | tree-sitter | 패턴 룰셋 |
|------|----------|-------------|----------|
| `file_read` | 0 (자유) | N/A | 경로 패턴 (외부 디렉토리 ask) |
| `file_write` | 1 (알림) | N/A | 경로 패턴 |
| `glob` | 0 (자유) | N/A | — |
| `grep` | 0 (자유) | N/A | — |
| `bash` | 1-2 (동적) | **적용** | 명령 패턴 + 경로 패턴 |

**bash 도구 안전 검사 흐름** (opencode 패턴):
```
1. tree-sitter로 명령 파싱
2. 각 command 노드에서:
   a. Tier 3 차단 목록 확인 (rm -rf /, sudo, chmod 777 등)
   b. 경로 인수 추출 → 외부 디렉토리 접근 확인
   c. BashArity.prefix()로 "항상 허용" 범위 결정
3. 외부 디렉토리 접근 시 → approval_request (external_directory)
4. 명령 자체 → approval_request (bash, 패턴 포함)
5. 패턴 룰셋에서 allow 찾으면 → 자동 실행
6. ask이면 → Shell에 승인 요청
```

**E2E 테스트** (agent/tests/integration/):
```
tools-basic.test.ts:
  - "file_read: 존재하는 파일 → 내용 반환"
  - "file_read: 없는 파일 → 에러 메시지 (크래시 아님)"
  - "file_write: ~/tmp/test.md 생성 → 파일 존재 확인"
  - "file_write: /etc/passwd 쓰기 시도 → Tier 3 차단"
  - "glob: *.ts 패턴 → 매칭 파일 목록"
  - "grep: 패턴 검색 → 매칭 라인 + 파일 경로"
  - "bash: 'ls -la' → 출력 반환"
  - "bash: 'npm install' → approval_request 발생 (requires_approval)"
  - "bash: 'rm -rf /' → Tier 3 즉시 차단"
  - "bash: 'sudo anything' → Tier 3 즉시 차단"
  - "bash: tree-sitter가 외부 디렉토리 접근 감지 → approval_request"
  - "bash: timeout 초과 → 프로세스 종료 + 결과 반환"

tools-permission-pattern.test.ts:
  - "'npm install' always 허용 후 → 'npm run dev' 자동 허용 (npm * 패턴)"
  - "'git status' always 허용 → 'git diff' 자동 허용 (git * 패턴)"
  - "once 허용 → 같은 명령 다시 요청 시 다시 ask"
  - "reject → LLM에 거부 사유 전달"
  - "reject with message → LLM에 사용자 피드백 전달"
```

**완료 조건**: 5개 도구 모두 단위 + 통합 테스트 통과. tree-sitter bash 파싱 동작.

---

### Phase 3.4: Shell UI — 도구 표시 + 승인 모달

**목표**: 도구 실행 상태를 대화에 표시하고, 승인이 필요한 작업은 모달로 확인.

**새 파일**:
```
shell/src/components/ToolProgress.tsx     # "파일을 읽고 있어요..." 상태 표시
shell/src/components/PermissionModal.tsx  # 승인/거부 다이얼로그
shell/src/components/__tests__/
├── ToolProgress.test.tsx
└── PermissionModal.test.tsx
```

**수정 파일**:
```
shell/src/lib/types.ts              # AgentResponseChunk에 tool 타입 추가
shell/src/lib/config.ts             # ToolApprovalSettings 추가
shell/src/components/ChatPanel.tsx   # tool_use/tool_result/approval 핸들링
shell/src/stores/chat.ts            # pendingApprovals, toolExecutions 상태
shell/src-tauri/src/lib.rs          # approval_response 전달 명령
```

**출처 매핑**:
| 파일 | 주 출처 | 보조 출처 |
|------|---------|----------|
| `ToolProgress.tsx` | 원본 플랜 (Naia 자체 디자인) | — |
| `PermissionModal.tsx` | opencode `permission.tsx` (3버튼) | careti 승인 다이얼로그 |
| `config.ts` 수정 | careti `AutoApprovalSettings` | opencode 패턴 저장 |
| `chat.ts` 수정 | naia 기존 패턴 | — |

**PermissionModal 디자인** (opencode 3단계 + careti 알림):
```
┌─────────────────────────────────────┐
│  🔧 명령 실행 요청                    │
│                                     │
│  npm install express                │
│  ──────────────────────             │
│  위험도: ● 보통 (Tier 2)             │
│                                     │
│  [항상 허용]  [이번만 허용]  [거부]     │
│                                     │
│  ▸ 거부 시 피드백 입력 (선택)          │
└─────────────────────────────────────┘
```

- **항상 허용**: BashArity로 계산된 패턴 (`npm *`) 을 승인 룰셋에 추가
- **이번만 허용**: 이번 실행만 허용
- **거부**: 선택적으로 피드백 메시지 입력 → LLM에 전달

**ToolProgress 디자인**:
```
┌──────────────────────────┐
│ 🔍 파일을 확인하고 있어요...  │  ← Tier 0 (자동, 승인 불필요)
└──────────────────────────┘

┌──────────────────────────┐
│ ✅ 파일을 만들었어요         │  ← Tier 1 (알림)
│    ~/test.md              │
└──────────────────────────┘

┌──────────────────────────┐
│ ⏳ npm install 실행 중...   │  ← Tier 2 (승인 후)
│    [실시간 출력 스트리밍]     │
└──────────────────────────┘
```

**E2E 테스트** (shell/src/components/__tests__/):
```
ToolProgress.test.tsx:
  - "tool_use 청크 수신 → 진행 표시 렌더링"
  - "tool_result success → 완료 표시"
  - "tool_result failure → 에러 표시"

PermissionModal.test.tsx:
  - "approval_request 수신 → 모달 표시"
  - "'항상 허용' 클릭 → approval_response(always) 전송"
  - "'이번만 허용' 클릭 → approval_response(once) 전송"
  - "'거부' 클릭 → approval_response(reject) 전송"
  - "'거부' + 피드백 입력 → message 포함 전송"
  - "Tier별 위험도 색상 표시 (초록/노랑/빨강)"
```

**Shell E2E** (shell/tests/e2e/, mock agent):
```
tool-ui.spec.ts:
  - "메시지 전송 → tool_use 수신 → ToolProgress 표시 → tool_result → 결과 표시"
  - "approval_request → PermissionModal 표시 → 승인 → 도구 실행 → 결과"
  - "approval_request → 거부 → 거부 메시지 표시"
```

**완료 조건**: 모든 컴포넌트 테스트 + Shell E2E 통과. 실제 앱에서 도구 표시/승인 동작.

---

### Phase 3.5: 전체 통합 + Settings 도구 섹션

**목표**: Agent ↔ Shell 전체 연결, Settings에서 도구 설정 가능.

**수정 파일**:
```
shell/src/components/SettingsModal.tsx  # 도구 설정 섹션 추가
shell/src/lib/config.ts               # ToolSettings 타입 + 저장/로드
agent/src/index.ts                     # 도구 설정을 프로토콜로 수신
```

**Settings 새 섹션** (careti AutoApprovalSettings 참조):
```
[도구 설정]
☑ 파일 읽기 (자동)
☑ 파일 쓰기 (알림)
☑ 명령 실행 (승인 필요)
☐ 명령 실행 - 모두 자동 허용
☑ 파일 검색 (자동)
☐ 웹 검색 (기본 비활성)

[승인 기록]
  npm * — 항상 허용
  git * — 항상 허용
  [초기화]
```

**E2E 테스트** (전체 흐름):
```
full-flow.spec.ts (Shell E2E with mock agent):
  - "메시지 '이 폴더에 뭐가 있어?' → file_read 실행 → 결과 표시"
  - "메시지 '파일 만들어줘' → file_write → 알림 표시 → 결과"
  - "메시지 'npm install 해줘' → approval_request → 승인 → 실행 → 결과"
  - "메시지 'rm -rf / 해줘' → Tier 3 차단 → 거부 메시지"
  - "Settings에서 '명령 실행' OFF → bash 도구 비활성 → 도구 사용 안 됨"
  - "Settings에서 '모두 자동 허용' ON → approval 없이 실행"

full-flow-agent.test.ts (Agent 통합, msw mock):
  - "전체 round-trip: 사용자 메시지 → LLM(tool_call) → 도구 실행 → LLM(최종) → 텍스트 + TTS"
  - "다중 도구: LLM이 2개 도구 연속 호출 → 둘 다 실행 → 최종 응답"
  - "도구 + 감정: 도구 실행 후 LLM이 [HAPPY] 응답 → 감정 태그 파싱 정상"
```

**완료 조건**: 전체 E2E 통과. 실제 LLM (Gemini)과 연결하여 수동 검증 가능.

---

## 4. 파일 변경 전체 목록

### 새 파일 (18개)
```
agent/src/tools/types.ts
agent/src/tools/registry.ts
agent/src/tools/permission.ts
agent/src/tools/permission-rules.ts
agent/src/tools/tool-loop.ts
agent/src/tools/handlers/file-read.ts
agent/src/tools/handlers/file-write.ts
agent/src/tools/handlers/glob.ts
agent/src/tools/handlers/grep.ts
agent/src/tools/handlers/bash.ts
agent/src/tools/bash/parser.ts
agent/src/tools/bash/arity.ts
agent/src/tools/bash/blocked.ts
agent/src/tools/__tests__/  (각 파일별 테스트)
shell/src/components/ToolProgress.tsx
shell/src/components/PermissionModal.tsx
shell/src/components/__tests__/ToolProgress.test.tsx
shell/src/components/__tests__/PermissionModal.test.tsx
```

### 수정 파일 (10개)
```
agent/src/protocol.ts           # 새 청크 타입
agent/src/providers/types.ts    # StreamChunk 확장
agent/src/providers/gemini.ts   # function calling
agent/src/providers/anthropic.ts # tool use
agent/src/providers/xai.ts      # function calling
agent/src/index.ts              # 도구 루프 통합
agent/package.json              # 새 의존성 (zod, tree-sitter)
shell/src/lib/types.ts          # AgentResponseChunk 확장
shell/src/lib/config.ts         # ToolSettings
shell/src/components/ChatPanel.tsx  # 도구 청크 핸들링
shell/src/stores/chat.ts        # 도구 상태
shell/src/components/SettingsModal.tsx  # 도구 설정 섹션
shell/src-tauri/src/lib.rs      # approval_response 명령
```

---

## 5. 의존성 추가

### agent/package.json
```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "web-tree-sitter": "^0.24.0",
    "tree-sitter-bash": "^0.23.0"
  }
}
```

### shell/package.json
변경 없음 (기존 React + Tauri로 충분)

---

## 6. 보안 프리셋

### Tier 3 차단 목록 (agent/src/tools/bash/blocked.ts)
```typescript
// ORIGIN: naia agents-rules.json + additional patterns
const TIER3_BLOCKED = [
  /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+|.*)\//,  // rm -rf /
  /\bsudo\b/,                                      // sudo anything
  /\bchmod\s+777\b/,                               // chmod 777
  /\bchown\s+root\b/,                              // chown root
  /\bmkfs\b/,                                       // mkfs (format disk)
  /\bdd\s+.*of=\/dev\//,                           // dd to device
  /\bcurl\s+.*\|\s*bash\b/,                        // curl | bash
  /\bwget\s+.*\|\s*bash\b/,                        // wget | bash
  />\s*\/etc\//,                                     // redirect to /etc/
  />\s*\/boot\//,                                    // redirect to /boot/
  /\bsystemctl\s+(disable|mask|stop)\b/,           // systemctl disable/mask/stop
];
```

이 목록은 tree-sitter 파싱 **전에** 문자열 매칭으로 빠르게 검사.
tree-sitter는 파싱 성공한 명령에 대해 더 정밀한 분석 수행.

---

## 7. 머징 전략 (향후 업스트림 추적)

### ref-opencode → naia-os
```
가져온 것:
  - arity.ts → agent/src/tools/bash/arity.ts (거의 그대로, ORIGIN 주석)
  - bash.ts tree-sitter 패턴 → agent/src/tools/bash/parser.ts (추출 + 단순화)
  - next.ts 패턴 매칭 → agent/src/tools/permission.ts (Wildcard.match 로직)
  - tool.ts 인터페이스 → agent/src/tools/types.ts (Zod 파라미터 부분)

동기화 방법:
  cd ref-opencode && git fetch origin && git merge origin/main
  # 변경 확인:
  git diff HEAD~1 -- packages/opencode/src/permission/arity.ts
  git diff HEAD~1 -- packages/opencode/src/tool/bash.ts
  git diff HEAD~1 -- packages/opencode/src/permission/next.ts
```

### ref-moltbot → naia-os (Phase 4 대비)
```
아직 가져온 것 없음.
Phase 4에서 가져올 것:
  - gateway/protocol/schema/ → gateway 프로토콜 타입
  - gateway/client.ts → gateway 클라이언트 패턴
  - config/types.gateway.ts → gateway 설정 구조

동기화 방법:
  cd ref-moltbot && git fetch origin && git merge origin/main
```

### project-careti → naia-os
```
가져온 것:
  - AutoApprovalSettings 구조 → shell/src/lib/config.ts (ToolSettings)
  - ToolExecutorCoordinator 패턴 → agent/src/tools/registry.ts (레지스트리)
  - ExecuteCommandToolHandler 승인 흐름 → agent/src/tools/handlers/bash.ts (참조)
  - requires_approval 파라미터 → agent 시스템 프롬프트 (tool description)

동기화 방법:
  cd project-careti && git fetch origin
  # 관련 변경 확인:
  git diff HEAD~1 -- src/core/task/tools/
  git diff HEAD~1 -- src/shared/AutoApprovalSettings.ts
```

---

## 8. 구현 순서 + 예상 커밋

| # | Sub-phase | 브랜치 | 커밋 메시지 |
|---|-----------|--------|------------|
| 1 | 3.1 도구 프레임워크 | `feature/phase3-tool-framework` | `feat(agent): add tool registry and permission framework` |
| 2 | 3.2 Function Calling | `feature/phase3-function-calling` | `feat(agent): add LLM function calling support` |
| 3 | 3.3 기본 도구 5개 | `feature/phase3-basic-tools` | `feat(agent): implement file, glob, grep, bash tools` |
| 4 | 3.4 Shell UI | `feature/phase3-tool-ui` | `feat(shell): add ToolProgress and PermissionModal` |
| 5 | 3.5 전체 통합 | `feature/phase3-integration` | `feat: integrate tool system end-to-end` |

각 sub-phase는 독립적으로 테스트 가능하며, 이전 phase에 의존.

---

## 9. 수동 E2E 검증 체크리스트

Phase 3 전체 완료 후 수동 검증:

```
[ ] "이 폴더에 뭐가 있어?" → glob 실행 → 파일 목록 표시
[ ] "package.json 읽어줘" → file_read → 내용 표시
[ ] "test.md 파일 만들어줘" → file_write → ToolProgress 알림 → 파일 생성
[ ] "TODO가 있는 파일 찾아줘" → grep → 검색 결과 표시
[ ] "npm install 해줘" → PermissionModal → 승인 → 실행 → 결과
[ ] "npm install 해줘" (두 번째) → "항상 허용" 했으면 자동 실행
[ ] "rm -rf / 해줘" → Tier 3 즉시 차단 → Alpha가 거부 메시지
[ ] "sudo apt install something" → Tier 3 차단
[ ] Settings에서 도구 ON/OFF → 반영 확인
[ ] Settings에서 "항상 허용" 기록 확인 + 초기화
[ ] Avatar 감정이 도구 실행 중/완료 후 자연스럽게 변화
[ ] TTS가 도구 결과 설명 시 정상 동작
```
