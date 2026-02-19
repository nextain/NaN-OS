# UI E2E: OpenClaw 72/72 RPC 100% 커버리지 계획

## 날짜
- 시작: 2026-02-19
- 상태: **계획 수립 완료, 구현 대기**

## 프로젝트
`cafelua-os` — Shell E2E (Tauri WebdriverIO)

## 배경

Gateway 통합 테스트(Agent ↔ Gateway)는 72/72 RPC 메서드 100% 커버 완료 (work-log `20260219-03`).
하지만 **UI E2E** (Shell → Agent → Gateway → UI 반영)는 기존 37개 spec 중 **7개 RPC만 부분 커버 (~10%)**.

## 목표

**72/72 Gateway RPC 메서드를 실제 UI에서 검증** — 기존 37개 수정 + 신규 16개 = **53개 spec**

---

## Phase 1: 셀렉터 수정 (CRITICAL)

### 파일: `shell/e2e-tauri/helpers/selectors.ts`

DiagnosticsTab이 7번째 탭으로 추가되어 기존 `settingsTabBtn`이 잘못된 탭을 가리킴.

탭 순서 (ChatPanel.tsx L610-665):
1. chat, 2. history, 3. progress, 4. skills, 5. channels, 6. agents, **7. diagnostics** (NEW), **8. settings**

```typescript
// 수정
settingsTabBtn: ".chat-tab:nth-child(8)",  // 7→8

// 추가
diagnosticsTabBtn: ".chat-tab:nth-child(7)",
diagnosticsTabPanel: '[data-testid="diagnostics-tab"]',
diagnosticsStatusGrid: ".diagnostics-status-grid",
diagnosticsStatusItem: ".diagnostics-status-item",
diagnosticsStatusOk: ".diagnostics-value.status-ok",
diagnosticsRefreshBtn: ".diagnostics-refresh-btn",
diagnosticsLogBtn: ".diagnostics-log-btn",
diagnosticsMethodTag: ".diagnostics-method-tag",
diagnosticsLogsContainer: ".diagnostics-logs-container",

// Agent file management
agentFilesBtn: ".agent-files-btn",
agentFileItem: ".agent-file-item",
agentFileTextarea: ".agent-file-textarea",
agentFileSaveBtn: ".agent-file-save-btn",

// Session actions
sessionCompactBtn: ".session-action-btn.compact",
sessionDeleteBtn: ".session-action-btn.delete",
sessionCardLabel: ".session-card-label",

// Device pairing
deviceNodeCard: ".device-node-card",
devicePairApprove: ".device-pair-approve",
devicePairReject: ".device-pair-reject",
```

---

## Phase 2: 기존 Stub Spec 재작성 (4개)

### 29-cron-gateway.spec.ts
- **현재**: `setValue` + `pause(5000)` + 최소 assertion
- **수정**: `sendMessage("skill_cron 도구의 gateway_list 액션으로 게이트웨이 크론 잡 목록 보여줘")` + `waitForToolSuccess()` + 크론 관련 텍스트 확인
- **커버 RPC**: `cron.list`

### 30-exec-approvals.spec.ts
- **현재**: `typeof exists === "boolean"` (항상 true)
- **수정**: `autoApprovePermissions()` + chat에서 Tier 2 도구 호출 유도 → tool activity 확인
- **커버 RPC**: `exec.approvals.get`

### 31-diagnostics.spec.ts
- **현재**: Chat에서 "시스템 상태 확인해줘" → `pause(5000)`
- **수정**: DiagnosticsTab 직접 테스트
  1. `diagnosticsTabBtn` 클릭 → `diagnosticsTabPanel` 대기
  2. `diagnosticsStatusGrid` 내 `.status-ok` 또는 `.status-err` 존재 확인
  3. `.diagnostics-method-tag` 개수 > 0 (Gateway 메서드 목록)
  4. refresh 버튼 클릭 → 재로드 확인
  5. logs start/stop 버튼 존재 확인
