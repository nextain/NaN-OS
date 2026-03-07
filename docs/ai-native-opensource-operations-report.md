<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# AI-Native Open Source Operations Model — Design Report

- **Issue**: naia-os#9
- **Date**: 2026-03-07
- **Status**: Draft

---

## 1. Background: The Eternal September of Open Source

### 1.1 What Changed

In 2025-2026, the open source ecosystem faces an unprecedented crisis. AI coding tools have eliminated the barrier to writing code, but the cost of **reviewing** code remains unchanged.

GitHub calls this the **"Eternal September of open source"** — a reference to the 1993 event when AOL opened Usenet access and the annual flood of new users in September became year-round. The same thing is now happening in open source: AI gives everyone the ability to generate code.

### 1.2 Key Events

| Project | Response | Reason |
|---------|----------|--------|
| **curl** | Shut down bug bounty | 20% of submissions were AI-generated junk |
| **Ghostty** | Zero-tolerance for AI contributions | Only accepted issues allow AI contributions |
| **tldraw** | Closed all external PRs | Maintainer review burden unsustainable |

### 1.3 Academic Evidence: "Vibe Coding Kills Open Source"

Key findings from arXiv paper [2601.15494]:

- **Tailwind CSS**: npm downloads kept climbing, but documentation traffic dropped ~40% and revenue dropped ~80%
- **Stack Overflow**: Activity fell ~25% within six months of ChatGPT's launch
- **Mechanism**: Vibe coding "uses" OSS but doesn't read docs, report bugs, or participate in communities
- **Conclusion**: To sustain OSS, vibe-coded users must replace at least 84% of what direct users contribute

### 1.4 Industry Response: Defend vs Embrace

**Defend against AI**:
- Vouch (Mitchell Hashimoto) — explicit trust management, vouching system
- PR Kill Switch — disabling PRs entirely for some repositories
- Mandatory AI disclosure + rejection policies

**Design with AI**:
- GitHub Agentic Workflows — Markdown-defined AI automation
- AGENTS.md standard (OpenAI, Linux Foundation AAIF) — adopted by 60,000+ projects
- Responsible Vibe Coding Manifesto — small focused PRs, AI attribution, human accountability

**What both sides agree on**: AI itself isn't the problem — **misusing AI** is the problem. Ghostty is built with AI. Daniel Stenberg uses AI too.

---

## 2. Naia OS Position: AI-Native Open Source

### 2.1 How We Differ

| Aspect | Traditional Open Source | Naia OS |
|--------|----------------------|---------|
| AI stance | **Defend** against AI contributions | **Design** AI contributions into the workflow |
| Contribution assumption | Contributor reads and writes code directly | Contributor reads and writes WITH AI |
| Onboarding | Read README → CONTRIBUTING.md | Clone → AI explains project → no language barrier |
| Context | Human-readable docs only | `.agents/` (AI) + `.users/` (human) dual structure |
| Language | English required | Any language welcome; AI translates to English |
| Trust | Judged by code quality | Judged by code + context quality |

### 2.2 Five Premises

1. **Minimum environment**: AI coding tool + Git integration
2. **Bilateral AI**: Both contributors and maintainers use AI
3. **English lingua franca**: Everything on Git is in English; AI translates on behalf of the contributor
4. **Mixed skill levels**: Beginners to experts; AI adapts guidance accordingly
5. **Communication flow**: Person → AI → Git (English) → AI → Person

### 2.3 Philosophical Foundation

The core question from charter-draft.yaml:
> **"Can we teach AI that collaboration is more efficient than working alone?"**

Naia OS's answer:
- Code is no longer the glue that holds communities together — AI replaced that
- **Context** is the new open source infrastructure (philosophy, architecture decisions, contribution rules, workflows)
- Better shared context = everyone's AI works more efficiently

---

## 3. Operations Model Design

### 3.1 Contribution Types (10)

Seven from the contribute page plus three additions:

| # | Type | Description | Difficulty |
|---|------|-------------|-----------|
| 1 | **Translation** | Add `.users/context/{lang}/`, i18n dictionary entries | Low |
| 2 | **Skill** | Create AI skill in `agent/assets/default-skills/` | Medium |
| 3 | **New Feature** | Propose or implement new features | High |
| 4 | **Bug Report** | Discover a bug → file an issue | Low |
| 5 | **Code/PR** | Pick an issue → submit a PR | Medium-High |
| 6 | **Documentation** | Improve `.users/context/` docs | Low-Medium |
| 7 | **Testing** | Use the app and share feedback | Low |
| 8 | **Design/UX/Assets** | UI/UX improvements, mockups, icons, VRM avatar models | Medium |
| 9 | **Security Report** | Discover vulnerability → report via GitHub Security Advisory | Medium-High |
| 10 | **Context Contribution** | Improve `.agents/` context files (equal value to code) | Medium |

