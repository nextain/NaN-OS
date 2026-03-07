<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# AI-네이티브 오픈소스 운영 모델

Naia OS가 AI-네이티브 오픈소스 프로젝트로서 어떻게 운영되는지 정의합니다.

**관련 문서**: [contributing.yaml](../../../.agents/context/contributing.yaml) (코드 수준 규칙), [헌장 초안](charter-draft.md) (철학)

---

## 핵심 포지션

> **AI 기여를 막는 것이 아니라, AI 기여를 구조적으로 수용한다.**

2025~2026년 대부분의 오픈소스 프로젝트가 AI 기여를 방어하고 있다 (curl 버그 바운티 중단, Ghostty 제로 톨러런스, tldraw 외부 PR 차단). Naia OS는 반대 접근을 택한다: 프로젝트 컨텍스트를 충분히 풍부하게 만들어, AI 보조 기여가 기본적으로 높은 품질을 갖도록 구조화한다.

**핵심 통찰**: 풍부한 `.agents/` 컨텍스트 → AI의 더 나은 이해 → 더 높은 기여 품질.

---

## 5가지 전제

1. **최소 환경**: AI 코딩 도구 (Claude Code, Cursor, Windsurf, OpenCode, Gemini 등) + Git 연동
2. **양방향 AI**: 기여자와 메인테이너 모두 AI 사용
3. **공용어 영어**: Git에 올라가는 모든 것은 영어, AI가 기여자를 위해 번역
4. **이해 수준 혼재**: 초보~전문가, AI가 수준에 맞게 안내
5. **소통 구조**: 사람 → AI → Git(영어) → AI → 사람

---

## 기여 유형 (10가지)

| # | 유형 | 난이도 | 설명 |
|---|------|--------|------|
| 1 | **번역** | 낮음 | `.users/context/{lang}/` 추가 또는 i18n 사전 번역 |
| 2 | **스킬** | 중간 | AI 스킬 생성 (`agent/assets/default-skills/`) |
| 3 | **신기능** | 높음 | 새 기능 제안 또는 구현 |
| 4 | **버그 리포트** | 낮음 | 이슈 템플릿으로 버그 보고 |
| 5 | **코드/PR** | 중간~높음 | 이슈 선택 → PR 제출 |
| 6 | **문서** | 낮음~중간 | `.users/context/` 문서 개선 |
| 7 | **테스팅** | 낮음 | 앱 사용 후 피드백 공유 |
| 8 | **디자인/UX/에셋** | 중간 | UI/UX 개선, 목업, 아이콘, VRM 아바타 모델 |
| 9 | **보안 리포트** | 중간~높음 | GitHub Security Advisory(GHSA)로 취약점 비공개 보고 |
| 10 | **컨텍스트** | 중간 | `.agents/` 컨텍스트 파일 개선 (코드와 동등한 가치) |

---

## 기여자 흐름

### 온보딩 (모든 유형 공통)

1. 클론: `git clone https://github.com/nextain/naia-os.git`
2. AI 코딩 도구로 열기
3. 모국어로 질문: *"이 프로젝트가 뭐고, 내가 뭘 도울 수 있어?"*
4. AI가 `.agents/` 읽고 프로젝트를 모국어로 설명
5. AI가 기여자의 수준과 관심사에 맞는 기여 유형 추천

### 코드 기여

1. 기존 이슈 확인 또는 새 이슈 생성 (AI가 중복 확인)
2. 브랜치 생성: `issue-{number}-{short-description}`
3. AI 보조로 코드 작성 (AI가 패턴, 컨벤션, 테스트 안내)
4. AI 보조로 셀프 리뷰 (contributing.yaml 체크리스트)
5. PR 제출: 영어 제목, AI 귀속 표기 (`Assisted-by` 트레일러), 작고 집중된 PR
6. CI 자동 검증: 린트, 테스트, 라이선스 헤더, 미러 동기화

### 비코드 기여

- **번역**: 영문 문서 선택 → `{lang}/` 디렉토리 생성 → AI 보조 번역 → PR
- **버그 리포트**: AI에게 모국어로 설명 → AI가 중복 확인 → 영어 이슈 등록
- **컨텍스트**: `.agents/` 편집 → `.users/` 미러링 (영문 + 한국어) → SPDX 확인 → PR

---

## 메인테이너 흐름

### 이슈 트리아지

1. 기여자가 이슈 등록
2. GitHub Agentic Workflow로 자동 라벨링 (Phase 2)
   - 유형: bug / feature / question / translation / skill / docs / security / context
   - 우선순위: P0-critical / P1-high / P2-medium / P3-low
   - 컴포넌트: shell / agent / gateway / os / context
3. 메인테이너 확인: 유효 → 배정 | 정보 부족 → 추가 요청 | 슬롭 → 정중한 거절

### PR 리뷰 (3단계 게이트)

