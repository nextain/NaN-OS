# Issue 417 integration review — round 1 / baseline preservation

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: baseline_preservation
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`
Inspect the staged worktree bytes against the baseline and current tests. The invalid deletion commit `2886b7b` is incident evidence only and was reverted by `66bf6359`.

Read exactly:

- `docs/progress/issue-417-herdr-workspace.md`
- `packages/shell/src/apps/workspace/index.tsx`
- `packages/shell/src/apps/workspace/WorkspaceCenterArea.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceCenterArea.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceRail.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceSurface.tsx`
- `packages/shell/src/apps/workspace/useHerdrDocuments.ts`
- `packages/shell/src/apps/workspace/useHerdrRuntime.ts`
- `packages/shell/src/apps/workspace/Terminal.tsx`
- `packages/shell/src/apps/workspace/Editor.tsx`
- `packages/shell/src-tauri/src/pty.rs`
- `packages/shell/src-tauri/src/herdr.rs`
- `packages/shell/src-tauri/src/herdr/config.rs`
- `packages/shell/src-tauri/src/herdr/pty.rs`
- `packages/shell/e2e/91-workspace-panel.spec.ts`
- `packages/shell/src/apps/workspace/__tests__/herdr-workspace.test.tsx`

Check preservation of the actual Herdr terminal/tab/pane state, legacy PTY behavior, FileTree/viewer/Quick Open/document action surfaces, and whether duplicated legacy session UI is merely inactive rather than destructively removed before parity. Check lifecycle races and whether the Shell-owned Herdr config avoids mutating global config.

Deterministic preflight: `NOT_CLEAN`. Causes: pre-existing oversized `lib.rs` 13,206/+17, `Editor.tsx` 1,077/+58, `i18n.ts` 15,067/+30, and unrelated unchanged `ChatArea.tsx` waiver mismatch/+0. All new Herdr modules are within thresholds. Treat the invocation-supplied preflight digest as authoritative and report this separately from behavioral preservation.

Output only:

### Files Read
- one exact path per line

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
