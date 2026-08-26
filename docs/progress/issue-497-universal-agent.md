# Issue 497 — 워크스페이스를 아는 3계층 범용 에이전트

Date: 2026-08-26
Base: `7bd24008` (`v0.2.2` 동결 시점)
Status: 계약 확정 단계. 자식 이슈는 P01~P03을 마친 순서대로 구현에 들어간다.

## 목표

Naia를 대화 상대에서, ADK 워크스페이스 루트에서 실행한 Codex나 Claude처럼 일할 수 있는
범용 에이전트로 확장한다. 사용자가 "이거 고쳐줘"라고 말하면 Naia가 워크스페이스 규칙을 스스로
읽고, 이슈를 붙이고, 실행을 Herdr에 위임하고, 결과를 증거와 함께 보고하는 것이 완성 상태다.

## #417과의 경계

이 에픽은 #417을 대체하지 않는다. 두 이슈의 소유 범위는 다음과 같이 갈린다.

| 범위 | 소유 이슈 | 정본 문서 |
|---|---|---|
| Workspace 통합 자체 — P1 통합 레일과 embedded Herdr, 양방향 focus/lifecycle bridge | #417 | `docs/progress/issue-417-herdr-workspace.md` |
| P2 terminal path와 FileTree/viewer 왕복 | #417 | 같은 문서 |
| P3 typed Naia observation/control/context bridge의 실행 | #497 (#502) | 이 문서 |
| P4 L3→L2→L1 orchestration의 실행 | #497 (#500) | 이 문서 |

NFR-HERDR-SOT는 같은 생명주기를 두 주체가 소유하는 것을 금지한다. 그 금지는 코드뿐 아니라
이슈 트래커에도 적용한다. 두 에픽은 서로의 단계를 완료로 표시하지 않으며, #417의 P3·P4
체크박스는 이 에픽의 인수 결과로만 채워진다.

#434는 #502가 승계한다. #502가 수용될 때까지 #434를 열어 두되, 구현은 #502에서만 진행한다.

## 계층 정의와 소유 불변식

- L3 Naia — 사용자 의도, 대화, 워크스페이스 컨텍스트, 이슈 포트폴리오, 채널 연속성을 소유한다.
- L2 Herdr 이슈 리더 — 이슈 범위의 계획, 작업자 감독, 세션·pane·터미널 실행 정본을 소유한다.
- L1 작업자 — Codex, Claude, OpenCode, 경계가 정해진 셸 작업이 구현과 검증을 수행한다.

불변식은 네 가지다.

1. 실행 생명주기의 정본은 항상 Herdr 하나다. Shell도 코딩 작업자도 같은 생명주기를 두 번 소유하지 않는다.
2. raw PTY stdin과 private TUI socket은 제어 프로토콜이 아니다. 제어는 타입이 선언된 표면으로만 한다.
3. 작업자는 자기 권한을 넓히지 못하고 이슈 완료를 스스로 선언하지 못한다. 완료 판정은 L2가 증거를 모아 L3에 올린다.
4. 컨텍스트는 권한이 아니다. 부모 워크스페이스나 다른 프로젝트의 문서를 읽었다는 사실이 그 범위에 대한 작업 권한이 되지 않는다.

## 권한 등급 계약

환경 도구와 작업자 위임은 다음 등급을 분리해서 다룬다. 낮은 등급의 허가가 높은 등급을 상속하지 않는다.

| 등급 | 예 | 승인 |
|---|---|---|
| 관측 | 파일·프로세스 상태 조회, 페이지 스냅샷, 터미널 출력 읽기 | 불필요 |
| 워크스페이스 내부 변경 | 선언된 소유 경로 안의 파일 편집, 테스트 실행 | 세션 범위 승인 |
| 자격증명 사용 | 저장된 키·토큰으로 외부 API 호출 | 건별 승인 |
| 외부 발신 | 메시지 전송, 게시, 구매 | 건별 승인, 일반 편집 권한에서 상속 불가 |
| 파괴적·운영 변경 | 삭제, 운영 환경 변경 | 사람 결정, 위임 대상 아님 |

위임 위험도 등급(low·medium·high)은 워크스페이스 terminology 정의를 따른다. high는 작업자에게
내리지 않고 사람 결정으로 올린다.

## 인터페이스 계약 원칙

자식 이슈가 정의하는 모든 제어 표면은 다음을 공통으로 만족한다.

