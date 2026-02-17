# Cafelua OS Phase 4: Always-on Daemon

- **시작일**: 2026-02-17
- **상태**: 🟡 진행 중
- **프로젝트**: cafelua-os
- **담당**: luke + Claude

---

## 현재 상태 요약

| 단계 | 내용 | 상태 |
|---|---|---|
| 4.0 | OpenClaw Gateway 로컬 설정 | 🔲 대기 |
| 4.1 | Phase 3 E2E 검증 (8개 도구 런타임) | 🔲 대기 |
| 4.2 | 사용자 테스트 (수동) | 🔲 대기 |
| 4.3 | Skills 시스템 | 🔲 대기 |
| 4.4 | 메모리 시스템 | 🔲 대기 |
| 4.5 | 외부 채널 (Discord/Telegram) | 🔲 대기 |
| 4.6 | systemd 자동시작 통합 | 🔲 대기 |

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
