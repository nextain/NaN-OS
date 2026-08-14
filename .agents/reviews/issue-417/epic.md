## 목표

Herdr를 Naia Shell Workspace 안에 직접 통합한다. 왼쪽 탐색은 **File Tree → Spaces → Agents**, 오른쪽은 기존 Herdr terminal/tab/pane 작업면을 그대로 사용한다.

## 사용자 경험

- Space 선택: 대응하는 Herdr workspace를 focus하고 오른쪽에 기존 Herdr 작업면 표시
- Agent 선택: 해당 agent를 소유한 workspace/tab/pane/terminal로 focus
- Herdr 내부 focus 변경: 왼쪽 Spaces/Agents 선택에 역동기화
- 터미널 파일 경로 선택: File Tree 활성화 → 경로 expand/reveal/select → viewer line/column 열기
- viewer Back/닫기: 직전 Herdr pane과 terminal focus 복원
- File Tree root: 활성 Space의 worktree/CWD를 따름

Shell은 Herdr 0.8의 공개 snapshot 및 workspace/agent focus API를 사용한다. 이 버전에는 공개 event stream과 absolute pane focus API가 없으므로, 단일-flight polling과 stale-response 폐기로 focus를 역동기화하고 viewer 전환 중에도 같은 Herdr terminal/pane을 mounted 상태로 보존한다. Shell 전용 `HERDR_CONFIG_PATH`로 embedded client의 중복 sidebar만 숨기며 사용자 전역 설정은 변경하지 않는다. 오른쪽 Herdr UI를 재구현하거나 private TUI socket/raw PTY stdin을 제어 API로 사용하지 않는다.

## 단계

- [ ] P1: unified rail + embedded Herdr + 양방향 focus/lifecycle bridge
- [ ] P2: terminal path → FileTree/viewer → Herdr focus return
- [ ] P3: Naia observation/control/context bridge
- [ ] P4: L3 Naia → L2 issue leader → L1 workers orchestration

## 보존/정리 원칙

기존 PTY, FileTree, viewer, Quick Open, document AI action, worktree/session 회귀 테스트와 E2E 자산을 먼저 보존한다. 중복 Shell session/agent UI와 lifecycle tool은 Herdr 대체 경로의 동등성과 통합 증거가 확보된 뒤 active render/registration에서 단계적으로 retire한다. 테스트 삭제나 축소된 suite는 완료 증거가 아니다.

관련: #227, #317, closed history #115, nextain/naia-agent#107

정본 상세: `docs/progress/issue-417-herdr-workspace.md`