- 타입이 선언된 자원과 도구로 노출하고, 스키마 버전을 명시한다.
- 스냅샷에 단조 증가하는 revision을 싣고, 변경 요청은 expected revision을 받는다. 어긋나면 조용히 덮어쓰지 않고 타입 있는 충돌을 반환한다.
- 변경 요청은 request id와 idempotency key를 받는다. 같은 키의 재전송이 프로세스나 명령을 중복 생성하지 않는다.
- 모든 변경은 영향을 받은 자원 id와 증거 참조(출력·로그·산출물)를 돌려준다.
- 연결 끊김, 타임아웃, 프로세스 종료, 취소, 부분 완료는 서로 구별되는 결과로 남는다. 하나로 뭉뚱그리지 않는다.
- 비밀값과 범위 밖 데이터는 컨텍스트 전달에서 제외한다.

## 자식 이슈와 식별자 배정

| 이슈 | 범위 | UC 접두 | 요구사항 접두 |
|---|---|---|---|
| #501 | 워크스페이스 컨텍스트 해석 | `UC-WORKSPACE-CONTEXT-*` | `FR-WORKSPACE-CONTEXT.*` |
| #502 | Herdr 제어면 | `UC-HERDR-CONTROL-*` | `FR-HERDR-CONTROL.*` |
| #499 | 브라우저·터미널 환경 도구 | `UC-ENV-TOOL-*` | `FR-ENV-TOOL.*` |
| #500 | 이슈 리더와 코딩 작업자 | `UC-ORCHESTRATION-*` | `FR-ORCHESTRATION.*` |
| #503 | 채널 중립 세션 | `UC-CHANNEL-SESSION-*` | `FR-CHANNEL-SESSION.*` |
| #498 | 검증·벤치마크 하네스 | (형제 UC를 실행) | `NFR-AGENT-BENCH.*` |

## 개발 사슬

워크스페이스 표준 사슬과 이 저장소의 P01~P05 게이트는 같은 것이다.

계약 → UC(P01) → UC 테스트(P02) → FE 기능 명세(P03) → FE 테스트(P04) → 구현 → 검증(P05)

여기서 FE는 기능(FEature) 명세를 뜻한다. 프론트엔드가 아니다.

이 문서가 계약 단계의 산출물이다. 자식 이슈는 자기 UC와 요구사항 항목이 존재하기 전에는
구현을 시작하지 않는다.

## 완료 판정 규칙

자식 이슈는 자기 주장으로 완료되지 않는다. #498의 하네스가 해당 UC 시나리오를 실제로 밟아
기대 결과를 확인한 것이 완료 판정이다. 목 데이터만으로 얻은 통과는 native Herdr, 실제 브라우저,
실제 코딩 작업자 게이트를 대신하지 못한다. 테스트를 지우거나 범위를 줄인 suite는 완료 증거가 아니다.

## 2026-08-26 경계 적대리뷰 — naia-shell 과 naia-agent

루크 지적으로 이 에픽이 뇌·몸·환경 경계를 지키는지 다시 봤다. 정본은
`docs/brain-body-environment.md` 이고 분류 테스트는 세 줄이다. 결정하는가면 뇌(naia-agent),
에이전트 자신의 감각·표현 기관이면 몸(셸), 에이전트가 그 안에서 작업하는 세계면 환경(셸 소유 서비스).

### 맞게 놓인 것

| 자식 | 근거 |
|---|---|
| #499 브라우저·터미널 도구 | 정본 기능 매핑 표가 브라우저·터미널을 환경으로, 셸 소유로 명시한다. agent 쪽 `agent-browser-skills.ts` 가 외부 CLI 를 직접 부르는 것은 그 표에 이미 위반으로 표시돼 있다 — 셸 쪽 구현이 목표 상태다. |
| #501 워크스페이스 컨텍스트 | 환경(workspace·파일)이다. naia-agent 의 동명 도메인은 cwd 와 프로젝트 이름만 쓰는 프롬프트 한 줄 합성이고, 자기 주석에 "상세는 read_file 도구 몫"이라고 적어 상세 읽기를 도구로 미룬다. 진입점·필수 인덱스 해석이 그 도구다. |
| #502 Herdr 제어면 | Herdr 는 터미널 워크스페이스 관리자 = 환경. E2 는 환경 런타임을 뇌 트리에 두는 것을 금지한다. 셸 소유가 맞다. |

### 잘못 놓인 것 — 이미 naia-agent 에 있다

`naia-agent` `origin/main` 실측(2026-08-26). 이 저장소의 체크아웃이 108커밋 뒤라 처음에는
"없다"고 잘못 판단했다. 최신 기준으로 다시 보면 다음이 이미 존재한다.

