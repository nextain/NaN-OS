# Steam Content Survey 초안

## General / Mature Content

- 제품 유형: 비게임 데스크톱 소프트웨어
- 개발자 제공 정적 콘텐츠: 폭력, 성적 콘텐츠, 도박, 약물, 혐오 표현 없음으로 예상. 최종 번들 전체를 다시 확인한다.
- 사용자·외부 모델이 생성하는 내용은 아래 Live-Generated AI로 별도 신고한다.

## Generative AI — Live-Generated

**Yes.** Naia sends user prompts and authorized context to a user-selected AI model and displays responses generated while the application is running.

### Proposed English disclosure

Naia uses live generative AI to produce conversational responses and, when the user explicitly invokes a supported tool, task-oriented output. Users select or configure the model provider. Output can be inaccurate or unexpected.

### Guardrails description draft

- Provider safety systems remain enabled where offered.
- The application does not market or enable adult sexual content generation.
- Users retain control over the selected provider, workspace permissions, and tool execution boundaries.
- Potentially sensitive actions require the application's existing permission and tool controls.
- Users can stop generation and report inappropriate output through the published support/reporting channel.
- Reports are reviewed by the developer and may result in prompt, policy, provider, or account-level mitigation.

### 제출 전 증거 필요

- 실제 앱 내 신고 버튼 또는 지원 링크 화면
- 공개 신고 URL과 처리 정책
- 도구 권한 확인 흐름 캡처
- 기본 제공 모델별 안전 설정 확인
- 제품에 포함되는 사전 생성 AI 이미지·음성·현지화의 존재 여부와 권리 검토