- **커버 RPC**: `status`, `logs.tail` (start/stop)

### 34-device-pairing.spec.ts
- **현재**: Chat에서 "연결된 디바이스 목록 보여줘" → `pause(5000)`
- **수정**: Settings 탭 → DevicePairingSection 직접 테스트
  1. Settings 탭 이동
  2. `.device-nodes-list` 로드 확인 (빈 목록 또는 실제 노드)
  3. `.device-pair-requests` 영역 확인
- **커버 RPC**: `node.list`, `node.pair.list`

---

## Phase 3: Partial Spec 강화 (5개)

### 23-channels-status.spec.ts
- 로딩 완료 대기 (`.channels-loading` 사라짐)
- `[data-testid="channel-card"]` 개수 확인 또는 빈 상태 메시지
- `[data-testid="channel-status"]` 존재 확인
- `.channels-refresh-btn` 클릭 → 리로드
- **커버 RPC**: `channels.status` (강화)

### 24-tts-providers.spec.ts
- TTS provider select 옵션 개수 확인
- 옵션 값이 유효한 provider ID인지 확인
- **커버 RPC**: `tts.providers` (강화)

### 26-sessions-management.spec.ts
- 로딩 완료 대기
- `[data-testid="session-card"]` 개수 확인
- 세션 카드에 label/message count 표시 확인
- compact/delete 버튼 존재 확인
- **커버 RPC**: `sessions.list` (강화), `sessions.delete`, `sessions.compact` (UI 버튼)

### 27-multi-agent.spec.ts
- 에이전트 카드에 `.agent-card-name` 텍스트 확인
- 에이전트 있으면 → `.agent-files-btn` 클릭 → 파일 목록 로드
- 파일 있으면 → 클릭 → textarea에 내용 표시
- **커버 RPC**: `agents.list` (강화), `agents.files.list`, `agents.files.get`

### 28-skills-install.spec.ts
- Gateway 스킬 카드 존재 시 → 스킬 이름 텍스트 확인
- eligible/ineligible 상태 배지 확인
- install 버튼 클릭 가능 상태 확인
- **커버 RPC**: `skills.status` (강화)

---

## Phase 4: 신규 Spec 추가 (16개)

### 37-execute-command.spec.ts
- `sendMessage("echo hello를 실행해줘. execute_command 도구를 사용해.")` → `waitForToolSuccess()`
- 응답에 "hello" 포함 확인
- **커버 RPC**: `exec.bash`

### 38-file-operations.spec.ts
- write_file: `/tmp/cafelua-e2e-test.txt`에 "test content" 작성 요청
- read_file: 같은 파일 읽기 요청 → "test content" 확인
- search_files: `/tmp`에서 "cafelua-e2e" 검색 요청
- apply_diff: 파일 내용 수정 요청
- **커버 RPC**: `exec.bash` (read_file/write_file/search_files/apply_diff 모두 exec.bash 경유)

### 39-web-tools.spec.ts
- `sendMessage("anthropic.com 웹페이지를 browser 도구로 읽어줘")` → `waitForToolSuccess()`
- 응답에 페이지 내용 관련 텍스트 확인
- **커버 RPC**: `skills.invoke` (browser skill), `browser.request` (fallback)

### 40-sessions-spawn.spec.ts
- `sendMessage("서브 에이전트를 생성해서 '현재 시각 확인' 작업을 위임해줘. sessions_spawn 도구를 사용해.")` → `waitForToolSuccess()`
- 서브 에이전트 결과 텍스트 확인
- **커버 RPC**: `sessions.spawn`, `agent.wait`, `sessions.transcript`
- **주의**: Gateway가 3개 메서드 모두 지원해야 함. 미지원 시 graceful skip.

