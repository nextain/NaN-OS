Stage: development

Review the complete change against commit 848e4c7f41da7c6dea79f0277e97e8e1ac232fc5. Inspect the changed implementation, requirements, existing updater banner/settings flow, and two or three nearby component patterns. Focus on correctness, completeness, consistency, accessibility, i18n, storage failure behavior, consent gating, and preservation of the existing banner/manual updater path.

Relevant implementation files:
- packages/shell/src/App.tsx
- packages/shell/src/components/UpdatePrompt.tsx
- packages/shell/src/lib/updater.ts
- packages/shell/src/lib/i18n.ts
- packages/shell/src/styles/global.css
- docs/requirements.md
- docs/user-scenarios.md

The deterministic complexity preflight could not produce a clean report because the baseline repository's tracked complexity waiver for issue #423 references USR-001 digest 4510885117feafbca94c2c46c87e97dff7e1b834f7b2f0049fa3c893c33cbc3d, while the tracked source file currently hashes to 8cccae14402275b18ead4d2c4e90e131dc7c0f618f42f25c08aa176d9b88cc63. Treat this as a baseline gate failure, not as authority to modify unrelated waiver files. Still inspect the changed files for avoidable complexity.
