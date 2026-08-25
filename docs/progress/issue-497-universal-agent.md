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

### 아직 사람이 정해야 하는 충돌

`NFR-HERDR-SOT`(이 저장소)는 "Herdr 가 L2 이슈 리더와 L1 작업자의 실행 정본"이라고 말한다.
naia-agent `origin/main` 에는 `herdr` 문자열이 **한 번도 나오지 않는다**. 실제 구현은 subagent
어댑터와 worktree 로 작업자를 돌린다. 두 문서가 이슈 오케스트레이션의 소유자를 서로 다르게
지정하고 있고, 어느 쪽이 정본인지는 코드로 결정할 수 없다.

이 충돌이 풀리기 전에는 #500 의 "L2 이슈 리더 = Herdr" 전제를 어느 저장소에서도 구현하지 않는다.

### 스스로 정정한 것

- 처음에는 "뇌가 Herdr 소켓에 직접 의도를 보내면 된다"고 제안했다. 틀렸다. E3 가 문제 삼는 것은
  전송 경로가 아니라 계약의 모양이다. 소켓으로 90개 메서드를 부르는 것도 의도 계약이 아니다.
- 처음에는 #501 을 "절반 위반"이라고 했다. 과했다. 대부분 환경이고, 인지에 해당하는 의도 기반
  선택은 현재 어느 진입점도 주제를 선언하지 않아 비어 있다.
- 처음에는 naia-agent 에 이슈 리더가 "없다"고 했다. 108커밋 뒤진 체크아웃을 본 탓이다.