### 41-agents-crud.spec.ts
- chat: "test-e2e-agent 이름으로 새 에이전트를 만들어줘. skill_agents 도구의 create 액션을 사용해."
- chat: "test-e2e-agent 에이전트의 설명을 'E2E test agent'로 수정해줘. skill_agents의 update 액션."
- UI: AgentsTab에서 agent 카드 확인 + 파일 버튼 → files.list
- chat: "test-e2e-agent 에이전트에 test.md 파일을 만들어줘. skill_agents files_set."
- chat: "test-e2e-agent 에이전트를 삭제해줘. skill_agents delete."
- **커버 RPC**: `agents.create`, `agents.update`, `agents.delete`, `agents.files.set`

### 42-sessions-crud.spec.ts
- chat: "현재 세션 목록에서 가장 오래된 세션의 미리보기를 보여줘. skill_sessions preview."
- chat: "가장 오래된 세션을 압축해줘. skill_sessions compact." (또는 UI 버튼)
- chat: "테스트 세션을 리셋해줘. skill_sessions reset."
- chat: "세션 라벨을 변경해줘. skill_sessions patch."
- **커버 RPC**: `sessions.preview`, `sessions.patch`, `sessions.reset`, `sessions.delete` (UI), `sessions.compact` (UI)

### 43-device-management.spec.ts
- chat: "내 노드 상세 정보를 보여줘. skill_device node_describe." → 노드 있으면 결과, 없으면 빈 결과
- chat: "페어링 요청을 보내줘. skill_device pair_request." → 에러 또는 성공
- chat: "디바이스 페어링 목록을 보여줘. skill_device device_list."
- chat: "디바이스 토큰을 교체해줘. skill_device token_rotate." → graceful error
- **커버 RPC**: `node.describe`, `node.rename`, `node.pair.request`, `node.pair.verify`, `device.pair.list`, `device.pair.approve`, `device.pair.reject`, `device.token.rotate`, `device.token.revoke`, `node.invoke` (error path)
- **주의**: 대부분 빈 결과 또는 graceful error 확인. "호출 + 응답 존재" 수준 커버리지.

### 44-diagnostics-full.spec.ts
- chat: "게이트웨이 health 체크해줘. skill_diagnostics health." → 정상/비정상 응답
- chat: "사용량 통계 보여줘. skill_diagnostics usage_status."
- chat: "비용 정보 보여줘. skill_diagnostics usage_cost."
- **커버 RPC**: `health`, `usage.status`, `usage.cost`
- (spec 31에서 `status`, `logs.tail` 커버)

### 45-cron-gateway-full.spec.ts
- chat: "게이트웨이 크론 상태 확인해줘. skill_cron gateway_status."
- chat: "게이트웨이에 'test-e2e' 크론잡을 매시간 실행으로 추가해줘. skill_cron gateway_add."
- chat: "게이트웨이 크론잡 실행 기록 보여줘. skill_cron gateway_runs."
- chat: "test-e2e 크론잡을 수동 실행해줘. skill_cron gateway_run."
- chat: "test-e2e 크론잡을 삭제해줘. skill_cron gateway_remove."
- **커버 RPC**: `cron.status`, `cron.add`, `cron.runs`, `cron.run`, `cron.remove`
- (spec 29에서 `cron.list` 커버)

### 46-channels-operations.spec.ts
- ChannelsTab: 채널 있으면 → logout 버튼 클릭 시도 (또는 chat으로)
- chat: "채널 로그아웃해줘. skill_channels logout." → 채널 없으면 graceful error
- chat: "웹 로그인 시작해줘. skill_channels login_start." → QR 코드 없으면 graceful error
- **커버 RPC**: `channels.logout`, `web.login.start`, `web.login.wait` (error path)

### 47-tts-full.spec.ts
- chat: "TTS 상태 확인해줘. skill_tts status."
- chat: "TTS를 활성화해줘. skill_tts enable."
- chat: "TTS 프로바이더를 edge로 변경해줘. skill_tts set_provider."
- chat: "안녕하세요를 TTS로 변환해줘. skill_tts convert."
- chat: "TTS를 비활성화해줘. skill_tts disable."
- **커버 RPC**: `tts.status`, `tts.enable`, `tts.setProvider`, `tts.convert`, `tts.disable`

