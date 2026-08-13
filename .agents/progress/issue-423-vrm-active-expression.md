# Issue #423 — active VRM expression lifecycle

- Issue: https://github.com/nextain/naia-shell/issues/423
- Baseline: `f2701d1e`
- Branch: `issue-423-vrm-active-expression`
- Requirement: `REQ-002` / `FR-AVATAR.2`
- Type: EXPANSION
- Scope mode: SELECTIVE_EXPANSION
- Current phase: verified implementation; ready for remote review branch

## Goal, constraints, criteria

Goal: drive the delivered Naia VRM expressions through the real request and
speech lifecycle: `think` while waiting, explicit response emotion when known,
five-vowel mouth motion during actual playback, then neutral on completion.

Constraints: preserve the existing chat/voice transports, TTS ownership,
sentence ordering, NVA renderer, blink, lookAt, springBone, external idle VRMA,
VRM 0.0 compatibility, and all model files. Do not claim or reference body
animation clips that the delivered files do not contain.

Criteria: deterministic tests prove state ordering and interruption cleanup;
the full Shell test/build and browser voice pipeline pass; independent review
converges before remote push.

## Findings

1. `handleSend` resets previous TTS but does not enter `think` while the request
   is waiting.
2. Explicit emotion tags and realtime `emotion.updated` already reach
   `useAvatarStore.setEmotion`.
3. `usage` and `finish` immediately set neutral, even when sentence synthesis,
   queued audio, browser speech, or authored NVA playback is still active.
4. Audio start/end already drives `setSpeaking`, so #422 mouth motion has the
   correct physical clock once the binary-expression compatibility fix is used.
5. Delivered VRMs contain no embedded glTF animation clips. Existing body motion
   is `/animations/idle_loop.vrma`; blink/lookAt/springBone run in the render loop.

## Plan

1. RED tests: request enters think; explicit emotion wins; finish retains it
   while TTS is active; playback end and interruption return neutral.
2. Introduce one lifecycle helper in `ChatArea` that resets emotion only when no
   request, synthesis, queue, browser/NVA playback, or live audio owns it.
3. Wire ordinary chat and realtime voice input/output to think/emotion/playback
   transitions without changing the model or animation loader.
4. Update `FR-AVATAR.2` and user scenario evidence, then run focused/full tests,
   build, Playwright, review-pass, verify-implementation, and push only when
   `RELEASE_ELIGIBLE`.

Rejected alternatives:

- Invent per-emotion VRMA paths: there are no corresponding supplied clips.
- Reset on agent finish: transport completion does not mean audio completion.
- Infer emotion from arbitrary sentiment: structured model/server signals are
  already available and less likely to produce surprising expressions.

Pre-mortem:

1. Emotion sticks forever after failed audio — every cancel/error/unavailable
   path resets or re-runs the idle-settlement check.
2. Finish neutralizes before queued speech — settlement checks requests, queue,
   playback, and authored-render jobs.
3. Stale callbacks reset a newer turn — existing TTS generations remain the
   authority and a new turn enters think after interrupting the prior one.

## Preservation contract

- Baseline ref: `f2701d1e`
- Preserve: routes, settings, transcript, TTS provider selection, audio ordering,
  NVA behavior, idle VRMA, blink/lookAt/springBone, model files.
- Extend: request/speech-driven VRM expression lifecycle.
- Replace/remove/disable/redirect/migrate: none.
- Incident history: #361 specified the assets; #422 repaired binary five-vowel
  and custom think compatibility; #423 connects those capabilities to runtime.

## Implementation and test evidence (2026-08-13)

- RED: the two new ChatArea tests failed because requests stayed neutral and
  streamed emotion parsing read the pre-append state.
- GREEN: focused ChatArea + mouth + expression tests passed 79/79.
- Full Shell Vitest passed: 139 files passed, 2 skipped; 1481 tests passed,
  22 skipped.
- Root TypeScript build and Shell production build passed.
- Chromium E2E passed 16/16: pipeline voice (10) plus core/THINK variants (6).
- Assembly coverage passed: S69 / UC20.
- `git diff --check` and changed-file conflict-marker scan passed.
- verify-i18n and verify-hardcoded-strings: no user-facing strings, IPC output,
  or locale keys were added; not applicable beyond the clean changed-set scan.
- Formatting audit caught and removed broad formatter churn; final source diff
  is limited to 31 net lifecycle lines plus focused tests and documents.

## Review gate

Status: `CLEAN` after two consecutive independent re-review rounds.

The user explicitly approved a 90-day, issue-scoped complexity waiver. The
tracked authority source and byte-bound waiver expire on 2026-11-11. The final
deterministic preflight classified the two existing large files as
`WAIVED_COMPLEXITY`, with no authority, expiry, size, or hash mismatch; named
review remained required as designed. Complexity report hash:
`sha256:1e3848af2f95b4bf53115f12b413cacd16e79347e405d5312dea766228fa669e`.

The first independent development review found two terminal-ordering gaps:
local TTS failure after `finish`, and realtime/pipeline teardown after player
destruction. Both were fixed by clearing ownership before idle settlement. A
regression test now exercises `finish` before synthesis failure and proves
`think` remains until failure cleanup, then returns to `neutral`.

Post-fix evidence:

- Focused ChatArea test: 38/38 passed.
- Full Shell Vitest: 1,481 passed, 22 skipped, zero failures.
- Shell production build: passed.
- Chromium Playwright voice and THINK suites: 16/16 passed.
- Independent re-review rounds 1 and 2: `CLEAN`, no findings.
- Complexity waiver staged-byte hashes: matched.
- `git diff --check`, conflict markers, and changed-source hardcoded strings:
  passed.
- Product preservation: no route, navigation, model asset, provider selection,
  or existing animation surface was removed or redirected.

## Skill drift

No new cross-project verification pattern was introduced. The behavior is
covered by focused controller/lifecycle tests and existing voice E2E, so
`manage-skills` requires no verify-* skill creation or update.
