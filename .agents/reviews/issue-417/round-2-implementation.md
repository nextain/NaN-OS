# Issue 417 integration review — round 2 / implementation and security

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: implementation_test
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`

Read exactly:

- `packages/shell/src-tauri/src/herdr.rs`
- `packages/shell/src-tauri/src/herdr/api.rs`
- `packages/shell/src-tauri/src/herdr/config.rs`
- `packages/shell/src-tauri/src/herdr/location.rs`
- `packages/shell/src-tauri/src/herdr/pty.rs`
- `packages/shell/src-tauri/src/pty.rs`
- `packages/shell/src-tauri/src/lib.rs`
- `packages/shell/src/apps/workspace/herdr.ts`
- `packages/shell/src/apps/workspace/HerdrWorkspaceCenterArea.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceRail.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceSurface.tsx`
- `packages/shell/src/apps/workspace/useHerdrDocuments.ts`
- `packages/shell/src/apps/workspace/useHerdrRuntime.ts`
- `packages/shell/src/apps/workspace/useHerdrWorkspaceBridge.ts`
- `packages/shell/src/apps/workspace/Terminal.tsx`
- `packages/shell/src/apps/workspace/Editor.tsx`
- `packages/shell/src/apps/workspace/index.tsx`
- `packages/shell/src/apps/workspace/__tests__/herdr.test.ts`
- `packages/shell/src/apps/workspace/__tests__/herdr-workspace.test.tsx`
- `packages/shell/src/apps/workspace/__tests__/file-tree-reveal.test.tsx`
- `packages/shell/src/apps/workspace/__tests__/use-herdr-runtime.test.tsx`
- `packages/shell/src/apps/__tests__/editor-viewer.test.tsx`
- `packages/shell/e2e/91-workspace-panel.spec.ts`

Adversarially inspect command injection, path escape/symlink handling, config isolation,
singleton lifecycle and stale polling responses, React strict-effect launch behavior,
focus restoration, snapshot schema validation, prompt/argument limits, active-root races,
and compatibility of ordinary PTYs. Distinguish component evidence from native Tauri
evidence. P4 must remain deferred.

Verified runs: Shell 147 files pass, 2 skip, 1,530 tests pass, 22 skip; Chromium E2E
4 pass; paired Rust Herdr module tests 7 pass; typecheck and production build pass.
Release preflight is independently authoritative and is not CLEAN.

Output only:

### Files Read
- one exact path per line

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