### 48-voicewake-set.spec.ts
- chat: "음성 깨우기 트리거를 '알파야'로 설정해줘. skill_voicewake set."
- 응답에서 설정 완료 확인
- chat: "음성 깨우기 트리거 확인해줘. skill_voicewake get."
- **커버 RPC**: `voicewake.set` (spec 25에서 `voicewake.get` 커버)

### 49-approvals-full.spec.ts
- chat: "실행 승인 규칙을 설정해줘. skill_approvals set_rules."
- chat: "승인 대기 중인 항목을 resolve해줘. skill_approvals resolve." → pending 없으면 graceful error
- **커버 RPC**: `exec.approvals.set`, `exec.approvals.resolve` (error path)
- (spec 30에서 `exec.approvals.get` 커버)

### 50-config-management.spec.ts
- chat: "게이트웨이 설정을 보여줘. skill_config get."
- chat: "설정 스키마를 보여줘. skill_config schema."
- chat: "사용 가능한 모델 목록을 보여줘. skill_config models."
- chat: "게이트웨이 설정을 패치해줘. skill_config patch."
- chat: "게이트웨이 설정을 변경해줘. skill_config set." (안전한 값으로)
- **커버 RPC**: `config.get`, `config.set`, `config.schema`, `models.list`, `config.patch`

### 51-skills-advanced.spec.ts
- chat: "게이트웨이에 설치 가능한 바이너리 목록 보여줘. skill_skill_manager gateway_status."
- chat: "누락된 스킬 의존성을 설치해줘. skill_skill_manager install."
- chat: "스킬 설정을 업데이트해줘. skill_skill_manager update_config."
- **커버 RPC**: `skills.status` (via gateway_status), `skills.bins` (응답에 포함), `skills.install`, `skills.update`

### 52-wizard-rpc.spec.ts
- chat: "게이트웨이 위저드 상태를 확인해줘. wizard.status RPC를 직접 호출해."
- chat: "위저드를 시작하고 즉시 취소해줘. wizard.start 후 wizard.cancel."
- **커버 RPC**: `wizard.status`, `wizard.start`, `wizard.cancel`, `wizard.next` (error path — 비활성 위저드에서 next)
- **주의**: skill이 없으므로 LLM이 직접 RPC를 호출하지 못할 수 있음. 대안: agent에 `skill_wizard` 추가 또는 DiagnosticsTab에서 wizard 상태 표시.

---

## Phase 5: 검증

```bash
# 1. TypeScript 컴파일 확인
cd shell && pnpm exec tsc --noEmit

# 2. Gateway 실행 확인
lsof -ti:18789

# 3. Tauri 바이너리 확인
ls -la shell/src-tauri/target/debug/cafelua-shell

# 4. E2E 전체 실행
cd shell && pnpm run test:e2e:tauri

# 5. 특정 spec만 (디버깅)
cd shell && pnpm exec wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/37-execute-command.spec.ts
```

---

## 72/72 RPC 전수 체크 매트릭스

