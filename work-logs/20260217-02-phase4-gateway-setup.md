# Cafelua OS Phase 4: Always-on Daemon

- **시작일**: 2026-02-17
- **상태**: 🟡 진행 중
- **프로젝트**: cafelua-os
- **담당**: luke + Claude

---

## 현재 상태 요약

| 단계 | 내용 | 상태 |
|---|---|---|
| 4.0 | OpenClaw Gateway 로컬 설정 | 🟡 진행 중 |
| 4.1 | Phase 3 E2E 검증 (8개 도구 런타임) | ✅ 자동 검증 완료 (25 passed), 수동 검증 대기 |
| 4.2 | 사용자 테스트 (수동) | 🔲 대기 |
| 4.3 | Skills 시스템 | 🔲 대기 |
| 4.4 | 메모리 시스템 | 🔲 대기 |
| 4.5 | 외부 채널 (Discord/Telegram) | 🔲 대기 |
| 4.6 | systemd 자동시작 통합 | 🔲 대기 |

### 재개 체크포인트 (중단 복구용)

- **현재 브랜치/상태**: `main`, Phase 4 코드는 **미커밋 작업 중**
- **최근 확인 완료**:
  - `agent` 테스트 통과 (`pnpm test`, 권한 상승 환경)
  - GatewayClient v3 핸드셰이크 + live e2e 테스트 파일 존재 확인
- **다음 즉시 작업**:
  - `agent/src/__tests__/gateway-e2e.test.ts` 기준으로 8개 도구 런타임 검증 보강
  - 보강 후 `pnpm test`로 회귀 검증
  - 완료 결과를 본 문서에 세션 단위로 계속 기록
- **재실행 명령**:
  - `cd agent && pnpm test`
  - `cd agent && CAFE_LIVE_GATEWAY_E2E=1 npx vitest run src/__tests__/gateway-e2e.test.ts`
  - (전체) `cd agent && CAFE_LIVE_GATEWAY_E2E=1 CAFE_LIVE_GATEWAY_E2E_FULL=1 npx vitest run src/__tests__/gateway-e2e.test.ts`

---

## 전략

**Gateway 먼저 → Phase 3 실행 검증 → 신규 기능**

Phase 3 도구(8개)가 전부 Gateway WebSocket을 경유하므로,
Gateway 없이는 런타임 검증이 불가능. Phase 4의 첫 단계로
OpenClaw Gateway를 로컬에 띄워서 Phase 3를 실전 검증한 후,
확인된 기반 위에 Phase 4 기능(Skills, Memory, Channels)을 쌓는다.

## 아키텍처

```
Alpha Shell (Tauri 2) → stdio → Agent (Node.js, LLM+TTS)
                                  ↓ WebSocket (ws://127.0.0.1:18789)
                          OpenClaw Gateway (systemd user service)
                            ├── exec.bash (도구 실행)
                            ├── skills.invoke (web-search, browser)
                            ├── sessions.spawn (sub-agent)
                            ├── channels (Discord, Telegram) — 4.5
                            ├── skills registry — 4.3
                            └── memory (SQLite + vector) — 4.4
```

## 기존 인프라 (이미 구현됨)

| 파일 | 용도 |
|---|---|
| `config/scripts/setup-openclaw.sh` | OpenClaw 설치 스크립트 |
| `config/files/usr/bin/cafelua-gateway-wrapper` | Gateway 실행 래퍼 |
| `config/files/usr/lib/systemd/user/cafelua-gateway.service` | systemd 서비스 |
| `shell/src-tauri/src/lib.rs` (gateway_health) | Gateway 헬스체크 |
| `agent/src/gateway/client.ts` | WebSocket 클라이언트 |
| `agent/src/gateway/tool-bridge.ts` | 8개 도구 브릿지 |

---

## 작업 기록

### 2026-02-17

**세션 8** — Phase 4 계획 수립:
- Phase 3 완료 확인 + Phase 4 개발 순서 논의
- Gateway를 Phase 4 선행 항목으로 재배치 결정
- plan.yaml Phase 4 세부 구조 (4.0~4.6) 업데이트
- .users/context/plan.md 미러 업데이트
- Phase 3 작업로그 상태 ✅ 완료로 변경

**세션 9** — Phase 4 재개(중단 지점 확인 + E2E 보강 시작):
- 중단 지점 확인:
  - 마지막 커밋은 문서(`39cfaec`)이며, Phase 4 구현은 워킹트리 미커밋 상태
  - `agent/src/gateway/*` + `agent/src/__tests__/gateway-e2e.test.ts`가 중간 구현 상태
- 검증:
  - `cd agent && pnpm test` 실행 시, 권한 상승 환경에서 14/14 파일 통과 확인
- 착수:
  - `gateway-e2e.test.ts`를 Phase 4-1 기준으로 확장 시작
  - live e2e 기본 동작을 **명시적 opt-in env** 기반으로 전환 시작