| 이 에픽이 naia-shell 에 만든 것 | naia-agent 에 이미 있는 것 |
|---|---|
| `WorkerRole` 구현자·검증자·리뷰어·조사자 | `issue-team.ts` `ISSUE_TEAM_ROLES` explorer·implementer·tester·reviewer |
| `WorkerProvider` codex·claude·opencode·shell | `IssueTeamAgentKind` + `ActorBinding`, `subagent-codex.ts`·`subagent-claude-code.ts`·`subagent-opencode-cli.ts` |
| `classify` 대화 대 이슈 | `issue-orchestration.ts` `IssueClassification` |
| 작업자 생명주기 상태 | `IssueState`·`IssueTerminalState`·`CodingJobState`·`DurableRunState` |
| `DelegationBrief` 와 예산 | `orchestration.ts` `TaskSpec`·`GatewayBillingReceipt`·`CostEvidence` |
| `acceptReport` 완료 선언 무시 | `WorkerResult`·`IssueVerification`·`IssueReport`·`ActorReceipt` |
| `ownedPaths`·`pathsOverlap` | `IssueTeamFilesystemAccess` + `fs-sandbox.ts` `SandboxPolicy`·`validatePath` |
| `ChannelKind` desktop·voice·discord | `multi-issue-session.ts` `SessionSourceKind` local·discord·**shell**·other |
| `SessionIdentity` 와 세션 상태 | `ManagedIssueSession`·`ManagedSessionState`·`MultiIssuePortfolio` |
| `stanceAfterRestart` | `durable-supervisor.ts` `DurableSupervisorSnapshot` |

`SessionSourceKind` 가 셸을 *출처*로 모델링한다는 점이 특히 분명하다. naia-agent 가 조율자이고
셸은 채널 하나다. #500 과 #503 을 naia-shell 에 둔 것은 그 구조를 뒤집는다.

**결정**: #500 과 #503 은 naia-shell 에서 더 진행하지 않는다. 지금 코드는 지우지 않고 이식 대상으로
남긴다 — 검증된 규칙과 테스트를 버리는 비용이 더 크고, 이식은 어차피 한 번 해야 한다.

### 충돌 해소 — Herdr 에는 이슈 개념이 없다

앞서 이 자리에 "NFR-HERDR-SOT 와 naia-agent#107 이 이슈 오케스트레이션 소유자를 다르게 지정하므로
사람이 정해야 한다"고 적었다. 그것은 틀렸다. 정할 것이 아니라 한쪽이 범주 오류였다.

프로토콜 19 의 90개 메서드를 네임스페이스로 세면 pane 29, agent 12, plugin 11, workspace 9,
tab 7, server 5, worktree 4, layout 3 이고 나머지는 소수다. `issue`·`task`·`plan`·`verify`·
`review`·`assign`·`budget`·`approve` 는 **전부 0건**이다. Herdr 는 무엇을 보여 주고 어디에 배치할지만
알고, 무엇을 할지·누구에게 맡길지·끝났는지 판정하는 개념을 가진 적이 없다.

따라서 `NFR-HERDR-SOT` 는 두 문장을 붙여 놓은 것이다. "터미널·pane·session 실행 정본"은 맞고,
"L2 이슈 리더"는 성립하지 않는다. 이 요구사항은 뒷부분만 남기고 앞부분을 걷어내야 한다.

### 스스로 정정한 것

- 처음에는 "뇌가 Herdr 소켓에 직접 의도를 보내면 된다"고 제안했다. 틀렸다. E3 가 문제 삼는 것은
  전송 경로가 아니라 계약의 모양이다. 소켓으로 90개 메서드를 부르는 것도 의도 계약이 아니다.
- 처음에는 #501 을 "절반 위반"이라고 했다. 과했다. 대부분 환경이고, 인지에 해당하는 의도 기반
  선택은 현재 어느 진입점도 주제를 선언하지 않아 비어 있다.
- 처음에는 naia-agent 에 이슈 리더가 "없다"고 했다. 108커밋 뒤진 체크아웃을 본 탓이다.

## 2026-08-26 루크 결정 — 계층 배치

루크가 이 에픽의 계층 배치를 확정했다. 아래가 결정 내용이고, 그 뒤에 근거로 확인된 사실을 붙인다.

### 결정

