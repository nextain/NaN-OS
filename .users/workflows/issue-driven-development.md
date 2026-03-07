<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Issue-Driven Development Cycle

> Mirror: `.agents/workflows/issue-driven-development.yaml`

## Purpose

Upstream-first, code-centric development methodology for feature-level work (new features, broad bug fixes). Default workflow for all feature-level development.

For non-feature changes (typos, config values, simple directives), use `development-cycle.yaml`.

---

## 13 Phases

### User-Involved (front-loaded)

| # | Phase | Gate | Description |
|---|-------|------|-------------|
| 1 | **Issue** | — | Create or receive a GitHub Issue |
| 2 | **Understand** | ✓ | Confirm understanding with user |
| 3 | **Scope** | ✓ | Define investigation scope and depth |
| 4 | **Investigate** | — | Code-centric investigation (loop until 2 consecutive clean passes) |
| 5 | **Plan** | ✓ | Draft plan, iterate until stable (2 consecutive clean passes), user approves |

### AI-Autonomous (with quality gates)

| # | Phase | Description |
|---|-------|-------------|
| 6 | **Build** | Implement per plan (TDD) |
| 7 | **Review** | Self-review loop (2 consecutive clean passes) |
| 8 | **E2E Test** | End-to-end test through real user path (fully clean) |
| 9 | **Post-test Review** | Re-review after tests (2 consecutive clean passes) |
| 10 | **Sync** | Update .agents/ + .users/ context |
| 11 | **Sync Verify** | Verify context accuracy (2 consecutive clean passes) |
| 12 | **Report** | Summarize results to user and Issue |
| 13 | **Commit** | Commit with Issue reference, create PR |

---

## Key Principles

- **Upstream analysis first**: Read the actual code before designing
- **Minimal modification**: Follow upstream patterns, overlay customizations
- **No guessing**: Never assume — read actual implementation
- **Structural problem first**: When tests fail, check doc-code mismatches before blaming tools
- **Working code preservation**: Never break working code by "improving"

---

## Iteration Rule

All loops terminate after **two consecutive clean passes** (not just one). A single clean pass can be a false negative.

---

## Artifact Storage

| Type | Location | Language |
|------|----------|----------|
| Intermediate (findings, plans) | GitHub Issue comments | English |
| Final (rules, processes) | `.agents/` context files | English |
| Personal notes | `work-logs/{username}/` (gitignored) | Contributor's preferred |

---

## Work-Logs Convention

- **Location**: `work-logs/` (gitignored, project-internal)
- **Convention**: `{username}/YYYYMMDD-NN-topic.md`
- **Language**: Contributor's preferred language
- **Backup**: Optional — `git init` inside `work-logs/` for private backup

---

## Language Principle

| Scope | Language |
|-------|----------|
| Git commits, Issue comments, PR titles | English |
| Work-logs, personal notes | Contributor's preferred |
| AI responses | Contributor's preferred |

---

## Related Files

- **SoT**: `.agents/workflows/issue-driven-development.yaml`
- **Coding cycle**: `.agents/workflows/development-cycle.yaml`
- **Contributing guide**: `.agents/context/contributing.yaml`
