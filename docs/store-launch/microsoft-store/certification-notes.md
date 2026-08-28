# Partner Center 인증 메모 초안

## Tester notes

Naia is a Windows desktop visual AI agent. The baseline certification path is text conversation using a configured provider. Some optional local voice/avatar paths require additional models and compatible GPU hardware and should not be required for baseline certification.

### Suggested certification path

1. Install and launch Naia.
2. Complete the first-run setup using the provided certification test account or test provider credentials.
3. Open Settings and confirm the selected provider/model.
4. Return to Chat, submit a short prompt, and verify a streamed text response.
5. Open the workspace app and confirm that no file or tool action occurs without the relevant user configuration/authorization.
6. Use the support/report link to verify that inappropriate AI output can be reported.

## Live generative AI declaration

Yes. Naia displays conversational and task-oriented content generated at runtime by a user-selected AI model. Provider safeguards remain enabled where offered. Users control provider selection and workspace/tool boundaries, can stop generation, and can report inappropriate output to the developer.

## 정보 입력 전 확인

- 인증용 계정은 개인·운영 계정과 분리한다.
- 인증자가 결제 없이 기본 경로를 시험할 수 있어야 한다.
- 외부 제공자 장애 시 재현 가능한 대체 시험 경로를 제공한다.
- 신고 URL, 개인정보처리방침 URL, 지원 이메일을 실제 값으로 교체한다.
- 선택 기능의 하드웨어 요구 사항을 인증 메모와 스토어 설명에서 동일하게 유지한다.