1. **naia-agent 가 뇌이며 사실상 naia 의 백엔드다.** naia-shell 은 그 클라이언트이자 환경 호스트다.
2. **정보의 취합과 결정은 naia-agent 에서 한다.** 셸은 원시 능력과 표현을 제공하고 조립하지 않는다.
3. **오케스트레이션 레이어는 naia-agent 다.**
4. **Herdr 는 UI 이므로 사이드카 이상이 될 수 없다.** 환경 서비스이지 결정 주체가 아니다.
5. **naia-agent 는 셸을 통해 Herdr 를 외부 환경으로 부른다.** 셸이 Herdr 를 관측해 올리고,
   agent 가 그것을 취합해 결정하고, 결정은 의도로 내려와 셸이 Herdr 에 실행한다.

### 결정을 뒷받침하는 실측

- Herdr 프로토콜 19 에 이슈·계획·검증·배정·예산·승인 개념이 0건이다(위 절 참조). 결정 주체가 될 수 없다.
- Herdr 서버는 `~/.config/herdr/herdr.sock` 의 사용자 전역 데몬이고 셸 없이도 살아 있다.
  즉 셸을 경유하는 이유는 프로세스 소유권이 아니라 **계약의 모양**이다. 90개 메서드를 뇌에 그대로
  노출하면 의도가 아니라 원격 조종이고, 기질이 바뀔 때 뇌가 터미널 멀티플렉서 어휘에 오염된다.
- naia-agent `domain/chat.ts` 가 이미 강제한다 — "persona/profile/workspaceContext 는 클라 주입
  **금지**(코어 SoT) — environmentSegments **만** 클라 제공". 화이트리스트는
  `avatarEmotion | app | responseStyle` 뿐이고 그 밖의 kind 는 코어가 버린다. 자유 텍스트로
  workspace 를 위조 주입하는 경로를 API 차원에서 막은 것이다.
- naia-agent `domain/chat.ts` 의 출처 union 에 `{ kind: "shell" }` 과 `{ kind: "discord" }` 가 있다.
  백엔드가 이미 셸을 채널 하나로 모델링하고 있다.

### 배치 결론 (파일 단위)