| # | RPC 메서드 | 도메인 | 커버 Spec | 테스트 방식 |
|---|-----------|--------|----------|-----------|
| 1 | `agents.list` | agents | 27 (강화) | UI 탭 |
| 2 | `agents.create` | agents | **41 (신규)** | 채팅 |
| 3 | `agents.update` | agents | **41 (신규)** | 채팅 |
| 4 | `agents.delete` | agents | **41 (신규)** | 채팅 |
| 5 | `agents.files.list` | agents | 27 (강화) | UI 탭 |
| 6 | `agents.files.get` | agents | 27 (강화) | UI 탭 |
| 7 | `agents.files.set` | agents | **41 (신규)** | 채팅 |
| 8 | `exec.approvals.get` | approvals | 30 (재작성) | 채팅 |
| 9 | `exec.approvals.set` | approvals | **49 (신규)** | 채팅 |
| 10 | `exec.approvals.resolve` | approvals | **49 (신규)** | 에러 패스 |
| 11 | `channels.status` | channels | 23 (강화) | UI 탭 |
| 12 | `channels.logout` | channels | **46 (신규)** | UI/채팅 |
| 13 | `web.login.start` | channels | **46 (신규)** | 에러 패스 |
| 14 | `web.login.wait` | channels | **46 (신규)** | 에러 패스 |
| 15 | `config.get` | config | **50 (신규)** | 채팅 |
| 16 | `config.set` | config | **50 (신규)** | 채팅 |
| 17 | `config.schema` | config | **50 (신규)** | 채팅 |
| 18 | `models.list` | config | **50 (신규)** | 채팅 |
| 19 | `config.patch` | config | **50 (신규)** | 채팅 |
| 20 | `cron.list` | cron | 29 (재작성) | 채팅 |
| 21 | `cron.status` | cron | **45 (신규)** | 채팅 |
| 22 | `cron.add` | cron | **45 (신규)** | 채팅 |
| 23 | `cron.remove` | cron | **45 (신규)** | 채팅 |
| 24 | `cron.run` | cron | **45 (신규)** | 채팅 |
| 25 | `cron.runs` | cron | **45 (신규)** | 채팅 |
| 26 | `node.list` | device | 34 (재작성) | UI Settings |
| 27 | `device.pair.list` | device | **43 (신규)** | 채팅 |
| 28 | `node.describe` | device | **43 (신규)** | 채팅 |
| 29 | `node.rename` | device | **43 (신규)** | 채팅 |
| 30 | `node.pair.request` | device | **43 (신규)** | 에러 패스 |
| 31 | `node.pair.list` | device | 34 (재작성) | UI Settings |
| 32 | `node.pair.approve` | device | 34 (재작성) | UI 버튼 |
| 33 | `node.pair.reject` | device | 34 (재작성) | UI 버튼 |
| 34 | `node.pair.verify` | device | **43 (신규)** | 에러 패스 |
| 35 | `device.pair.approve` | device | **43 (신규)** | 에러 패스 |
| 36 | `device.pair.reject` | device | **43 (신규)** | 에러 패스 |
| 37 | `device.token.rotate` | device | **43 (신규)** | 에러 패스 |
| 38 | `device.token.revoke` | device | **43 (신규)** | 에러 패스 |
| 39 | `health` | diagnostics | **44 (신규)** | 채팅 |
| 40 | `usage.status` | diagnostics | **44 (신규)** | 채팅 |
| 41 | `usage.cost` | diagnostics | **44 (신규)** | 채팅 |
| 42 | `status` | diagnostics | 31 (재작성) | UI 탭 |
| 43 | `logs.tail` (start) | diagnostics | 31 (재작성) | UI 버튼 |
| 44 | `logs.tail` (stop) | diagnostics | 31 (재작성) | UI 버튼 |
| 45 | `sessions.list` | sessions | 26 (강화) | UI 탭 |
| 46 | `sessions.delete` | sessions | 26 (강화) / **42** | UI 버튼 |
| 47 | `sessions.compact` | sessions | 26 (강화) / **42** | UI 버튼 |
| 48 | `sessions.preview` | sessions | **42 (신규)** | 채팅 |
| 49 | `sessions.patch` | sessions | **42 (신규)** | 채팅 |
| 50 | `sessions.reset` | sessions | **42 (신규)** | 채팅 |
| 51 | `sessions.spawn` | sessions | **40 (신규)** | 채팅 |
| 52 | `agent.wait` | sessions | **40 (신규)** | 채팅 |
| 53 | `sessions.transcript` | sessions | **40 (신규)** | 채팅 |
| 54 | `skills.status` | skills | 28 (강화) | UI 탭 |
| 55 | `skills.bins` | skills | **51 (신규)** | 채팅 |
| 56 | `skills.install` | skills | **51 (신규)** | 채팅 |
| 57 | `skills.update` | skills | **51 (신규)** | 채팅 |
| 58 | `tts.status` | tts | **47 (신규)** | 채팅 |
| 59 | `tts.providers` | tts | 24 (강화) | UI Settings |
| 60 | `tts.setProvider` | tts | **47 (신규)** | 채팅 |
| 61 | `tts.convert` | tts | **47 (신규)** | 채팅 |
| 62 | `tts.enable` | tts | **47 (신규)** | 채팅 |
| 63 | `tts.disable` | tts | **47 (신규)** | 채팅 |
| 64 | `voicewake.get` | voicewake | 25 (기존) | UI Settings |
| 65 | `voicewake.set` | voicewake | **48 (신규)** | 채팅 |
| 66 | `wizard.start` | wizard | **52 (신규)** | 채팅/특수 |
| 67 | `wizard.next` | wizard | **52 (신규)** | 에러 패스 |
| 68 | `wizard.cancel` | wizard | **52 (신규)** | 채팅/특수 |
| 69 | `wizard.status` | wizard | **52 (신규)** | 채팅/특수 |
| 70 | `exec.bash` | tool-bridge | **37 (신규)** + 38 | 채팅 (execute_command) |
| 71 | `node.invoke` | tool-bridge | **43 (신규)** | 에러 패스 (노드 없음) |
| 72 | `browser.request` | tool-bridge | **39 (신규)** | 채팅 (browser 도구) |

