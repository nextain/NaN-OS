# Naia — Gemini CLI Entry Point

## 필수 읽기 (세션 시작 시)

**아래 파일들을 반드시 먼저 읽어주세요:**

1. `.agents/context/agents-rules.json` — 프로젝트 핵심 규칙 (SoT)
2. `.agents/context/project-index.yaml` — 컨텍스트 인덱스 + 미러링 규칙
3. `.agents/workflows/development-cycle.yaml` — 개발 사이클 (PLAN -> CHECK -> BUILD -> VERIFY -> CLEAN -> COMMIT)

필요 시 `.agents/context/`에서 관련 컨텍스트를 온디맨드로 로드합니다.

## 개발 원칙 및 TDD 준수
- **PLAN**: 코드를 작성하기 전에 반드시 `write_file`을 사용하여 작업 로그나 계획 문서를 작성하세요.
- **CHECK/BUILD**: 요구사항을 만족하는 TDD(Test-Driven Development) 원칙을 준수하세요. 통합/E2E 테스트를 우선적으로 고려하세요.
- **VERIFY**: 작업이 끝나면 반드시 관련된 유닛 테스트나 E2E 테스트(`pnpm test`, `pnpm run test:e2e:tauri`)를 실행하여 검증하세요.

## 프로젝트 구조 요약
- `shell/`: Nextain Shell (Tauri 2, Three.js Avatar, UI)
- `agent/`: AI 에이전트 코어 (LLM 연결, 도구 실행, Gateway 연동)
- `gateway/`: 백엔드 데몬 (오픈클로 기반)

*주의: SSoT 원칙을 지키며, 프론트엔드와 백엔드 간의 코드 중복을 최소화하세요.*
