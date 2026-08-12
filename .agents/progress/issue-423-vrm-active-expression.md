# Issue #423 — active VRM expression lifecycle

- Issue: https://github.com/nextain/naia-shell/issues/423
- Baseline: `f2701d1e`
- Branch: `issue-423-vrm-active-expression`
- Requirement: `REQ-002` / `FR-AVATAR.2`
- Type: EXPANSION
- Scope mode: SELECTIVE_EXPANSION
- Current phase: REVIEW_ONLY checkpoint

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

Status: `NOT_CLEAN / REVIEW_ONLY`.

The mandatory deterministic review preflight stopped before reviewer voting:
`ChatArea.tsx` (4,198 lines) and its existing test file (1,571 lines) exceed the
critical file-size threshold. The functional change adds only 28 and 77 lines
respectively, but the gate intentionally evaluates any changed source file's
total size. Complexity report hash:
`sha256:e9ab74d9eabacefd0d3a5451893ecadb93e3f1d6c8305112d750d3a8cb4ce98e`.

No complexity waiver was created: a valid waiver requires explicit human
authority bound to a tracked source atom, and the request to implement/test/push
does not explicitly authorize bypassing this review control. Under
`review-pass`, remote push is forbidden while the checkpoint is REVIEW_ONLY.

## Skill drift

No new cross-project verification pattern was introduced. The behavior is
covered by focused controller/lifecycle tests and existing voice E2E, so
`manage-skills` requires no verify-* skill creation or update.