| 게이트 | 메커니즘 | 목적 |
|--------|---------|------|
| L1: CI | 빌드, 테스트, 린트, 라이선스, 미러 동기화 | 기본 품질 강제 |
| L2: AI 리뷰 | PR Agent / CodeRabbit (Phase 2) | 패턴 위반 탐지 |
| L3: 메인테이너 | 최종 인간 리뷰 | 아키텍처, 방향성 판단 |

---

## 품질 전략

> **구조가 품질을 보장한다 — 문지기가 아니라.**

| 계층 | 메커니즘 | 목적 |
|------|---------|------|
| L1: 컨텍스트 | `.agents/` 디렉토리 | AI가 프로젝트를 이해한 상태에서 코드 생성 |
| L2: 자동화 | CI 게이트 | 기본 품질 강제 |
| L3: AI 리뷰 | PR Agent | 패턴 위반, 보안 이슈 탐지 |
| L4: 인간 판단 | 메인테이너 리뷰 | 아키텍처, 방향성 판단 |
| L5: 에스컬레이션 | Vouch 시스템 (미래) | 반복적 저품질 기여자 관리 |

**핵심 원칙**: L1~L3가 충분히 강력하면, L4의 부담이 줄어든다.

---

## AI 귀속 정책

- AI 사용은 **환영**하되, **투명성**이 필수
- AI 생성 코드의 **책임**은 기여자에게 있음
- 귀속 표기는 **강제하되 차단하지 않음** (교육적 접근)

### Git 트레일러

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.

Assisted-by: Claude Code
```

### PR 공개

PR 템플릿의 체크박스: AI 보조 / 완전 AI 생성 / AI 미사용.

---

## 소통 구조

### 언어 흐름

```
기여자 (일본어) → AI → Issue/PR (영어) → AI → 메인테이너 (한국어)
메인테이너 (한국어) → AI → 리뷰 댓글 (영어) → AI → 기여자 (일본어)
```

### 채널

| 채널 | 용도 | 언어 |
|------|------|------|
| GitHub Issues | 버그, 기능 요청, 질문 | 영어 권장 (모국어 허용) |
| GitHub PRs | 코드/문서 리뷰 | 영어 |
| GitHub Discussions | 설계 논의, RFC | 영어 |
| Discord | 실시간 커뮤니티 | 다국어 (채널별) |

### 이해 수준별 대응

| 수준 | AI의 역할 |
|------|----------|
| 초보자 | 프로젝트 설명, 개발 환경 설정 안내, starter 이슈 추천 |
| 중급자 | 아키텍처 설명, 관련 코드 안내, 구현 방향 제안 |
| 전문가 | 핵심 로직 설명, 설계 의도 전달, 자율적 기여 지원 |

---

## 단계적 성장

| 단계 | 조건 | 인프라 |
|------|------|--------|
| **Phase 1** (현재) | 기여자 0~5명 | Issue/PR 템플릿, CI 파이프라인, contributing.yaml 확장 |
| **Phase 2** | 기여자 5~20명 | GitHub Agentic Workflow, AI PR 리뷰, Discussions |
| **Phase 3** | 기여자 20~100명 | Vouch 시스템, 커뮤니티 리뷰어, RFC 프로세스 |
| **Phase 4** | 기여자 100명+ | 거버넌스 구조화, 분산 의사결정 |

---

## 리스크

| 리스크 | 가능성 | 영향 | 대응 |
|--------|-------|------|------|
| AI 슬롭 홍수 | 높음 | 높음 | L1~L4 계층 방어 + 컨텍스트 투자 |
| 보안 취약점 삽입 | 중간 | 높음 | CI 보안 스캔 + 메인테이너 리뷰 |
| 라이선스 위반 | 중간 | 높음 | CI 라이선스 체크 + AI 보호 규칙 |
| 메인테이너 번아웃 (1인) | 높음 | 치명적 | 자동화 극대화 + AI 리뷰 보조 |
| 컨텍스트 오염 | 낮음 | 중간 | 삼중 미러 CI 검증 |
| 번역 품질 저하 | 중간 | 낮음 | 네이티브 리뷰어 또는 AI 교차 검증 |

---

## 참조

- [GitHub "Eternal September of open source"](https://github.blog/open-source/maintainers/welcome-to-the-eternal-september-of-open-source-heres-what-we-plan-to-do-for-maintainers/) (2026-02)
- [arXiv "Vibe Coding Kills Open Source"](https://arxiv.org/abs/2601.15494) (2026-01)
- [Responsible Vibe Coding Manifesto](https://vibe-coding-manifesto.com/)
- [Mitchell Hashimoto Vouch](https://github.com/mitchellh/vouch)
- [GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)
- [AGENTS.md 표준](https://agents.md/)

---

*영문 미러: [.users/context/open-source-operations.md](../open-source-operations.md)*
*AI 컨텍스트: [.agents/context/open-source-operations.yaml](../../../.agents/context/open-source-operations.yaml)*
