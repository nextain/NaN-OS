# Issue #422 — Naia VRM binary lip sync

- Issue: https://github.com/nextain/naia-shell/issues/422
- Baseline: `4a525f6886e7e2a8992a11b8e7e9bf1629865b13`
- Branch: `issue-422-vrm-binary-lipsync`
- Requirement: `REQ-002` / `FR-AVATAR.1`
- Type: BUG_FIX
- Scope mode: HOLD_SCOPE
- Current phase: REVIEW_ONLY checkpoint

## Original request

The user asked to compare the outsourced Naia VRM files in
`naia-settings/vrm-files` with the prior avatar issue and requirements, identify
whether missing mouth movement is code or asset failure, inspect other supplied
animation effects, recommend autonomous trigger conditions, and—when the defect
is in development—register an issue and fix it under the standard process.

## Understanding

- Goal: while TTS audio is playing, both Naia VRM 1.0 models visibly cycle all
  five standard vowel expressions; the supplied `think` expression is used.
- Constraints: preserve VRM 0.0 behavior, existing TTS lifecycle, emotion tags,
  idle VRMA playback, NVA video-avatar behavior, and model files.
- Verification: deterministic unit tests cover binary and continuous expressions,
  all five vowels, stop/close behavior, and `think` fallback; build passes.

## Investigation evidence

1. Both Naia files expose VRM 1.0 `aa/ih/ou/ee/oh`; each is a
   `textureTransformBinds` expression with `isBinary: true`.
2. `@pixiv/three-vrm` 3.5.3 applies a binary expression only when its input
   weight is greater than 0.5.
3. `packages/shell/src/lib/vrm/mouth.ts` caps the largest final weight at 0.49,
   so none of the Naia visemes can activate. It also never targets I or U.
4. Both files expose custom `think`; `expression.ts` currently maps `think` to
   `neutral` only.
5. Both files contain no embedded glTF animation clips. The hair model has
   spring bone; both have expression-based lookAt. Full-body motion remains the
   external `idle_loop.vrma` only.

Two subsequent scope passes found no additional production path: all TTS/audio
paths converge on `useAvatarStore.setSpeaking`, and `AvatarCanvas` forwards that
state to the mouth controller.

## Plan

1. Add RED tests for binary five-vowel activation, one-hot binary output,
   complete closure, continuous/VRM 0.0 preservation, and custom `think`
   preference with neutral fallback. Verify with focused Vitest.
2. Change only the mouth controller's expression application and the think
   resolver. Binary expressions use deterministic one-hot vowel cycling above
   the library threshold; continuous expressions retain smooth blending while
   cycling all vowels. Verify focused tests and Shell build.
3. Record `FR-AVATAR.1` and the corresponding UC2/S19 behavior, including the
   measured asset capabilities and explicit non-goals. Verify document/code/test
   consistency and full required gates.

Rejected alternatives:

- Re-export assets as continuous morph targets: unnecessary vendor rework and
  would not preserve valid VRM 1.0 binary expressions.
- Raise only the A cap: leaves I/U unused and allows overlapping binary texture
  transforms.
- Implement audio phoneme analysis now: useful follow-up, but outside this
  compatibility bug and #361 already records it as G3.

Pre-mortem:

1. Multiple binary vowels activate together and compose invalid UV offsets —
   prevent with one-hot output and assert at most one nonzero value.
2. Stop leaves the last binary mouth frame open — explicitly write zero to all
   resolved vowels on stop/update and test it.
3. Custom `think` breaks old models — resolve `think` first, then `neutral`.

## Preservation contract

- Baseline ref: `4a525f6886e7e2a8992a11b8e7e9bf1629865b13`
- Intent: extend valid VRM expression compatibility without changing public
  navigation, settings schemas, TTS ownership, NVA behavior, or asset files.
- Preserve surfaces: VRM 0.0 vowels, continuous VRM 1.0 vowels, emotion tags,
  blink/lookAt, idle VRMA, speaking lifecycle, model picker, NVA path.
- Extend surfaces: binary VRM 1.0 vowel application; custom `think` resolution.
- Replace/remove/disable/redirect/migrate surfaces: none.
- Baseline evidence: existing focused unit tests and baseline source.
- Current evidence: focused unit tests, production build, changed-set review.
- Incident history: #361 documented simulated lip sync and the outsourced model
  specification; on 2026-08-13 the supplied files revealed a binary-expression
  compatibility gap; #422 records the bounded correction.

## Artifact ownership

- Design/decision/implementation plan: this progress record
- Requirements: `docs/requirements.md`, `docs/user-scenarios.md`
- Implementation: `packages/shell/src/lib/vrm/{mouth,expression}.ts`
- Tests: adjacent `__tests__/{mouth,expression}.test.ts`
- Review/test report: appended here and synchronized to #422
- Release artifact: commit linked to #422; no release/deployment in scope

## Implementation checkpoint (2026-08-13)

- RED: focused Vitest produced 5 expected failures for binary activation,
  I/U coverage, immediate close, and custom `think` preference.
- GREEN: focused Vitest passed 41/41 after implementation and again after
  formatting.
- Full Shell Vitest: 139 files passed, 2 skipped; 1479 tests passed, 22 skipped.
- Builds: root TypeScript build and Shell production Vite build passed.
- Browser verification: `e2e/pipeline-voice.spec.ts` passed 10/10 in Chromium,
  including STT -> LLM -> TTS, audio playback, interrupt, and return-to-chat.
- Assembly coverage: S69 / UC20 passed with no classification gaps.
- Hygiene: `git diff --check` and conflict-marker scan passed. Existing Biome
  baseline findings (`noExplicitAny`, `noNonNullAssertion`) remain outside this
  change; formatter was applied to all changed TypeScript files.
- Root structure: blocked by pre-existing ignored `tsconfig.build.json`; tracked
  separately in #410 and not changed here.

## Review gate

Status: `NOT_CLEAN / REVIEW_ONLY`.

The deterministic review preflight passed with complexity hash
`sha256:576606bd97422b79bb331d6b059755c4feb9fe01dbd2d9277e4a6df89636cddd`.
Independent review attempts through Claude, Codex, Gemini, and OpenCode did not
produce a valid signed verdict because of timeouts or unavailable credentials.
Under `review-pass`, this checkpoint may be committed locally but must not be
pushed, merged, or described as release-complete until a valid reviewer verdict
is obtained.

## Skill drift

No new reusable verification rule was introduced. The regression is fully
captured by the adjacent deterministic VRM controller tests, so no verify-* skill
creation or update is warranted for this checkpoint.
