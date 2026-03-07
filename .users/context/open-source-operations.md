<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# AI-Native Open Source Operations Model

How Naia OS operates as an AI-native open source project.

**Related**: [contributing.yaml](../../.agents/context/contributing.yaml) (code-level rules), [charter-draft](charter-draft.md) (philosophy)

---

## Core Position

> **Design WITH AI, not defend AGAINST AI.**

Most open source projects in 2025-2026 are defending against AI contributions (curl shut down bug bounties, Ghostty adopted zero-tolerance, tldraw closed all external PRs). Naia OS takes the opposite approach: structurally embrace AI contributions by making the project context so rich that AI-assisted contributions are high quality by default.

**Key insight**: Rich `.agents/` context → better AI understanding → higher contribution quality.

---

## Five Premises

1. **Minimum Environment**: AI coding tool (Claude Code, Cursor, Windsurf, OpenCode, Gemini, etc.) + Git integration
2. **Bilateral AI**: Both contributors AND maintainers use AI
3. **English Lingua Franca**: Everything on Git is in English; AI translates for the contributor
4. **Mixed Skill Levels**: Beginners to experts; AI adapts guidance to the contributor's level
5. **Communication Flow**: Person → AI → Git (English) → AI → Person

---

## Contribution Types (10)

| # | Type | Difficulty | Description |
|---|------|-----------|-------------|
| 1 | **Translation** | Low | Add `.users/context/{lang}/` or i18n dictionary entries |
| 2 | **Skill** | Medium | Create AI skill in `agent/assets/default-skills/` |
| 3 | **New Feature** | High | Propose or implement new features |
| 4 | **Bug Report** | Low | Report bugs via issue template |
| 5 | **Code/PR** | Medium-High | Pick an issue, submit a PR |
| 6 | **Documentation** | Low-Medium | Improve `.users/context/` docs |
| 7 | **Testing** | Low | Use the app and share feedback |
| 8 | **Design/UX/Assets** | Medium | UI/UX improvements, mockups, icons, VRM avatar models |
| 9 | **Security Report** | Medium-High | Report vulnerabilities via GitHub Security Advisory (GHSA) |
| 10 | **Context** | Medium | Improve `.agents/` context files (equal value to code) |

---

## Contributor Flow

### Onboarding (all types)

1. Clone: `git clone https://github.com/nextain/naia-os.git`
2. Open with any AI coding tool
3. Ask in your language: *"What is this project and how can I help?"*
4. AI reads `.agents/` and explains the project in your language
5. AI recommends contribution type based on your skill level and interest

### Code Contributions

1. Check existing issues or create a new one (AI checks for duplicates)
2. Create branch: `issue-{number}-{short-description}`
3. Code with AI assistance (AI guides patterns, conventions, tests)
4. Self-review with AI (contributing.yaml checklist)
5. Submit PR: English title, AI attribution (`Assisted-by` trailer), small focused PR
6. CI auto-verification: lint, test, license headers, mirror sync

### Non-Code Contributions

- **Translation**: Select English doc → create `{lang}/` dir → translate with AI → PR
- **Bug Report**: Describe to AI in native language → AI checks duplicates → submit English issue
- **Context**: Edit `.agents/` → mirror to `.users/` (en + ko) → verify SPDX headers → PR

---

## Maintainer Flow

### Issue Triage

1. Issue submitted by contributor
2. Auto-labeling via GitHub Agentic Workflow (Phase 2)
   - Type: bug / feature / question / translation / skill / docs / security / context
   - Priority: P0-critical / P1-high / P2-medium / P3-low
   - Component: shell / agent / gateway / os / context
3. Maintainer confirms: valid → assign | needs-info → ask | slop → decline politely

### PR Review (3-layer gates)

| Gate | Mechanism | Purpose |
|------|-----------|---------|
| L1: CI | Build, test, lint, license, mirror sync | Enforce baseline quality |
| L2: AI Review | PR Agent / CodeRabbit (Phase 2) | Detect pattern violations |
| L3: Maintainer | Final human review | Architecture and direction decisions |

---

## Quality Strategy

> **Structure ensures quality, not gatekeeping.**

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| L1: Context | `.agents/` directory | AI understands project before generating code |
| L2: Automation | CI gates | Enforce baseline quality |
| L3: AI Review | PR Agent | Detect pattern violations, security issues |
| L4: Human | Maintainer review | Architecture and direction |
| L5: Escalation | Vouch system (future) | Manage repeat low-quality contributors |

**Core principle**: When L1-L3 are strong enough, L4 burden decreases.

---

## AI Attribution Policy

- AI usage is **welcomed**; **transparency** is required
- Responsibility for AI-generated code lies with the **contributor**
- Attribution is enforced but **not blocking** (educational approach)

### Git Trailer

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.

Assisted-by: Claude Code
```

### PR Disclosure

Checkbox in PR template: AI-assisted / fully AI-generated / no AI used.

---

## Communication

### Language Flow

```
Contributor (Japanese) → AI → Issue/PR (English) → AI → Maintainer (Korean)
Maintainer (Korean) → AI → Review comment (English) → AI → Contributor (Japanese)
```

### Channels

| Channel | Purpose | Language |
|---------|---------|----------|
| GitHub Issues | Bugs, features, questions | English preferred (native allowed) |
| GitHub PRs | Code/doc review | English |
| GitHub Discussions | Design, RFC | English |
| Discord | Real-time community | Multilingual |

### Skill Level Adaptation

| Level | AI Role |
|-------|---------|
| Beginner | Project explanation, dev setup, starter issues |
| Intermediate | Architecture, related code, implementation direction |
| Expert | Core logic, design intent, autonomous support |

---

## Phased Growth

| Phase | Condition | Infrastructure |
|-------|-----------|----------------|
| **1** (current) | 0-5 contributors | Issue/PR templates, CI pipeline, contributing.yaml expansion |
| **2** | 5-20 contributors | GitHub Agentic Workflow, AI PR review, Discussions |
| **3** | 20-100 contributors | Vouch, community reviewers, RFC process |
| **4** | 100+ contributors | Structured governance, distributed decisions |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI slop flood | High | High | L1-L4 layered defense + context investment |
| Security vulnerabilities | Medium | High | CI scanning + maintainer review |
| License violations | Medium | High | CI license check + AI protection rules |
| Maintainer burnout (solo) | High | Critical | Maximize automation + AI review assist |
| Context pollution | Low | Medium | Triple-mirror CI verification |
| Translation quality | Medium | Low | Native reviewers or AI cross-check |

---

## References

- [GitHub "Eternal September of open source"](https://github.blog/open-source/maintainers/welcome-to-the-eternal-september-of-open-source-heres-what-we-plan-to-do-for-maintainers/) (2026-02)
- [arXiv "Vibe Coding Kills Open Source"](https://arxiv.org/abs/2601.15494) (2026-01)
- [Responsible Vibe Coding Manifesto](https://vibe-coding-manifesto.com/)
- [Mitchell Hashimoto Vouch](https://github.com/mitchellh/vouch)
- [GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)
- [AGENTS.md standard](https://agents.md/)

---

*Korean mirror: [.users/context/ko/open-source-operations.md](ko/open-source-operations.md)*
*AI context: [.agents/context/open-source-operations.yaml](../../.agents/context/open-source-operations.yaml)*
