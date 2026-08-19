# #467 Naia slide presenter

- GitHub: https://github.com/nextain/naia-shell/issues/467
- Branch: `feat/slide-presenter-467`
- Started: 2026-08-20
- Status: implemented and verified

## Decision

The first playback format is PDF. It is stable, already supported by the Shell's `react-pdf` stack, and can play the current investor deck without conversion. ODP/PPTX remain import formats for a later conversion boundary; they do not create a parallel renderer.

## Gate ledger

- P01: `docs/user-scenarios.md` — `UC-SLIDE-PRESENTER-*`
- P02: state, tool, component, and Playwright coverage mapped in the same section
- P03: `docs/requirements.md` — `FR-SLIDE.1~5`, `NFR-SLIDE.1`
- P04: done — 1,628 Vitest tests passed, production build passed, and two Playwright journeys passed
- P05: done — the current 21-page Nextain IR PDF and speaker script rendered, narrated through the Shell browser-TTS fixture, advanced, paused, and passed desktop/narrow visual review

## Intended slice

Built-in Slides app, one-page PDF renderer, Markdown speaker-note parser, deterministic presentation state, Shell-owned narration request/completion bridge, active-app context for questions, keyboard/accessible controls, and automated UI verification with the current 21-page Nextain IR PDF.

## Verification evidence

- `pnpm -C packages/shell test`: 159 files passed, 2 skipped; 1,628 tests passed, 21 skipped
- `pnpm -C packages/shell build`: TypeScript and Vite production build passed
- `playwright test e2e/467-slide-presenter.spec.ts`: 2 passed
- Real-deck acceptance: `nextain-seed-ir-2026-08-19.pdf` loaded as 21 pages with its Markdown speaker script; browser-TTS completion advanced from slide 1 to slide 2 and pause retained the current page
- Visual acceptance: desktop and narrow screenshots showed rendered slide pixels, speaker notes, progress, and controls without horizontal clipping