**세션 10** — 하이브리드 어댑터 구현 + E2E 안정화:
- 구현:
  - `agent/src/gateway/tool-bridge.ts`
    - 하이브리드 실행 어댑터 추가:
      - `exec.bash` 우선
      - 미지원/실패 시 `node.invoke(system.run)` 폴백
    - `skills.invoke` 미지원 시 `browser.request` 폴백 경로 추가
    - `sessions_spawn` RPC 미지원 시 명시적 에러 반환
  - `agent/src/gateway/__tests__/mock-gateway.ts`
    - mock Gateway method 목록을 테스트별로 주입 가능하게 확장
  - `agent/src/gateway/__tests__/tool-bridge.test.ts`
    - node.invoke 폴백
    - paired node 없음 에러
    - browser.request 폴백
    - sessions_spawn 미지원 처리
    - 케이스 추가 (총 26 tests)
  - `agent/src/__tests__/gateway-e2e.test.ts`
    - capability + runtime readiness 기반 조건부 실행
    - 브라우저 준비 상태(`browser.request tabs`) 확인 후 web/browser 테스트 실행
    - 테스트 중 생성 임시 디렉토리 자동 정리
- 검증:
  - `cd agent && pnpm test` → ✅ 13 passed, 1 skipped
  - `cd agent && CAFE_LIVE_GATEWAY_E2E=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
  - `cd agent && CAFE_LIVE_GATEWAY_E2E=1 CAFE_LIVE_GATEWAY_E2E_FULL=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
- 메모:
  - 현재 로컬 Gateway(methods) 기준 `skills.invoke`는 미노출, `browser.request`는 브라우저 relay/tab 상태에 의존
  - 따라서 full e2e의 web/browser는 **capability + readiness 충족 시에만 실행**
  - 디버그 임시 산출물(`agent/.tmp-gateway-e2e-*`, `agent/gateway-probe.cjs`) 정리 완료

**세션 11** — 컨텍스트 동기화:
- 구현 반영에 맞춰 아키텍처 문서 업데이트:
  - `.agents/context/architecture.yaml`
  - `.users/context/architecture.md`
- 반영 내용:
  - 도구 실행 경로를 `exec.bash 고정` → `exec.bash 우선 + node.invoke 폴백`으로 명시
  - web/browser 경로를 `skills.* 고정` → `skills.invoke 또는 browser.request`로 명시
  - Gateway methods는 프로파일/환경별 동적 노출임을 명시

**세션 12** — 최종 검증(TDD VERIFY):
- 타입체크:
  - `cd agent && pnpm exec tsc --noEmit` → ✅ 통과
- 회귀 테스트:
  - `cd agent && pnpm test` → ✅ 13 passed, 1 skipped
- live e2e:
  - `CAFE_LIVE_GATEWAY_E2E=1 ...gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
  - `CAFE_LIVE_GATEWAY_E2E=1 CAFE_LIVE_GATEWAY_E2E_FULL=1 ...gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
- skip 1건 설명:
  - node 기반 placeholder 테스트(노드 페어링 의존) 1건은 의도적으로 유지

**세션 13** — 코드리뷰 반영 패치 + 회귀 테스트:
- 패치:
  - `agent/src/gateway/tool-bridge.ts`
    - `exec.bash` 실행 실패 시 무조건 `node.invoke` 재시도하던 동작 수정
    - fallback 조건을 "메서드 미지원(unknown/not implemented 계열)"으로 제한
    - 런타임 실패(timeout/transport/error)는 즉시 오류 반환(중복 실행 방지)
  - `agent/src/gateway/client.ts`
    - Gateway 에러 코드를 보존하는 `GatewayRequestError` 추가
    - 디바이스 서명 실패 시 `signature: ""`를 보내지 않고 필드 자체를 생략
  - `agent/src/__tests__/gateway-e2e.test.ts`
    - 임시 디렉토리 생성 시점을 `beforeAll`로 지연하여 skip 시 누수 방지
- 회귀 테스트 추가:
  - `agent/src/gateway/__tests__/tool-bridge.test.ts`
    - exec.bash 런타임 실패 시 node.invoke로 재시도하지 않는 케이스
    - exec.bash advertised but unknown-method일 때만 node.invoke fallback 허용 케이스
  - `agent/src/gateway/__tests__/client.test.ts`
    - 서명 실패 시 connect payload의 `device.signature` 생략 검증
- 검증:
  - `cd agent && pnpm exec vitest run src/gateway/__tests__/client.test.ts src/gateway/__tests__/tool-bridge.test.ts src/__tests__/gateway-e2e.test.ts` → ✅ 통과 (`e2e`는 opt-in 미설정으로 skip)
  - `cd agent && pnpm test` → ✅ 13 passed, 1 skipped
  - `cd agent && pnpm exec tsc --noEmit` → ✅ 통과
  - `cd agent && CAFE_LIVE_GATEWAY_E2E=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
  - `cd agent && CAFE_LIVE_GATEWAY_E2E=1 CAFE_LIVE_GATEWAY_E2E_FULL=1 pnpm exec vitest run src/__tests__/gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped

**세션 14** — 코드 리뷰 (Claude Opus 4.6):
- 전체 변경사항 리뷰 (10파일, +1203/-316)
- 우려사항 6건 분석 → 3건 수정, 3건 허용:
  - 수정 ① `parseCommandResult` 재귀 depth 3으로 제한 (무한재귀 방어)
  - 수정 ② `resolveNodeId` 모듈레벨 변수 → `WeakMap<GatewayClient>` 클라이언트별 캐싱
  - 수정 ③ `index.ts` spawn 실행 블록 들여쓰기 정렬
  - 허용: `hasMethod` 빈 배열→true (폴백 체인이 올바르게 처리)
  - 허용: `invokeBrowserRequest` 3회 시도 (실패 시 빠르고 드문 경로)
  - 해당없음: `gateway-probe.cjs` 이미 정리됨
- **핵심 발견: E2E "23 passed"이나 도구 실행 8건은 canRunShellTools=false로 조기 리턴**
  - `exec.bash` Gateway에 미존재, `node.invoke` 페어링 노드 0개
  - 실제 검증된 것: 핸드셰이크, Gateway RPC, 클라이언트 보안
  - 미검증: 8개 도구의 실제 런타임 실행
- 검증:
  - `cd agent && pnpm test` → ✅ 119 passed, 24 skipped
  - `CAFE_LIVE_GATEWAY_E2E=1 ...gateway-e2e.test.ts` → ✅ 23 passed, 1 skipped
  - `cd shell && pnpm test` → ✅ 124 passed
  - `cd shell && pnpm build` → ✅ 성공

**세션 15** — 노드 페어링 해결 + E2E 도구 실행 검증 완료:
- 문제:
  - 이전 세션에서 `canRunShellTools=false`로 도구 테스트가 실제 실행되지 않음
  - `node.list`가 빈 배열 반환, `node.invoke` 미작동
- 원인 분석 (3건):
  1. **디바이스 인증 필수**: Gateway 토큰(`cafelua-dev-token`)만으로는 스코프 미부여 → `node.list`가 `missing scope: operator.read`
     - Ed25519 디바이스 서명 포함 시 정상 인증 + 스코프 부여
  2. **exec-approvals 미설정**: 노드 호스트가 `SYSTEM_RUN_DENIED: approval required` 반환
     - `~/.openclaw/exec-approvals.json`에 `defaults: { ask: "off", security: "full" }` + 와일드카드 allowlist 추가
  3. **`node.list` 응답 필드명 불일치**: Gateway가 `nodeId` 반환하나 코드가 `id`만 확인
     - `resolveNodeId()`에 `nodeId || id` 폴백 추가
- 수정:
  - `agent/src/gateway/tool-bridge.ts`: `resolveNodeId`에 `nodeId` 필드 지원 추가
  - `agent/src/__tests__/gateway-e2e.test.ts`:
    - placeholder 노드 테스트 → 실제 `node.invoke system.run` + `system.which` 테스트로 교체
    - `system.which` 응답 구조: `payload.bins` (딕셔너리)
    - `node.list` 응답 타입: `{ nodeId: string }` (not `id`)
- 검증 (모두 통과):
  - `cd agent && pnpm exec tsc --noEmit` → ✅
  - `cd agent && pnpm test` → ✅ 119 passed, 25 skipped
  - `CAFE_LIVE_GATEWAY_E2E=1 ...gateway-e2e.test.ts` → ✅ **25 passed, 0 skipped**
  - `CAFE_LIVE_GATEWAY_E2E=1 CAFE_LIVE_GATEWAY_E2E_FULL=1 ...` → ✅ 25 passed
- E2E 검증 결과 상세:
  - 핸드셰이크 (3): v3 프로토콜, 메서드 리스트, 코어 메서드
  - Gateway RPC (5): health, config, agent.identity, node.list, unknown reject
  - **도구 실행 (5)**: execute_command(175ms), write+read_file(350ms), apply_diff(520ms), search_files x2(170ms)
  - **노드 직접 (2)**: system.run(3ms), system.which(1ms)
  - 보안 (6): rm -rf, sudo, chmod 777, pipe|bash, null bytes, unknown tool
  - 이벤트 (1): health event
  - web/browser/spawn (3): early-return (skills.invoke/브라우저 relay 미연결)
- 인프라 요구사항:
  - Gateway: `ws://127.0.0.1:18789` (PID 80160)
  - Node Host: `bun ... node run --host 127.0.0.1 --port 18789 --display-name CafeLuaLocal`
  - exec-approvals: `~/.openclaw/exec-approvals.json` (`ask: "off"`, `security: "full"`)

### 수동 테스트 체크리스트 (사용자)

> ✅ 도구 실행 E2E 자동 검증 완료 (5개 도구 + 2개 노드 명령)

- [ ] `shell`에서 Tools 활성화 + Gateway URL/Token 설정
- [ ] 채팅으로 `execute_command` 실행 (노드 페어링 환경)
- [ ] `read_file`/`write_file`/`apply_diff`/`search_files` 런타임 확인
- [ ] `browser`/`web_search`는 브라우저 relay 연결 후 재확인
- [ ] 승인 모달(Tier 1-2), Audit Log 기록 확인
