# Issue 417 integration review — round 1 / implementation and security

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

Adversarially inspect command injection, path escape/symlink handling, config isolation, singleton lifecycle and stale polling responses, React unmount/recreation, focus restoration, snapshot schema validation, prompt/argument limits, active-root races, and compatibility of ordinary PTYs. Herdr v0.8.0 has snapshot/workspace focus/agent focus APIs but no event stream and no public absolute pane focus API; the viewer therefore keeps the xterm mounted and does not change Herdr focus.

Verified evidence so far: Shell unit suite 145 files passed, 2 skipped; 1,524 passed, 22 skipped. Target Chromium E2E 4 passed. Rust Herdr module tests 5 passed against exact paired naia-agent commit `94a7b1d627cce58a98d65afac32f10dfe1e88d31`. Typecheck and build passed.

Deterministic preflight remains `NOT_CLEAN` due to oversized touched legacy files (`lib.rs`, `Editor.tsx`, and `i18n.ts`) plus an unrelated unchanged `ChatArea.tsx` waiver mismatch. New Herdr modules pass size thresholds. Treat the invocation-supplied preflight digest as authoritative.

Output only:

### Files Read
- one exact path per line

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
