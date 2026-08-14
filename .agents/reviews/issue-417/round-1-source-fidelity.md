# Issue 417 integration review — round 1 / source fidelity

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: source_fidelity
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`
Incident history: an invalid implementation at `2886b7b` deleted 12,864 lines and reduced the test suite; it was reverted by `66bf6359`. The current staged implementation must be judged against the original Korean directives captured in the issue document, not against that invalid implementation.

Read exactly:

- `docs/progress/issue-417-herdr-workspace.md`
- `docs/requirements.md`
- `.agents/reviews/issue-417/epic.md`
- `.agents/reviews/issue-417/p1.md`
- `.agents/reviews/issue-417/p2.md`
- `.agents/reviews/issue-417/p3.md`
- `.agents/reviews/issue-417/p4.md`
- `packages/shell/src/apps/workspace/HerdrWorkspaceCenterArea.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceRail.tsx`
- `packages/shell/src/apps/workspace/HerdrWorkspaceSurface.tsx`
- `packages/shell/src/apps/workspace/useHerdrDocuments.ts`
- `packages/shell/src/apps/workspace/useHerdrRuntime.ts`
- `packages/shell/src/apps/workspace/useHerdrWorkspaceBridge.ts`
- `packages/shell/src/apps/workspace/index.tsx`
- `packages/shell/e2e/91-workspace-panel.spec.ts`

Check that the implementation matches: File Tree above Spaces/Agents; Spaces shows the existing embedded Herdr work surface; file-path click reveals the tree and opens viewer at location; Back restores the same Herdr terminal; Agents and internal Herdr focus reverse-sync; active Space drives the tree root; P4 remains deferred; duplicate legacy UI is not prematurely deleted.

The deterministic preflight is already `NOT_CLEAN` because changed touchpoints include pre-existing oversized `lib.rs` (13,206 lines, +17), `Editor.tsx` (1,077, +58), and `i18n.ts` (15,067, +30), plus unrelated unchanged `ChatArea.tsx` waiver drift (+0). New modules themselves are below thresholds. Treat the invocation-supplied preflight digest as authoritative. Do not turn that mechanical gate into a fabricated functional defect.

Output only:

### Files Read
- one exact path per line

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
