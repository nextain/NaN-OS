# Demo Video Pipeline

Pipeline for producing ~3 minute Naia OS promotional/documentation demo videos.

## Overview

Playwright E2E browser recording → Google Cloud TTS Korean narration → ffmpeg merge — a 3-step pipeline.

```
demo-script.ts (scene definitions)
       ↓
demo-video.spec.ts (Playwright recording → WebM + timeline.json)
       ↓
demo-tts.ts (Google Cloud TTS → MP3 × 25)
       ↓
demo-merge.sh (ffmpeg → naia-demo.mp4)
```

## File Structure

| File | Purpose |
|------|---------|
| `shell/e2e/demo-script.ts` | Scene definitions (ID, narration text, duration, phase) |
| `shell/e2e/demo-video.spec.ts` | Playwright recording spec (Mock Tauri IPC) |
| `shell/e2e/demo-tts.ts` | Google Cloud TTS narration MP3 generator |
| `shell/e2e/demo-merge.sh` | ffmpeg video+audio merge |
| `shell/e2e/demo-output/` | Output directory (WebM, timeline.json, TTS, MP4) |

## Scene Composition (25 scenes, ~183s)

### Phase 1: Onboarding (~55s)
intro → provider → apikey → agent-name → user-name → character → personality → messenger → complete

### Phase 2: Main App Tour (~128s)
chat-hello → chat-response → chat-weather → chat-tool-result → chat-time → history-tab → skills-list → skills-detail → channels-tab → agents-tab → diagnostics-tab → settings-ai → settings-voice → settings-memory → progress-tab → outro

## Execution

### Prerequisites
- gcloud CLI authenticated (service account with TTS access)
- ffmpeg and python3 installed
- Playwright: `cd shell && pnpm exec playwright install chromium`

### Commands
```bash
# Step 1: Playwright recording (generates WebM + timeline.json)
cd naia-os/shell && pnpm test:e2e -- demo-video.spec.ts

# Step 2: TTS narration (generates 25 MP3 files)
cd naia-os/shell && npx tsx e2e/demo-tts.ts

# Step 3: ffmpeg merge (produces final MP4)
cd naia-os/shell && bash e2e/demo-merge.sh
```

## Timing Synchronization

Key technology: **SceneTimeline class**

During Playwright test execution, `SceneTimeline` records the actual `Date.now()` offset at each scene transition. This data is saved to `timeline.json`, which `demo-merge.sh` reads to position each TTS MP3 at the exact millisecond offset using ffmpeg's `adelay` filter.

→ Narration stays in sync with video regardless of recording speed variations.

## Mock Tauri IPC

`buildDemoMockScript()` injects `window.__TAURI_INTERNALS__` to run the app in a browser without the real Tauri binary.

Included mock data:
- 12 skills, 3 sessions, 5 audit log entries
- Channel status (Discord, etc.)
- Agent list, diagnostics info
- Chat streaming simulation (SSE-style delayed responses)

## TTS Configuration

| Setting | Value |
|---------|-------|
| Provider | Google Cloud TTS REST API |
| Voice | `ko-KR-Neural2-A` (Korean female) |
| Speaking rate | 0.95 (slightly slower for clarity) |
| GCP project | `project-a8b18af5-b980-43e7-8ec` |
| Auth | gcloud service account token + `x-goog-user-project` header |

## Re-recording Guide

| Change | Steps to Run |
|--------|-------------|
| Video only | Step 1 → Step 3 (TTS cached) |
| Regenerate TTS | Delete `tts/*.mp3` → Step 2 → Step 3 |
| Scene changes | Edit `demo-script.ts` → All 3 steps |
| Add/remove scenes | Edit `demo-script.ts` + `demo-merge.sh` SCENE_TTS map → All 3 steps |

## Known Issues

- Chat errors from mock response format mismatch → check `buildDemoMockScript()` invoke handlers
- Timing drift when Playwright runs slowly (CI) → timeline.json compensates
- TTS 503 errors are transient → automatic retry handles them
