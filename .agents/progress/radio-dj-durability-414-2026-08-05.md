# Radio DJ durability #414 completion evidence

## Session and branch boundary

- Shell worktree: isolated Radio DJ worktree
- Shell branch: `agent/radio-dj-long-playwright-handoff`
- Agent worktree: isolated Radio DJ integration worktree
- Agent branch: `agent/radio-dj-integration-414`
- The other session's `issue/3090-desktop-integration` VoxCPM2 checkout was not modified. Its media-runtime integration commit `c0343d5c` was incorporated into the Radio branch and the resulting ChatArea contract was reconciled.

## Implemented boundary

- Shell reports bounded recent 20/favorite 10 track context and keeps current/recent duplicate filtering authoritative.
- Every Agent-owned play carries `mode=radio_dj`; observed `ended` continues as one completed transition remark, fresh selection, and correlated observed `playing` before the title is introduced.
- Agent actively recalls only tagged user-authored explicit DJ preferences from naia-memory. Local exact records and tombstones win; malformed/assistant records are ignored and memory failure falls back to local/session context.
- Panel PNG/JPEG/WebP data URIs are bounded, signature checked, removed from tool text, correlated as an inline image, and mapped to OpenAI-compatible, Anthropic, and Ollama image inputs. A Shell music-surface-specific capture producer remains outside this implementation.
- Shell iframe error/loading timeout recovery, prepared queue fallback, bounded new search, stop/replacement fencing, recent normalized duplicate exclusion, favorites operations, and BGM sidecar restart remain covered.

## Verification evidence

- Focused Shell Vitest: 27 passed.
- Shell Radio targeted Playwright: 20 passed.
- Existing BGM Playwright baseline: 3 passed.
- Shell package Vitest: 135 files passed, 2 skipped; 1,500 tests passed, 13 skipped.
- Shell contract run: 25 files, 231 tests passed.
- ChatArea/media runtime targeted contracts: 36 passed.
- Paired Linux Tauri/WebKitGTK Radio run: 3 passed, including exact paired Agent boot, owned sidecar health, and observed A `ended` to B playback. The final pre-merge rerun used clean Agent `main` `e751e91f744e6c4fc8cdf13b4451c86a96f72cc2`, matched the required commit and proto hash, and again passed all 3 cases.
- Agent focused contracts/integration: 10 files, 106 tests passed; Agent build passed.
- Local wall-clock fixture: first track remained active for 60 minutes, then all nine following tracks transitioned in order; 1 passed in 1.0 hour.
- Logical long soak: 60 unique tracks at eight logical minutes each, two-hour checkpoint at track 15, eight-hour media clock, recent-history bound 20; passed in about 13 seconds.
- Actual YouTube sanity: 11:58:09 video `lh4JdZTJe7k`, embed HTTP 200, `readyState=4`, no media error; 30-second smoke passed.
- Full Shell Playwright: 222 collected, 178 passed, 44 intentional live/manual/backlog skips, 0 failed in 14.6 minutes. An earlier isolated Chromium crash passed immediately in isolation and in the final full run. The NVA sync gate now uses a 10ms absolute floor when the baseline offset is already near zero; it passed five consecutive samples and the final full run while preserving the p95/p99 limits.
- Actual YouTube eight-hour wall-clock run passed: the two-hour checkpoint was media clock 7,203.0 seconds and the final clock was 28,800.6 seconds, with no media/page error; Playwright reported 1 passed in 8.0 hours. The long-lived Chromium renderer RSS was 640,776 KiB at the two-hour checkpoint, later dropped to 616,864 KiB at 6h24, and was 686,816 KiB at 7h55, so the observed process did not show monotonic accumulation.
- Root TypeScript build and Shell production TypeScript/Vite build passed. Conflict-marker and diff whitespace scans found no issue. The changed production source adds no unlocalized UI literal; the i18n output-stage contract passed 2 tests.
- Independent review status: the paired Agent review completed `CLEAN` with `opencode/nemotron-3-ultra-free` (OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`). The first Shell review attempt was rejected after the reviewer constructed an invalid doubled absolute path; a corrected attempt read the target files but exceeded the review harness time limit before returning a verdict. The only allowed alternate, `opencode/deepseek-v4-flash-free`, also timed out during its minimal probe, so no external Shell `CLEAN` is claimed. Shell acceptance instead remains based on the full deterministic/native/build evidence above and direct source review.

## Product-preservation review

- Immutable baseline: Shell `5e27a36bb024bf24d1b3c1960849dcb257eae87b` (`origin/main` at integration start).
- The diff removes or renames no product path, route, entry script, package target, or installer workflow. Media-runtime routing replaces duplicate Shell-side speech synthesis/resend work behind the same ChatArea journey; Radio DJ extends the existing BGM surface.
- Current probes cover setup/home/workspace navigation, Settings ownership, chat/tool flow, proactive speech, pipeline voice, NVA rendering/sync, BGM, TTS fallbacks, history, onboarding, and installer pairing. The final full Playwright and both production builds are green.
- The repository's generic preservation skill cannot issue formal `RELEASE_ELIGIBLE` because its signed contract/runner receipts and planning/integration multi-role attestations are globally marked pending. Its formal delivery classification therefore remains `REVIEW_ONLY`; this record does not claim otherwise. The user supplied an explicit turn-level instruction to merge main and deploy after the tests, which is the external-action authority used for this handoff.

## Honest operational boundaries

- The eight-hour actual YouTube run uses one real long video; it is not the RD-LONG-02 mixed-length 20-video physical session. Mixed lengths and transitions are covered deterministically by local fixtures.
- Physical sleep/resume, network disconnect/recovery, and multi-account UI operation were not performed.
- The Agent can deliver an existing panel screenshot to supported multimodal providers, but the Radio DJ does not yet produce a privacy-cropped music-surface screenshot. The current YouTube surface is a cross-origin app-background iframe: browser pixel extraction is origin-blocked, while the existing OS region capture would also include chat/settings overlays above that background. Reusing it would violate the music-only privacy boundary, so no unsafe capture was wired.
- The full Agent suite had 1,434 passed, 10 skipped, and 12 baseline/environment failures in unavailable KB compiler dist imports, external-state memory reload, current CLI credential fixture state, and one CLI timeout. The focused green set and build are the change gate.
