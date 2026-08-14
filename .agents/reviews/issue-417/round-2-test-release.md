# Issue 417 integration review — round 2 / test and release authority

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: authority_release
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`

Read exactly:

- `docs/progress/issue-417-herdr-workspace.md`
- `.agents/reviews/issue-417/epic.md`
- `packages/shell/e2e/91-workspace-panel.spec.ts`
- `packages/shell/src/apps/workspace/__tests__/herdr-workspace.test.tsx`
- `packages/shell/src/apps/workspace/__tests__/file-tree-reveal.test.tsx`
- `packages/shell/src/apps/workspace/__tests__/use-herdr-runtime.test.tsx`
- `packages/shell/src/apps/__tests__/editor-viewer.test.tsx`
- `packages/shell/src/apps/workspace/__tests__/herdr.test.ts`
- `packages/shell/src/apps/workspace/HerdrWorkspaceCenterArea.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceRail.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceSurface.tsx`
- `packages/shell/src/apps/workspace/useHerdrDocuments.ts`
- `packages/shell/src/apps/workspace/useHerdrRuntime.ts`
- `packages/shell/src/apps/workspace/useHerdrWorkspaceBridge.ts`
- `packages/shell/src-tauri/src/herdr.rs`
- `packages/shell/src-tauri/src/herdr/api.rs`
- `packages/shell/src-tauri/src/herdr/location.rs`
- `packages/shell/src-tauri/src/herdr/pty.rs`

Audit whether evidence proves DOM order, Herdr surface preservation, bidirectional
Spaces/Agents focus, active-root following, safe file-location resolution, actual
FileTree reveal/select/scroll, actual Editor line/column positioning, mounted terminal
identity/focus return, bridge controls, lifecycle error/retry, and ordinary PTY
preservation. Identify claims requiring a packaged native Herdr run. P4 three-layer
orchestration must remain explicitly deferred.

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