> **Why 10 types?** Naia OS is avatar-centric (philosophy.yaml `avatar_centric`), so VRM/3D asset contributions are as important as code. Context contribution (#10) stems from the key insight: "One good `.agents/` file prevents 100 AI slop PRs."

### 3.2 Contributor Flow

```
[Contributor] ─── native language intent ───→ [AI Coding Tool]
                                                    │
                                             Clone repo & read .agents/
                                                    │
                                             AI explains project (native lang)
                                                    │
                                             Recommend contribution type
                                                    │
                                             ┌──────┴──────┐
                                             ▼              ▼
                                       Code contrib    Non-code contrib
                                             │              │
                                       AI assists      AI assists
                                       coding          docs/translation
                                             │              │
                                       AI writes       AI writes
                                       English commit  English docs
                                             │              │
                                             └──────┬──────┘
                                                    │
                                             Submit PR/Issue (English)
                                             + AI attribution
                                             + Assisted-by trailer
                                                    │
                                             [GitHub — English record]
```

#### 3.2.1 Onboarding (all contribution types)

1. **Clone**: `git clone https://github.com/nextain/naia-os.git`
2. **Open with AI tool**: Claude Code, Cursor, Windsurf, OpenCode, Gemini, etc.
3. **Ask in native language**: "What is this project and how can I help?"
4. **AI reads `.agents/` and guides**: vision, architecture, roadmap, available contribution areas
5. **Choose contribution type**: AI recommends based on contributor's skill level and interests

#### 3.2.2 Code Contribution Process

```
1. Check issues (select existing or create new)
   └─ AI checks for duplicates, searches existing issues

2. Create branch
   └─ issue-{number}-{short-description}

3. Write code (AI-assisted)
   └─ AI guides existing patterns, coding conventions, test guidelines
   └─ Follow contributing.yaml code rules

4. Self-review (AI-assisted)
   └─ AI reviews against contributing.yaml checklist
   └─ Lint, type-check, run tests

5. Submit PR
   └─ English title (type(scope): description)
   └─ Body in native language OK (AI translates)
   └─ AI attribution required (Assisted-by trailer)
   └─ Small, focused PR (under 20 files recommended)

6. CI auto-verification
   └─ Lint, type-check, tests
   └─ License header check
   └─ Context mirror sync check
```

#### 3.2.3 Non-Code Contribution Process

**Translation**:
```
1. Select English doc from .users/context/
2. Create .users/context/{lang}/ directory
3. Translate with AI assistance (preserve technical terms)
4. Submit PR → CI checks structural sync with English original
```

**Bug Report**:
```
1. Describe issue to AI in native language
2. AI searches existing issues for duplicates
3. AI helps fill English issue template
4. Submit issue
```

**Context Contribution**:
```
1. Improve .agents/ YAML/JSON files
2. Mirror changes to .users/context/ (English) and .users/context/ko/ (Korean)
3. Verify SPDX license headers (CC-BY-SA-4.0)
4. Submit PR → CI checks triple-mirror sync
```

### 3.3 Maintainer Flow

```
[GitHub — English record] ──→ [Maintainer's AI] ──→ [Maintainer (Luke)]
                                    │                       │
                              AI classifies            Judges in native
                              issues/PRs               language (Korean)
                              AI assists review        Approve/request/decline
                              AI translates
                                    │                       │
                                    ▼                       ▼
                              Automation (CI/Bot)     Human judgment (quality/direction)
```

#### 3.3.1 Issue Triage

```
1. Issue submitted (contributor)
   │
2. Auto-labeling (GitHub Agentic Workflow)
   ├─ Type: bug / feature / question / translation / skill / docs / security
   ├─ Priority: P0-critical / P1-high / P2-medium / P3-low
   ├─ Component: shell / agent / gateway / os / context
   └─ Duplicate check: auto-link similar issues
   │
3. Maintainer confirms
   ├─ Valid issue: confirm labels + assign
   ├─ Needs info: request details (AI generates question in contributor's language)
   └─ AI slop: politely decline + guide to contributing docs
```

#### 3.3.2 PR Review

```
1. PR submitted (contributor)
   │
2. CI auto-verification (Gate 1)
   ├─ Build succeeds
   ├─ Tests pass
   ├─ Lint/format passes
   ├─ License headers present
   └─ AI attribution check
   │
3. AI review assist (Gate 2)
   ├─ PR Agent / CodeRabbit auto-review
   ├─ Change scope summary
   ├─ Potential issues flagged
   └─ Context mirror sync status
   │
4. Maintainer review (Final gate)
   ├─ Code quality
   ├─ Architecture fit
   ├─ Convention compliance
   └─ Approve / Request changes / Decline
       │
       ├─ Request changes: AI translates feedback to contributor's language
       └─ Approve: squash merge + release notes
```

#### 3.3.3 AI Slop Defense Strategy

Naia OS chooses **"structure ensures quality"** over gatekeeping:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **L1: Context** | `.agents/` directory | AI understands project before generating code |
| **L2: Automation** | CI gates (build, test, lint) | Enforce baseline quality |
| **L3: AI Review** | PR Agent auto-review | Detect pattern violations, security issues |
| **L4: Human Judgment** | Maintainer final review | Architecture and direction decisions |
| **L5: Escalation** | Vouch system (when community grows) | Manage repeat low-quality contributors |

Core principle: **When L1-L3 are strong enough, L4 burden decreases.** The richer the `.agents/` context, the higher the quality of AI-assisted contributions.

### 3.4 Communication Structure

#### 3.4.1 Language Flow

```
Contributor (Japanese) → AI → Issue/PR (English) → AI → Maintainer (Korean)
Maintainer (Korean) → AI → Review comment (English) → AI → Contributor (Japanese)
```

- Everything recorded on Git: **English**
- Issue body, PR description: native language allowed (English preferred, AI translates)
- Code comments, commit messages: **English required**
- AI responses: contributor's preferred language

#### 3.4.2 Communication Channels

| Channel | Purpose | Language |
|---------|---------|----------|
| GitHub Issues | Bugs, feature requests, questions | English (native allowed) |
| GitHub PRs | Code/doc review | English |
| GitHub Discussions | Design discussion, RFC | English |
| Discord (optional) | Real-time community | Multilingual (per channel) |

#### 3.4.3 Skill Level Adaptation

| Level | AI's Role |
|-------|-----------|
| **Beginner** | Project explanation, dev setup, starter issue recommendations |
| **Intermediate** | Architecture explanation, related code guidance, implementation direction |
| **Expert** | Core logic explanation, design intent, autonomous contribution support |

AI reads `.agents/` context and adapts responses to the contributor's question level. Same context for all levels → consistent project understanding.

---

## 4. Infrastructure Gap Analysis

### 4.1 Current State vs Required

| Infrastructure | Current | Needed | Priority |
|----------------|---------|--------|----------|
| `.agents/context/contributing.yaml` | Exists (code-focused) | 10 contribution type processes | P1 |
| `.agents/context/open-source-operations.yaml` | Did not exist | Full operations model | P1 |
| GitHub Issue templates | bug_report.yml only | 6 templates by contribution type | P1 |
| GitHub PR template | Minimal (3 lines) | AI disclosure + checklist | P1 |
| CI pipeline | Does not exist | Build/test/lint + license check | P1 |
| GitHub Agentic Workflow | Does not exist | Issue triage automation | P2 |
| AI PR review | Does not exist | CodeRabbit or PR Agent | P2 |
| `.github/DISCUSSION_TEMPLATE/` | Does not exist | RFC, question templates | P3 |
| Vouch integration | Does not exist | When community grows | P3 |
| `CONTRIBUTING.md` | Exists (minimal) | Expand to cover 10 types | P2 |

### 4.2 GitHub Issue Templates (New)

Currently only `bug_report.yml` exists. Additions needed:

1. **feature_request.yml** — New feature proposals
2. **translation.yml** — Translation contributions
3. **skill_proposal.yml** — AI skill proposals
4. **docs_improvement.yml** — Documentation improvements
5. **context_contribution.yml** — `.agents/` context improvement proposals

**Security reports**: Use GitHub Security Advisories (GHSA) instead of a custom template. Enable via repo Settings → Security → Private vulnerability reporting.

All templates should include:
- "Any language is welcome" notice
- AI tool usage checkbox
- Reference to relevant `.agents/` context files

### 4.3 GitHub PR Template (Expand)

Current:
```markdown
## What changed?
**Any language is welcome.**
```

Needed:
```markdown
## What changed?
<!-- Reference issues with #number -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Translation
- [ ] Documentation
- [ ] Context (.agents/) update
- [ ] Skill

## AI disclosure
- [ ] AI-assisted (specify tool below)
- [ ] Fully AI-generated
- [ ] No AI used

AI tool(s) used: <!-- e.g., Claude Code, Cursor, Copilot -->

## Checklist
- [ ] Tests included (new code requires new tests)
- [ ] Tests pass (`pnpm test`)
- [ ] App actually runs (VERIFY step)
- [ ] Context files updated if needed (.agents/ + .users/)
- [ ] License headers present on new files
- [ ] Commit messages in English
- [ ] AI attribution included (`Assisted-by:` trailer)

**Any language is welcome in the description.**
```

### 4.4 CI Pipeline

```yaml
# Required GitHub Actions
1. build-test.yml
   - pnpm install → build → test
   - Rust cargo test

2. lint-format.yml
   - Biome lint + format check

3. license-check.yml
   - .agents/ files: SPDX-License-Identifier check
   - .users/ files: HTML license comment check

4. context-mirror-check.yml
   - .agents/ ↔ .users/context/ ↔ .users/context/ko/ sync check
   - Section count, header structure comparison

5. ai-attribution-check.yml (optional)
   - Check PR for AI disclosure checkbox
   - Check commits for Assisted-by trailer (warn only, don't block)
```

### 4.5 GitHub Agentic Workflow (P2)

```markdown
---
name: Issue Triage
on:
  issues:
    types: [opened]
permissions:
  issues: write
agent: copilot
---

Read the issue title and body.
Classify by type: bug, feature, question, translation, skill, docs, security.
Add the appropriate label.
Check for similar open issues and link them if found.
If the issue lacks reproduction steps (for bugs),
add a comment asking for more details.
Keep all responses respectful — any language is welcome.
```

---

## 5. AI Attribution Policy

### 5.1 Principles

- AI usage is welcomed; **transparency** is required
- **Responsibility** for AI-generated code lies with the contributor
- Attribution is **enforced but not blocking** (educational approach)

### 5.2 Git Trailers

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.
Includes rate limiting and error handling.

Assisted-by: Claude Code
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### 5.3 PR Description

AI tool usage is marked via checkbox in PR body. Enforced, but reviewers simply verify — no automated blocking on missing disclosure.

---

## 6. Context-Centric Quality Strategy

### 6.1 Key Insight

> When `.agents/` context quality goes up, AI contributor code quality goes up too.

This is why Naia OS chose this strategy over Vouch or PR Kill Switch. When AI **understands** the project well before generating code, the probability of producing "AI slop" decreases.

### 6.2 Context Investment Priority

| Priority | Context | Effect |
|----------|---------|--------|
| P0 | `agents-rules.json` (SoT) | Defines baseline behavior for all AI agents |
| P0 | `contributing.yaml` | Guides contribution process |
| P0 | `architecture.yaml` | Code structure understanding |
| P1 | `philosophy.yaml` | Project direction |
| P1 | `testing.yaml` | Testing guide |
| P2 | Per-contribution-type workflows | Specific processes |

### 6.3 Value of Context Contributions

Code contributions and context contributions are treated as **equal**. Reason: One good context file prevents 100 AI slop PRs.

---

## 7. Risks and Mitigations

### 7.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI slop flood | High | High | L1-L4 layered defense + context quality investment |
| Security vulnerability insertion | Medium | High | CI security scanning + maintainer review |
| License violations | Medium | High | CI license check + AI protection rules |
| Maintainer burnout (solo) | High | Critical | Maximize automation + AI review assist |
| Context pollution | Low | Medium | Triple-mirror CI verification |
| Translation quality degradation | Medium | Low | Native reviewers or AI cross-verification |

### 7.2 Maintainer Burnout Mitigation (Critical)

Current: 1 maintainer (Luke). This is the highest risk.

**Mitigation strategy**:
1. **Maximize automation**: CI handles 80% of quality gates
2. **AI review assist**: PR Agent handles basic review → maintainer only judges
3. **Issue triage automation**: Agentic Workflow handles classification + duplicate detection
4. **Structured contributions**: Templates ensure information quality → reduces verification time
5. **Grow community reviewers**: Promote trusted contributors to reviewer role

### 7.3 Phased Rollout

| Phase | Condition | Introduction |
|-------|-----------|-------------|
| **Phase 1** (current) | 0-5 contributors | Issue templates + PR templates + CI + contributing.yaml expansion |
| **Phase 2** | 5-20 contributors | GitHub Agentic Workflow + AI PR review |
| **Phase 3** | 20-100 contributors | Vouch system + community reviewers + RFC process |
| **Phase 4** | 100+ contributors | Structured governance + distributed decision-making |

---

## 8. Action Items

### Immediate (Phase 1 — Issue #9 scope)

- [x] Operations model report (this document)
- [x] `.agents/context/open-source-operations.yaml`
- [x] `.users/context/open-source-operations.md` (English mirror)
- [x] `.users/context/ko/open-source-operations.md` (Korean mirror)
- [x] Expand `contributing.yaml` (10 contribution types + AI attribution)
- [x] Add GitHub Issue templates (feature_request, translation, skill, docs, context)
- [x] Expand GitHub PR template (AI disclosure + checklist)
- [x] AI-native onboarding test scenarios (`.agents/tests/ai-native-onboarding-test.md`)
- [x] Context update test methodology (`.agents/tests/context-update-test-methodology.md`)
- [ ] Build CI pipeline (build, test, lint, license) — Issue #12

### Short-term (Phase 2)

- [ ] Set up GitHub Agentic Workflow (issue triage)
- [ ] Adopt AI PR review tool (CodeRabbit or PR Agent)
- [ ] Expand CONTRIBUTING.md
- [ ] Enable GitHub Discussions

### Medium-term (Phase 3)

- [ ] Evaluate Vouch integration
- [ ] Community reviewer program
- [ ] RFC process
- [ ] Contributor recognition system (CONTRIBUTORS.md, leaderboard)

---

## 9. Research References

### External Sources

1. **GitHub, ["Welcome to the Eternal September of open source"](https://github.blog/open-source/maintainers/welcome-to-the-eternal-september-of-open-source-heres-what-we-plan-to-do-for-maintainers/)** (2026-02)
   — AI contribution flood, maintainer burnout, GitHub's response plan

2. **arXiv [2601.15494], ["Vibe Coding Kills Open Source"](https://arxiv.org/abs/2601.15494)** (2026-01)
   — Quantitative impact of vibe coding on OSS sustainability

3. **[Responsible Vibe Coding Manifesto](https://vibe-coding-manifesto.com/)**
   — Best practices for AI-assisted contributions in open source

4. **Mitchell Hashimoto, [Vouch](https://github.com/mitchellh/vouch)**
   — Explicit trust management system, Trustdown (.td) format

5. **[GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)** (Technical Preview, 2026-02)
   — Markdown-based AI automation, issue triage

6. **[AGENTS.md](https://agents.md/)** (Linux Foundation AAIF)
   — Open standard for AI coding agent guidance, 60,000+ projects adopted

7. **PullFlow, ["AI Agents in Open Source: Evolving the Contribution Model"](https://pullflow.com/blog/ai-agents-open-source-contribution-model/)**
   — AI agent onboarding support, human+AI collaboration model

8. **Continue Blog, ["We're Losing Open Contribution"](https://blog.continue.dev/were-losing-open-contribution)**
   — Analysis of declining open contribution

### Internal Sources

9. **charter-draft.yaml** — AI-era open source community charter draft
10. **philosophy.yaml** — Core philosophy (AI sovereignty, privacy, transparency)
11. **contributing.yaml** — Current contribution guide

---

## 10. Conclusion

### Key Insights for AI-Native Open Source

1. **Context is the new infrastructure**: When `.agents/` directories are rich enough, AI contributor code quality naturally rises. This is a more fundamental solution than Vouch or PR Kill Switch.

2. **AI is on both sides**: Not just contributors — maintainers also use AI for review and triage. The operations model must be designed for bilateral AI usage.

3. **Language barriers are solved**: AI translation makes "any language welcome" practically achievable. The lingua franca is English, but the entry barrier is native language.

4. **Phased growth is essential**: From a solo maintainer to a 100-person community, infrastructure must scale gradually. Both over-investment and under-investment are risks.

5. **Transparency builds trust**: Enforcing AI attribution without blocking creates a healthy community in the long term — educational, not punitive.

### Naia OS's Position

While most open source projects are trying to **block** AI contributions, Naia OS is one of the first serious attempts to **structurally embrace** them.

If this succeeds, it becomes the reference model for AI-native open source.
If it fails, it still produces valuable experimental data for the ecosystem.

Either way, it's worth trying.
