Stage: test

Review the tests for the complete change against commit 848e4c7f41da7c6dea79f0277e97e8e1ac232fc5. Verify that assertions execute real changed logic, mocks do not bypass the behavior under test, and positive, negative, boundary, failure, reload, consent, and newer-version cases are covered.

Relevant test and implementation files:
- packages/shell/src/lib/__tests__/updater.test.ts
- packages/shell/src/components/__tests__/UpdatePrompt.test.tsx
- packages/shell/e2e/startup-update-prompt.spec.ts
- packages/shell/src/App.tsx
- packages/shell/src/components/UpdatePrompt.tsx
- packages/shell/src/lib/updater.ts

The deterministic complexity preflight is NOT_CLEAN because of the unrelated baseline issue #423 waiver-authority digest mismatch described in the development delta. Do not recommend changing those unrelated files; identify only test defects in the issue #468 change.
