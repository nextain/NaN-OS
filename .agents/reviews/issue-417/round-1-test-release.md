# Issue 417 integration review — round 1 / test and release authority

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: authority_release
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`

Read exactly:

- `docs/progress/issue-417-herdr-workspace.md`
- `.agents/reviews/issue-417/epic.md`
- `packages/shell/e2e/91-workspace-panel.spec.ts`
- `packages/shell/src/apps/workspace/__tests__/herdr-workspace.test.tsx`
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

Audit whether tests actually prove DOM order, existing Herdr surface, bidirectional Spaces/Agents focus, active-root following, file-path location resolution, reveal/select/viewer line-column behavior, mounted terminal preservation and focus return, bridge controls, lifecycle error/retry, and ordinary PTY preservation. Identify mocked assertions that cannot prove their claimed contract. P4 three-layer orchestration must remain explicitly deferred and must not be claimed complete.

Verified runs: root 25/231 pass; Shell 145 files pass, 2 skip, 1,524 tests pass, 22 skip; Chromium E2E 4 pass; paired Rust Herdr module tests 5 pass; typecheck/build pass.

Release gate is mechanically `NOT_CLEAN` regardless of model vote. Oversized touched legacy files are `lib.rs` 13,206/+17, `Editor.tsx` 1,077/+58, `i18n.ts` 15,067/+30, plus unrelated unchanged `ChatArea.tsx` waiver mismatch/+0. New modules pass thresholds. Treat the invocation-supplied preflight digest as authoritative. Do not label release eligible.

Output only:

### Files Read
- one exact path per line

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