### skills.invoke (보너스)
`skills.invoke`는 72개 카운트에 별도 포함되지 않지만 spec 12 (기존) + spec 39 (신규)에서 커버.

---

## 커버리지 품질 분류

| 품질 | 메서드 수 | 비율 | 설명 |
|------|---------|------|------|
| **FULL** (성공 결과 검증) | 42 | 58% | UI 직접 조작 또는 채팅에서 결과 확인 |
| **CALL** (호출 + 응답 존재) | 18 | 25% | 채팅에서 스킬 호출, 응답 텍스트 존재 확인 |
| **ERROR PATH** (graceful error) | 12 | 17% | 외부 의존성 없어 에러 반환, crash 없음 확인 |
| **합계** | **72** | **100%** | |

---

## 알려진 제한사항

1. **wizard RPC**: `skill_wizard`가 없어 LLM이 직접 호출 불가. 대안: (a) agent에 skill_wizard 추가 또는 (b) DiagnosticsTab에 wizard 상태 표시 추가
2. **node.invoke**: 페어링된 온라인 노드 없으면 에러 패스만 테스트 가능
3. **web.login.start/wait**: QR 코드 스캔 없이는 성공 플로우 불가
4. **exec.approvals.resolve**: pending approval 생성 타이밍 제어 어려움
5. **채팅 기반 테스트 신뢰성**: LLM이 정확한 skill+action을 호출하지 않을 수 있음. 프롬프트에 도구명+액션명을 명시적으로 포함하여 최대한 유도.

---

## 실행 순서

```
1. selectors.ts 수정 (settingsTabBtn 8번째, DiagnosticsTab + Device 셀렉터 추가)
2. Stub specs 재작성 (29, 30, 31, 34)
3. Partial specs 강화 (23, 24, 26, 27, 28)
4. 신규 specs 작성 (37-52, 총 16개)
5. TypeScript 컴파일 확인
6. Gateway 실행 후 E2E 전체 실행
7. 실패 spec 수정 → 재실행
8. 커밋
```

## 선행 작업 (wizard 문제)

spec 52 (wizard) 구현 전에 결정 필요:
- **Option A**: `skill_wizard` 신규 생성 (agent에 추가, 4개 액션)
- **Option B**: DiagnosticsTab에서 wizard.status 호출 추가
- **Option C**: wizard는 integration test에서만 커버하고 E2E에서 제외 (68/72 = 94%)
