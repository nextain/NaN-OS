# Contributing to Naia

## You don't need to ask anyone

```bash
git clone https://github.com/nextain/naia-os.git
cd naia-os
# Open with any AI coding tool (Claude Code, Cursor, Copilot, Gemini, etc.)
# Ask in your language: "What is this project and how can I help?"
```

The `.agents/` directory gives AI full project context. It will explain the vision, architecture, roadmap, and what you can work on — **in whatever language you speak**.

## Any language is welcome

Write issues, PRs, and comments in **any language**. Maintainers use AI translation.

Code, commits, and context files should be in English — but if you can't, submit anyway. We'll help.

## 10 ways to contribute

| # | Type | Difficulty | How |
|---|------|-----------|-----|
| 1 | **Translation** | Low | Add your language to `.users/context/{lang}/` |
| 2 | **Skill** | Medium | Create an AI skill in `agent/assets/default-skills/` |
| 3 | **New Feature** | High | Open an issue → discuss → implement |
| 4 | **Bug Report** | Low | Describe the bug → open an issue |
| 5 | **Code / PR** | Medium-High | Pick an issue → branch → code → test → PR |
| 6 | **Documentation** | Low-Medium | Improve docs in `.users/context/` |
| 7 | **Testing** | Low | Use the app and share feedback |
| 8 | **Design / UX / Assets** | Medium | UI/UX improvements, icons, VRM avatar models |
| 9 | **Security Report** | Medium-High | Report via [GitHub Security Advisory](https://github.com/nextain/naia-os/security/advisories) |
| 10 | **Context** | Medium | Improve `.agents/` context files — equal value to code |

## Getting started

### Prerequisites

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (for Tauri build)
- System packages: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Development run

```bash
cd shell && pnpm install
cd ../agent && pnpm install
cd ../shell && pnpm run tauri dev
```

### Tests

```bash
cd shell && pnpm test                # Shell unit tests
cd agent && pnpm test                # Agent unit tests
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust tests
```

## Code contribution process

1. **Issue first** — Pick an existing issue or create a new one
2. **Branch** — `issue-{number}-{short-description}`
3. **Code** — Follow existing patterns. AI reads `.agents/context/agents-rules.json` for conventions.
4. **Test** — TDD preferred: write test → minimal code → refactor
5. **Context** — If your change affects architecture, update `.agents/` + `.users/` in the same PR
6. **PR** — Title: `type(scope): description` (e.g., `feat(agent): add weather skill`)

### PR checklist

- [ ] Tests included (new code requires new tests)
- [ ] Tests pass (`pnpm test`)
- [ ] App actually runs (not just type-check)
- [ ] Context files updated if needed (`.agents/` + `.users/`)
- [ ] License headers on new files
- [ ] Commit messages in English

### One PR = code + tests + context

Never submit code without tests. If your change affects architecture or workflows, include context file updates in the same PR.

### PR size

Under 20 files recommended. Smaller PRs get reviewed faster.

## AI usage

AI usage is welcome and encouraged. If you used an AI tool, adding an `Assisted-by` trailer to your commit is appreciated (but not required):

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.

Assisted-by: Claude Code
```

## Context contributions

Context contributions (`.agents/` files) are valued **equally** to code contributions. One good context file prevents 100 low-quality AI PRs.

When editing context:
1. Edit `.agents/` (YAML/JSON, English)
2. Mirror to `.users/context/` (Markdown, English)
3. Mirror to `.users/context/ko/` (Markdown, Korean)
4. Keep `SPDX-License-Identifier: CC-BY-SA-4.0` headers

## Language principle

| Scope | Language |
|-------|----------|
| Issues, PR descriptions | Any language welcome |
| Code, commits, context files | English |
| Work-logs (personal notes) | Your preferred language (tip: keep in a separate private repo) |

## Development workflow

For feature-level work, we follow **issue-driven development**:

```
ISSUE → UNDERSTAND → SCOPE → INVESTIGATE → PLAN → BUILD → REVIEW → E2E TEST → SYNC → COMMIT
```

Details: [`.agents/workflows/issue-driven-development.yaml`](.agents/workflows/issue-driven-development.yaml)

## Translation

Want to help translate? See [TRANSLATING.md](TRANSLATING.md) for the full guide — locale codes, file locations, scope, and how to submit.

Quick start: [Issue #8](https://github.com/nextain/naia-os/issues/8)

## Rewards

Naia OS is an early-stage open source project. We do not have a bounty or reward program at this time — all contributions are volunteer work.

We genuinely appreciate every contribution. As the project and company grow, we plan to explore contributor reward programs in the future.

## License

- **Source code**: [Apache License 2.0](LICENSE)
- **AI context** (`.agents/`, `.users/`, `AGENTS.md`): [CC-BY-SA 4.0](CONTEXT-LICENSE)

By contributing, you agree to these terms.
