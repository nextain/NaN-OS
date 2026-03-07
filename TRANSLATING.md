# Translating Naia

Help make Naia accessible in your language.

Naia has AI-generated baseline translations for 14 languages across multiple surfaces. We welcome both **new translations** and **native speaker reviews** of existing AI baselines.

AI-assisted translation is encouraged — this project embraces AI collaboration. Add an `Assisted-by: {tool}` git trailer to your commit if you'd like.

## Locale Codes

Use **IETF short codes** matching `shell/src/lib/i18n.ts`:

| Code | Language | Status |
|------|----------|--------|
| `en` | English | Default |
| `ko` | Korean | Maintainer |
| `ja` | Japanese | AI baseline |
| `zh` | Chinese (Simplified) | AI baseline |
| `fr` | French | AI baseline |
| `de` | German | AI baseline |
| `ru` | Russian | AI baseline |
| `es` | Spanish | AI baseline |
| `ar` | Arabic | AI baseline |
| `hi` | Hindi | AI baseline |
| `bn` | Bengali | AI baseline |
| `pt` | Portuguese | AI baseline |
| `id` | Indonesian | AI baseline |
| `vi` | Vietnamese | AI baseline |

> Use `zh`, not `zh-CN`. Regional variants (e.g., `zh-TW`) can be added later when needed.

## Translation Surfaces

| # | Surface | Repo | Location | Scale | Tier |
|---|---------|------|----------|-------|------|
| 1 | Context docs | naia-os | `.users/context/{lang}/*.md` | 7 files in scope | Priority |
| 2 | Shell UI strings | naia-os | `shell/src/lib/i18n.ts` | ~314 keys, 14 locales | Priority |
| 3 | README | naia-os | `READMES/README.{lang}.md` | 14 files | Welcome |
| 4 | Demo video (TTS + subtitles) | naia-os | `shell/e2e/demo-output/{lang}/` | 14 langs | Welcome |
| 5 | Portal UI strings | naia.nextain.io | `src/i18n/dictionaries/{lang}.ts` | ~470 lines/lang | Priority |
| 6 | Manual (text) | naia.nextain.io | `src/content/manual/{lang}/*.md` | 20 pages/lang | Priority |
| 7 | Manual (images) | naia.nextain.io | `public/manual/{lang}/*.png` | ~39 images/lang | Welcome |
| 8 | Manual (video) | naia.nextain.io | `public/manual/{lang}/demo.mp4` | 1 per lang | Welcome |
| 9 | FAQ | naia.nextain.io | `src/content/home/{lang}/faq.md` | en + ko only | Welcome |
| 10 | Legal docs | naia.nextain.io | `src/content/legal/{lang}/*.md` | 5 docs, en + ko only | Welcome |
| 11 | Blog posts | naia.nextain.io | `public/posts/{slug}/index.{lang}.md` | 14 langs | Low |
| 12 | README | naia.nextain.io | `README.{lang}.md` | ko only | Low |
| 13 | Corporate site | about.nextain.io | `messages/{lang}.json` (next-intl) | en + ko only | Low |

**Tier guide:**
- **Priority** — Start here. Directly affects user experience.
- **Welcome** — Valuable contributions that improve the overall experience.
- **Low** — Nice to have. Tackle after priority surfaces are reviewed.

> Surfaces #4 and #8 are related. Demo videos in naia-os (`shell/e2e/demo-output/`) are the source; they get copied to naia.nextain.io (`public/manual/{lang}/demo.mp4`) for the web manual.

## How to Contribute

### Mode A: New Translation

For surfaces that don't have your language yet (e.g., FAQ, legal docs for non-en/ko languages).

1. Find the English source file
2. Create your language directory if it doesn't exist
3. Translate the file
4. Submit a PR to the correct repo

### Mode B: Native Review

For surfaces that already have an AI-generated baseline (most UI strings, manuals, READMEs).

1. Read the existing translation
2. Compare against the English source
3. Fix inaccuracies, unnatural phrasing, or mistranslations
4. Submit a PR with your fixes

### Mode C: Screenshot Capture

For localized manual images (`public/manual/{lang}/*.png`).