| 대상 | 어디 | 이유 |
|---|---|---|
| 파일 읽기·경계·권한 거부 (F2 관측 포트, `workspace-context-observe`) | naia-shell | 원시 환경 능력 |
| Herdr 관측·조작 어댑터와 프로토콜 대조 (#502) | naia-shell | 환경 서비스 접점, 90개 메서드를 여기서 흡수 |
| 브라우저·터미널 원시 도구 (#499) | naia-shell | 정본 기능 매핑 표가 환경·셸 소유로 명시 |
| 컨텍스트 앱 UI | naia-shell | 사용자가 보는 표현 |
| 진입점 해석·필수 인덱스 판정·의도 기반 선택·근거 추적·개정 무효화 (#501 도메인) | **naia-agent** | 취합과 결정. 코어가 클라 주입을 금지한 대상 |
| 이슈 분류·리더·작업자 배치·검증·완료 판정 (#500) | **naia-agent** | 이미 `issue-orchestration.ts`·`issue-team.ts` 등으로 존재 |
| 채널 중립 세션 정체성 (#503) | **naia-agent** | 이미 `multi-issue-session.ts` 의 `SessionSourceKind` 가 셸을 출처로 모델링 |

### 뇌↔환경 접점

올라가는 길은 `EnvironmentSegment` 화이트리스트를 따른다 — 자유 텍스트가 아니라 kind 별 구조화 값.
터미널 환경 상태를 올리려면 새 kind 를 코어에 추가해야 하고, 그 추가는 naia-agent 쪽 변경이다.
내려오는 길은 의도다. 셸은 그 의도를 Herdr 메서드로 번역한다. 뇌는 "어떻게"를 모른다.

### 이 에픽에 남는 것

#502 와 #499 만 naia-shell 에서 계속한다. #500·#501·#503 은 이식 대상으로 보존하고 여기서 멈춘다.
#502 의 성격도 "오케스트레이션 제어면"이 아니라 "환경 관측·조작면"으로 다시 읽는다.

## 2026-08-26 슬라이스 1 전달 경계 (계약)

번역기가 실제로 내는 환경 호출은 여섯 가지다. 셸의 Rust 표면을 실측하니 셋은 이미 열려 있고
셋이 없다. 그리고 그 경계가 우연이 아니다 — **이미 열린 셋은 전부 구조화 전달이고, 없는 셋은
전부 터미널 입력이다.**

| 환경 호출 | 전달 | Rust 명령 | 상태 |
|---|---|---|---|
| `session.snapshot` | 구조화 | `herdr_snapshot` | 있음 |
| `agent.focus` | 구조화 | `herdr_focus_agent` | 있음 |
| `agent.prompt` | 구조화 | `herdr_prompt_agent` | 있음 (12KB 상한·id 검증) |
| `pane.focus` | 구조화 | — | **없음** |
| `pane.send_text` | 터미널 입력 | — | **없음** |
| `pane.send_keys` | 터미널 입력 | — | **없음** |

### 결정

1. 이 슬라이스는 위 세 가지만 연다. 프로토콜 19 의 나머지 84개는 열지 않는다. 여는 근거는
   "번역기가 실제로 그 호출을 낸다"이며, 근거 없는 확장은 하지 않는다.
2. `pane.focus` 는 구조화 전달이라 기존 `agent.focus` 와 같은 등급으로 다룬다.
3. `pane.send_text` 와 `pane.send_keys` 는 사용자의 터미널에 직접 입력한다. 이 슬라이스에서
   가장 위험한 표면이며, 별도 권한 등급으로 취급한다.

### 감추지 않는 한계

Rust 명령은 식별자 형식과 길이만 검증한다. 어떤 의도가 허용됐는지는 core 의 의도 계층이
판정하며, 웹뷰 코드가 Tauri 명령을 직접 부르면 그 판정을 건너뛴다. 이것은 기존
`herdr_prompt_agent` 도 같은 구조다(검증만 있고 게이팅은 TS 쪽). 이 슬라이스는 그 관행을
따르되 사실을 적어 둔다 — Rust 계층 자체의 능력 게이팅은 후속이다.

## 2026-08-26 e2e-tauri 실행 전제조건 (실측 기록)

Rust 를 건드리면 P04 가 실 백엔드 검증을 요구한다. 이 머신에서 그것을 처음 돌리며 막힌 지점들이다.
문서에 없어서 매번 다시 알아내야 하는 것들이라 남긴다.

1. **짝 naia-agent 체크아웃이 정확한 경로·이름이어야 한다.**
   `packages/shell/agent-pairing.json` 의 커밋을, `<naia-shell>/naia-agent-worktrees/shell-pair-<short>`
   에 깨끗한 워크트리로 두어야 한다. 이름이 다르면 `wdio.conf.ts` 가 "paired naia-agent checkout is
   unavailable" 로 죽는다. 만드는 법:
   `git -C <naia-agent> worktree add --detach <naia-shell>/naia-agent-worktrees/shell-pair-<short> <commit>`
2. **짝 체크아웃의 형제 의존성도 있어야 한다.** 그 커밋의 `package.json` 이
   `file:../naia-kb-compiler` 와 `file:../naia-memory` 를 참조하므로 `naia-agent-worktrees/` 안에
   두 이름의 심링크가 필요하다. 없으면 `pnpm --ignore-workspace install` 이 ENOENT 로 죽고,
   빌드 스크립트는 그것을 "dependency install failed" 로만 보고한다.
3. **cargo 단위 테스트도 짝 정보를 요구한다.** `NAIA_AGENT_SCRIPT` 와 `NAIA_AGENT_PROTO_DIR` 를
   짝 체크아웃 안쪽으로 지정해야 하고, proto 디렉터리는 **git 체크아웃 안**이어야 한다
   (임시 디렉터리에 파일만 복사하면 "path must be inside a git checkout" 로 죽는다).
4. **이 머신에는 Xvfb 가 없다.** 저장소 문서는 `xvfb-run pnpm test:e2e:tauri` 를 안내하지만
   `xorg-x11-server-Xvfb` 가 설치돼 있지 않다. 실제 디스플레이(`DISPLAY=:0`)로 돌리면 창이 뜬다.
   헤드리스가 필요하면 패키지 설치가 선행돼야 하며 그것은 사람 결정이다.
5. **`packages/shell/src-tauri/target-e2e/` 가 gitignore 되어 있지 않다.** e2e 빌드가 만드는 큰
   디렉터리가 매번 untracked 로 남아 작업 트리가 깨끗하지 않게 된다. 기존 갭이며 이 슬라이스가
   만든 것이 아니다.

### e2e-tauri 실행 결과 (2026-08-26) — 부분 증명

새 Rust 명령 두 개는 실 백엔드에서 **한 번 응답을 받아 냈다**. 그 실행에서 15개 단언 중 8개가
통과했고, 통과한 8개가 곧 이 슬라이스가 증명하려던 것이다.

- `herdr_run_pane` 과 `herdr_send_keys` 가 등록돼 있다 — 미등록 오류가 아니라 인자 검증 오류가 온다 (FR-ENV-DISPATCH.7)
- 식별자 형식 검증이 실제로 산다 — 빈 값·접두사 없음·워크스페이스 부분 없음·구분자 주입·과길이 다섯 가지를 Rust 가 거절한다 (FR-ENV-DISPATCH.4)

나머지 7개(본문·키 검증, 미개방 명령)는 그 실행에서 webview 의 origin 이 흔들려 실패했고,
이후 재실행에서는 Vite 개발 서버가 아예 뜨지 않아 세션 자체가 만들어지지 않았다.
**이것은 이 변경의 결함이 아니라 이 머신의 e2e 하네스 불안정이다.** 근거:

- 같은 바이너리·같은 스펙으로 실행마다 결과가 다르다.
- 실패 문구가 `webview never reached an http origin with writable localStorage` 와
  `Origin header is not a valid URL` 로, 둘 다 wdio.conf 자신이 주석에 적어 둔 알려진 취약점이다.
- Xvfb 가 없어 실제 디스플레이로 돌려야 하고, `browser.refresh()` 는 wdio.conf 주석대로 세션을 끊는다.

동일한 검증이 Rust 단위 테스트로는 결정론적으로 통과한다(`cargo test --lib herdr::api`, 4/4).
즉 검증 자체는 살아 있고, 그것을 **실 백엔드에서** 반복 확인하는 경로가 이 환경에서 불안정하다.

따라서 #502 P04 는 in_progress 로 남긴다. 완료로 표시하지 않는다.

## 2026-08-26 분리 이력과 wire 게이트 갭

루크 질문("왜 분리됐지")을 계기로 두 저장소의 이력을 확인했다.

**분리 시점은 2026-06-08이다.** 두 저장소가 같은 날 같은 템플릿에서 각각 스캐폴드됐다
(`chore: scaffold new-naia-os from naia-template-project (main fdbd3f2)` /
`chore: scaffold new-naia-agent from ...`). 그 전에는 뇌가 `old-naia-os/agent/` 하위
디렉터리로 살았고, 헥사고날 재작성 때 자기 저장소로 뽑혀 나왔다. 6월 10일 커밋이 셸의
`tauri.conf.json` 에서 구 레이아웃 번들(`../../agent/{dist,package.json,node_modules}`)을 지우고
`NAIA_AGENT_SCRIPT` 런타임 spawn 으로 바꾼 것이 그 흔적이다.

**분리 근거는 두 가지로 기록돼 있다.** 하나는 루크의 교차개발 앵커 원칙
(`naia-agent/docs/progress/99.dev-comm/agent-vertical-anchor-2026-06-10.md`) — "os 와 agent 는 같은
UC 시나리오의 두 반쪽이고 둘을 잇는 H-agent 경계 = wire 계약"이며, 그 wire 를 양방향 probe 로
게이트해 "agent 가 자유롭게 재설계해도 경계 계약은 불변"이게 한다. 다른 하나는
substrate-agnostic(`docs/brain-body-environment.md` §5) — 뇌가 특정 몸에 오염되면 포팅이 깨진다.

### 발견한 갭

그 근거였던 `scripts/builds/uc1-outbound-probe.mjs` 와 `uc1-variant-probe.mjs` 는 **옛 baseline
(old-naia-os) 대조용**이다. 이 머신에서 실행하면 SKIP 된다(2026-08-26 확인 — "Old-Baseline 부재").
즉 **오늘의 셸↔뇌 형태를 막아 주는 게이트가 없다.** 분리의 정당성이 wire 게이트였는데 그 게이트가
이식 시점에 멈춰 있었다.

### 닫은 방법

두 저장소가 같은 표본(`src/test/fixtures/environment-surfaces-wire.json`)을 들고 각자 자기 쪽을
검증한다. 셸은 그 표본을 실제로 산출하는지(`toEnvironmentSegment`), 뇌는 그 표본을 유실 없이
받아 렌더하는지 확인한다. 그리고 상대 저장소가 옆에 있으면 표본이 같은지도 대조하며, **찾지 못하면
건너뛰지 않고 실패한다** — 건너뛴 게이트는 게이트가 아니다.

이것은 uc1 probe 를 대체하지 않는다. 그 probe 들이 지키던 것(전체 union 동기)은 여전히 멈춰 있고,
여기서 닫은 것은 이번 슬라이스가 쓰는 한 kind 의 형태뿐이다. 나머지는 후속 과제다.

## wire 어휘 동기 게이트 (2026-08-26)

분리 이력 조사에서 드러난 갭을 닫았다. 두 저장소를 잇기로 한 probe 들이 옛 baseline 대조라
SKIP 되는 동안 실제로 하나가 깨져 있었고(#113, 8주), 그 결함을 별칭으로 때우면 *다음* 이름
변경을 또 놓친다. 그래서 별칭을 걷어내고 어휘 자체를 게이트로 만들었다.

방식은 표를 적어 두는 것이 아니다. 양쪽이 자기 코드에서 어휘를 뽑는다 — 뇌는 `encodeEmit`
본문과 `EnvironmentSegment` union 소스에서, 셸은 수용 상수에서. 뽑은 것을 공유 표본
`src/test/fixtures/wire-union.json` 두 벌과 대조하고, 그 두 벌이 바이트 단위로 같은지도 본다.
짝 저장소를 못 찾으면 건너뛰지 않고 실패한다. 손으로 적은 표와 코드가 어긋나도 깨진다.

게이트를 만들면서 곧바로 비대칭 하나가 잡혔다. 셸은 `environmentSurfaces` 세그먼트를
만들면서도 자기 코어 union 에는 그 kind 가 없었다 — 그 세그먼트를 `ChatRequest.environmentSegments`
로 실어 보낼 타입 경로가 없었다는 뜻이다. union 에 추가하고, 좁은 산출 타입이 거기 대입
가능한지를 컴파일 시점 단언으로 묶었다. 같은 자리에서 rename 잔재도 하나 나왔다: 일괄 치환이
뇌 디코더의 별칭 절을 `kind === "app" || kind === "app"` 이라는 동어반복으로 만들고 주석을
"app→app 리팩터"라는 말이 안 되는 문장으로 바꿔 놓았다.

반증 검사로 게이트가 실제로 깨지는지 확인했다. 못 깨지는 게이트는 거짓 봉인이다.

| 변이 | 뇌 | 셸 |
|---|---|---|
| 뇌가 kind 이름 변경(avatarEmotion→avatarMood) | 3건 실패 | 통과(자기 코드 불변) |
| 뇌가 송신 종류 이름 변경(finish→finish_v2) | 2건 실패 | 통과 |
| 셸이 수용 목록에서 하나 제거 | 통과 | 2건 실패 |
| #113 재현(디코더만 옛 이름) | 2건 실패 | 통과 |

kind 이름이 갈라지면 양쪽이 깨지고, 한쪽만의 결함은 그쪽이 깨진다. 의도한 배분이다.

검증: 셸 코어 812/812 GREEN(exit 0), tsc 통과, 워크스페이스 빌드 성공, 뇌 1746 통과
(기존 실패 25건 불변 — 이번 슬라이스로 늘지 않았다). 셸 앱 스위트의 실패 12건은 전부
`packages/shell/scripts/__tests__/stage-voxcpm2-runtime.test.ts` 의 릴리스 아티팩트 해시
불일치로, 이 브랜치의 어느 커밋도 그 경로를 건드리지 않았다.

남은 것: 셸이 *보내는* 요청 18종 중 stdio 디코더가 받는 것은 5종뿐이고 나머지는 gRPC 경로다.
그 축은 전송이 섞여 있어 이번 게이트에 넣지 않았다. 닫으려면 두 전송의 수용 지점을 각각
열거해야 한다.

## #502 실배선 (2026-08-26)

계약·UC·FE·테스트와 Rust 명령 경계까지 다 있었는데 프로덕션 호출자가 0이었다.
`observe`·`toEnvironmentSegment`·`EnvironmentDispatcher` 모두 테스트만 붙은 섬이었다.
이번에 그 섬들을 이었다.

이음매는 `app/control/environment-session.ts` 다. 셸이 I/O(스냅샷 가져오기·명령 보내기)를
소유하고, 이 객체는 판정만 한다. 위로는 대화 요청에 `environmentSurfaces` 세그먼트를 얹고,
아래로는 의도를 받아 수용 판정 → 번역 → 전달까지 간다.

뇌가 표면을 조작하는 경로는 앱 도구(`skill_environment`)로 잡았다. BGM 이 이미 쓰는
검증된 길이고(E1 — naia-agent 무변경), 셸이 도구를 등록하고 호출을 받아 실행한다.
뇌는 손잡이로만 말하고 그것이 어느 pane 인지는 셸만 안다.

### 배선하면서 드러난 결함 — 손잡이 재사용

`mintRegistry` 는 손잡이를 **순서**로 발행한다. 한 스냅샷 안에서만 쓰면 문제가 없지만,
뇌가 목록을 본 시점과 그중 하나에 명령을 넣는 시점 사이에는 시간이 흐른다. 그 사이 터미널이
하나 닫히면 같은 손잡이가 *다른* 표면을 가리킨다. 뇌는 자기가 본 그 표면이라고 믿고
엉뚱한 터미널에 명령을 넣게 된다.

계약 리뷰가 못 잡는 종류다. 두 함수 각각은 옳고, 이어 붙였을 때만 틀린다.

`SurfaceRegistrar` 로 닫았다. 손잡이를 표면에 못 박고, 표면이 사라지면 그 손잡이는
되살아나지 않는다. 재사용하지 않으므로 나중에 온 죽은 손잡이는 조용히 다른 곳을 가리키는
대신 `unknown-surface` 로 거절된다. 반증 검사로 확인했다 — 순서 발행으로 되돌리면
고정 관련 테스트 3건이 즉시 깨진다.

### 셋째 사본

셸 UI 의 `packages/shell/src/lib/types.ts` 에도 `EnvironmentSegment` 사본이 있었고,
거기에는 `environmentSurfaces` 가 없어 조립이 타입에서 막혔다. 코어 union 만 맞추면
조용히 갈라질 자리라 union 게이트를 이 세 번째 사본까지 넓혔다.

### 터미널 입력 권한

터미널 입력은 사용자가 직접 타이핑하는 것과 같은 일이라 구조화 전달과 같은 권한으로
내보내지 않는다. `environmentTerminalInput` 설정이 켜진 경우에만 나가고, 기본값은 꺼짐이며,
꺼져 있으면 거절 사유가 그대로 뇌에 올라간다. 실 UI 테스트에서 꺼짐/켜짐을 짝으로 확인해
거절이 권한 때문임을 증명했다 — 다른 이유로 막힌 것을 권한으로 오해하지 않기 위해서다.

검증: 코어 828/828 GREEN(exit 0), tsc 0, 빌드 성공, 셸 앱 1697 통과,
실 UI Playwright `environment-skill.spec.ts` 5/5 GREEN(등록·상승·전달·권한 게이트 양방향).

### e2e-tauri 가 왜 안 돌았나 — IPv4/IPv6 불일치

실 Rust 경계 검증은 여러 세션에 걸쳐 막혀 있었다. 증상은 매번 달라 보였다 —
"webview never reached an http origin", "#root still not displayed",
"Origin header is not a valid URL". 전부 같은 뿌리였다.

앱이 실제로 무엇을 보고 있는지 실패 메시지에 실어 보니 `about:blank`, origin=null 이었다.
Tauri IPC 는 origin 을 보므로 그 상태에서는 모든 호출이 거절된다. 앱이 프런트를 아예
불러오지 못한 것이다.

두 가지가 어긋나 있었다. 첫째, wdio 설정은 Vite 를 1420 에 띄우는데 e2e 바이너리의
devUrl 은 `tauri.e2e.conf.json` 의 **1422** 였다. 둘째 — 그리고 이게 진짜 원인인데 —
Vite 는 기본으로 `[::1]`(IPv6) 에만 바인드하고 devUrl 은 `127.0.0.1`(IPv4) 이다.
포트를 맞춰도 앱은 붙지 못한다.

`ss -lntp` 로 실제 바인드 주소를 보고 확정했다. 포트 열림 확인(`waitForPort`)은 localhost 로
붙어 통과하고, 앱만 IPv4 로 붙어 실패하는 구조라 하네스는 자기가 정상인 줄 알았다.

고친 방식: 주소를 상수로 적지 않고 `tauri.e2e.conf.json` 의 devUrl 에서 호스트와 포트를
읽어 Vite 를 그 주소에 띄운다. 정본이 하나라 다시 갈라지지 않는다.

이 슬라이스와 무관한 `01-app-launch.spec.ts` 도 같은 이유로 실패하고 있었고, 같은 수정으로
함께 살아났다 — 즉 막고 있던 것은 #502 가 아니라 하네스였다.

검증: `environment-dispatch.spec.ts` 16/16 GREEN(exit 0), `01-app-launch.spec.ts` 2/2 GREEN(exit 0).
스펙 쪽도 두 곳 고쳤다. `#root` 표시를 기다리던 것을 http origin 도달로 바꾸고(이 스펙이
보는 것은 UI 가 아니라 Rust 경계다), 웹뷰 위치를 결과에 실어 다음에 막힐 때 다시 파헤치지
않게 했다.
