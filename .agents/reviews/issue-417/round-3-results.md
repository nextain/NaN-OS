# Issue 417 integration review — round 3 results

Date: 2026-08-14
Stage: integration

This record is completed after both read-only reviewers return. Deterministic
preflight remains independently authoritative: its current verdict is `NOT_CLEAN`
because repository complexity/preservation evidence gates are not satisfied. A
clean model review cannot override that result or substitute for packaged native
Tauri acceptance.

## Retained remediation evidence

- Workspace/pane identity is bound across frontend observation and native path
  resolution, with native rejection after a focus race.
- Stable non-worktree roots use `agent.cwd` on both sides of the bridge.
- Terminal and Naia-tool file opening transfer keyboard focus to File Tree/viewer.
- Optional snapshot display strings and public API input sizes are validated.
- The isolated Herdr configuration is initialized once per Shell process.
- A transient `workspace_set_root` failure is retried on the next accepted Herdr
  snapshot, so File Tree cannot remain permanently pinned to the previous Space.
- Final regression evidence after the v0.1.7 launch corrections: Vitest 148
  passed files / 1,540 passed tests, Chromium 4/4, Rust Herdr 9/9 against
  paired naia-agent `e297a30c74bf30d4ea0dbe27d7f5c3b6f5856955`, and the production
  build/typecheck.

## Final launch-correction review

- Locale hydration now gates the first post-setup application render and applies
  the file-backed locale before the readiness gate opens. The failure path still
  releases the gate, avoiding a permanent splash if config loading fails.
- The nine ADK existing-data messages use translation keys in all fourteen locale
  tables. The locale control is Web-rendered, avoiding the observed Linux native
  select glyph-shaping defect while retaining button keyboard focus, Escape close,
  blur close, expanded state, and explicit current-option state.
- File Tree has no broad configured-root fallback while Herdr identity is unknown;
  only a canonical root accepted from the focused snapshot is exposed. Failed root
  synchronization remains retryable on later snapshot revisions.
- The Herdr terminal subscribes to PTY output before its first resize/SIGWINCH,
  closing the lost-initial-redraw race that produced a populated rail beside a
  black terminal surface.
- Repository-wide hardcoded-string and structural scans still contain unrelated
  legacy findings. They are recorded as debt and are not presented as clean gates
  for this bounded patch.

## Reviewer convergence

- The implementation reviewer closed all six round-2 remediation items and found
  one remaining correctness issue: root synchronization did not retry after a
  transient failure. The runtime now keys synchronization to every accepted
  snapshot revision, and a focused regression test proves same-Space recovery.
- The test/release reviewer concerns about exact terminal DOM identity and async
  invocation counts do not identify false positives: those assertions directly
  encode the retained-terminal contract and poll at the asynchronous boundary.
  Opaque Herdr IDs intentionally use exact comparison rather than whitespace
  normalization. Positive tilde-path coverage remains part of the packaged native
  acceptance boundary below.
- No reviewer finding authorizes a release-ready claim. Deterministic preflight
  and native acceptance remain the controlling gates.

## Remaining release boundary

- Deterministic preflight remains `NOT_CLEAN`
  (`complexity_refactor_required`). It was rerun after the final v0.1.7 source
  changes; an exact report digest is intentionally not embedded because changing
  this tracked evidence file changes the report's repository-set digest.
  All newly introduced Herdr modules pass structural inspection. The remaining
  repository-wide blockers are pre-existing large-file boundaries in
  `src-tauri/src/lib.rs`, `App.tsx`, `Editor.tsx`, `SettingsTab.tsx`, its existing
  large test module, and `i18n.ts`, plus an unrelated `ChatArea.tsx` waiver hash
  mismatch; those require separate architectural work.
- Packaged native Tauri interaction and visual acceptance with the real Herdr binary
  remains open.
- P4 three-layer Naia orchestration remains deferred.