**Prerequisites:**
- Naia Shell development environment set up ([Getting started](CONTRIBUTING.md#getting-started))
- Or a running Naia OS installation

**Steps:**
1. Launch Naia Shell and change language to your target locale in Settings
2. Navigate to the screen matching the English screenshot
3. Capture the screenshot (same area/dimensions as the English version)
4. Save with the **same filename** as `public/manual/en/` (e.g., `main-screen.png`)
5. Place in `public/manual/{lang}/`
6. Submit a PR to `naia.nextain.io`

> Some languages are missing 3 screenshots vs English (`chat-response.png`, `settings-lab-connected.png`, `settings-theme.png`). These are welcome contributions.

## Per-Repo Guide

### naia-os

**Repo:** [github.com/nextain/naia-os](https://github.com/nextain/naia-os)

#### Context Docs (Surface #1)

Translate English Markdown files from `.users/context/` to `.users/context/{lang}/`.

```
.users/context/contributing.md          # English source
.users/context/{lang}/contributing.md   # Your translation
```

Start with `contributing.md` and `philosophy.md` — they are short.

- Preserve `<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->` header
- Translate all content (no omissions)
- Do not modify the English source
- See [Translation Scope — Context Docs](#translation-scope--context-docs) below for which files to translate

#### Shell UI Strings (Surface #2)

File: `shell/src/lib/i18n.ts`

This is a single TypeScript file with inline translations for all 14 locales. AI baselines exist for all languages — native review is the primary contribution mode.

Find your locale's entries and fix any unnatural translations:

```ts
"settings.title": { ko: "...", en: "Settings", ja: "...", zh: "设置", ... },
```

#### README (Surface #3)

Files: `READMES/README.{lang}.md`

AI baselines exist for all 14 languages. Review and fix your language version.

#### Demo Video (Surface #4)

Location: `shell/e2e/demo-output/{lang}/`

Contains `timeline.json` (subtitles) and TTS audio. These are generated by a pipeline — see `.agents/context/demo-video.yaml` for the process. Subtitle text review is welcome.

### naia.nextain.io

**Repo:** [github.com/nextain/naia.nextain.io](https://github.com/nextain/naia.nextain.io)

> PRs for surfaces below go to this repo, not naia-os.

#### Portal UI Strings (Surface #5)

Files: `src/i18n/dictionaries/{lang}.ts`

TypeScript dictionary files (~470 lines each). AI baselines exist for all 14 languages.

#### Manual Text (Surface #6)

Files: `src/content/manual/{lang}/*.md` (20 pages per language)

AI baselines exist for all 14 languages. Review and fix your language version.

#### Manual Images (Surface #7)

Files: `public/manual/{lang}/*.png`

See [Mode C: Screenshot Capture](#mode-c-screenshot-capture) above.

#### Manual Video (Surface #8)

Files: `public/manual/{lang}/demo.mp4`

These are copies of the demo videos generated in naia-os (Surface #4). Subtitle/TTS review contributions are welcome via Surface #4.

#### FAQ (Surface #9)

Files: `src/content/home/{lang}/faq.md`

Currently only `en/` and `ko/` exist. New translations welcome.

#### Legal Docs (Surface #10)

Files: `src/content/legal/{lang}/*.md` (terms, privacy, refund, contact, donation)

Currently only `en/` and `ko/` exist. New translations welcome.

> **Disclaimer:** Community translations of legal documents are provided for convenience only. The English version is the legally binding document. Please include a disclaimer line at the top of your translated legal file:
> `> This is an unofficial translation. The [English version](/en/{page}) is the legally binding document.`
>
> Replace `{page}` with the actual page name (`terms`, `privacy`, `refund`, `contact`, `donation`).

#### Blog Posts (Surface #11)

Files: `public/posts/{slug}/index.{lang}.md`

AI baselines exist for all 14 languages. Review and fix your language version.

#### README (Surface #12)

Currently only `README.ko.md` exists alongside the English `README.md`. New language versions are welcome.

### about.nextain.io

**Repo:** [github.com/nextain/about.nextain.io](https://github.com/nextain/about.nextain.io)

> This is a separate repo. PRs go here, not naia-os.

#### Corporate Site (Surface #13)

Files: `messages/{lang}.json` (next-intl format, ~376 lines)

Currently only `en.json` and `ko.json` exist. New translations welcome. File format is JSON key-value:

```json
{
  "hero.title": "Your translation here",
  "hero.description": "Your translation here"
}
```

## Translation Scope — Context Docs

Not all context docs need community translation. Internal developer docs are out of scope.

### Priority (start here)

| File | Description |
|------|-------------|
| `contributing.md` | Contribution guide |
| `philosophy.md` | Core philosophy |

### Welcome

| File | Description |
|------|-------------|
| `vision.md` | Project vision |
| `donation.md` | Donation info |
| `i18n.md` | Internationalization guide |
| `brand.md` | Brand guidelines |
| `open-source-operations.md` | Open source operational model |

### Not in scope

Files like `architecture.md`, `plan.md`, `testing.md`, `distribution-troubleshooting.md`, `openclaw-sync.md`, etc. are internal developer docs and do not need community translation.

## Quality Criteria

- Accurate translation from the English source (not paraphrased)
- No content omission or addition
- SPDX license headers preserved — keep the `<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->` line at the top of `.md` files. This is a standard identifier that marks the file's open source license. Do not remove or change it.
- File structure and Markdown formatting maintained
- Image filenames must match the English counterparts exactly within your `{lang}/` directory (e.g., `en/main-screen.png` → `zh/main-screen.png`, not `zh/主屏幕.png`). The manual references images by filename.

### How to verify your translation

| Surface | How to check |
|---------|-------------|
| Context docs (.md) | View on GitHub — Markdown renders automatically |
| Shell UI (i18n.ts) | Run `cd shell && pnpm run tauri dev`, change language in Settings |
| Portal UI / Manual / FAQ | Run `cd naia.nextain.io && npm run dev`, switch language in header |
| README | View on GitHub |

### RTL languages (Arabic)

Arabic (`ar`) is right-to-left. When capturing screenshots for Arabic, the UI layout may be mirrored. This is expected — capture as-is.

## PR Submission

### Branch naming

```
translation/{lang}-{surface}
```

Example: `translation/zh-context-docs`, `translation/fr-portal-ui`

### PR title

```
docs(i18n): add/fix {lang} translation for {surface}
```

Example: `docs(i18n): add zh translation for contributing guide`

### PR description

- Reference Issue #8: `Contributes to #8`
- Do NOT use `Closes #8` (it's a standing invitation for all languages)
- List which files were translated or reviewed
- Note if AI-assisted

### Which repo?

| Surface | PR goes to |
|---------|-----------|
| #1-4 (Context, Shell UI, README, Demo) | `nextain/naia-os` |
| #5-12 (Portal, Manual, FAQ, Legal, Blog) | `nextain/naia.nextain.io` |
| #13 (Corporate site) | `nextain/about.nextain.io` |

## Translation Status

`-` = not started, `AI` = AI baseline (needs native review), `ok` = native reviewed

### naia-os

| Lang | Context docs | Shell UI | README | Demo |
|------|:---:|:---:|:---:|:---:|
| en | ok | ok | ok | ok |
| ko | ok | ok | ok | ok |
| ja | - | AI | AI | AI |
| zh | PR | AI | AI | AI |
| fr | - | AI | AI | AI |
| de | - | AI | AI | AI |
| ru | - | AI | AI | AI |
| es | - | AI | AI | AI |
| ar | - | AI | AI | AI |
| hi | - | AI | AI | AI |
| bn | - | AI | AI | AI |
| pt | - | AI | AI | AI |
| id | - | AI | AI | AI |
| vi | - | AI | AI | AI |

### naia.nextain.io

| Lang | Portal UI | Manual text | Manual img | Manual video | FAQ | Legal | Blog | README |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| en | ok | ok | ok | ok | ok | ok | ok | ok |
| ko | ok | ok | ok | ok | ok | ok | ok | ok |
| ja | AI | AI | AI | AI | - | - | AI | - |
| zh | AI | AI | AI | AI | - | - | AI | - |
| fr | AI | AI | AI | AI | - | - | AI | - |
| de | AI | AI | AI | AI | - | - | AI | - |
| ru | AI | AI | AI | AI | - | - | AI | - |
| es | AI | AI | AI | AI | - | - | AI | - |
| ar | AI | AI | AI | AI | - | - | AI | - |
| hi | AI | AI | AI | AI | - | - | AI | - |
| bn | AI | AI | AI | AI | - | - | AI | - |
| pt | AI | AI | AI | AI | - | - | AI | - |
| id | AI | AI | AI | AI | - | - | AI | - |
| vi | AI | AI | AI | AI | - | - | AI | - |

### about.nextain.io

| Lang | Corporate site |
|------|:---:|
| en | ok |
| ko | ok |
| Others | - |

## Adding a New Language

Adding a language not in the 14 supported locales requires code changes (medium difficulty):

1. **naia-os Shell** — Add locale to `Locale` type union and add entries for all keys in `shell/src/lib/i18n.ts`
2. **naia.nextain.io** — Create `src/i18n/dictionaries/{lang}.ts`, add to `src/i18n/config.ts`
3. **about.nextain.io** — Create `messages/{lang}.json`, update next-intl config

Open an issue first to discuss before starting.

## Context Mirror Management

The project uses a triple-mirror architecture (`.agents/` + `.users/context/` + `.users/context/ko/`). Currently, community translation directories (`.users/context/{lang}/`) are maintained per-language by contributors.

If you'd like to maintain the context mirror for your language on an ongoing basis, mention it in your PR or open an issue. We welcome dedicated language contributors who can keep translations in sync as the project evolves.

## Related

- [CONTRIBUTING.md](CONTRIBUTING.md) — General contribution guide (including rewards policy)
- [Issue #8](https://github.com/nextain/naia-os/issues/8) — Translation tracking issue
- [`.agents/context/i18n.yaml`](.agents/context/i18n.yaml) — Technical i18n architecture
