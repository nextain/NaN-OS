# Issue 417 integration review — round 3 / remediation verification

You are a read-only adversarial reviewer. Do not edit files, commit, or call external services.

Stage: integration
Role: implementation_test
Baseline: `c4dffdede5087f9c81c9d3a34b7ddb8d4b45891a`

Read the implementation and tests listed in `.agents/reviews/issue-417/round-2-implementation.md`,
then inspect the current working-tree diff. Round 2 reported these risks; verify that each is
actually closed and look for regressions introduced by the remediation:

1. file resolution used a sampled frontend root while native focus could change;
2. non-worktree FileTree root used `foreground_cwd` instead of stable agent `cwd`;
3. tool-driven viewer opening could leave focus in the hidden terminal;
4. optional snapshot display strings were not runtime-validated;
5. embedded config replacement could race on Windows;
6. public IDs and labels had no length caps.

Also adversarially inspect command injection, canonical path containment and symlink escape,
singleton/strict-effect lifecycle, stale polling, viewer return focus, ordinary PTY preservation,
and the honesty of component/browser/native evidence. P4 remains deferred.

Current retained evidence: production build passes; paired Rust Herdr tests 9/9 pass; focused
remediation tests pass; Chromium integration 4/4 passes. The full Vitest run passed 1,552 tests
and failed one unrelated voice-queue timing assertion, which passes in isolated rerun. Installed
Herdr 0.8.0 reports public protocol 19/schema 1 and a live snapshot matching the consumed IDs.
Deterministic complexity/preservation preflight remains independently authoritative and NOT_CLEAN.

Output only:

### Files Read
- one exact path per line

### Remediation
- `item N: CLOSED | OPEN — primary evidence`

### Findings
- `path:line [CRITICAL|HIGH|MEDIUM|LOW|INFO] [correctness|preservation|scope|authority|release|complexity] — description`
or `NONE`

### Verdict
CLEAN | FOUND_ISSUES | VETO
