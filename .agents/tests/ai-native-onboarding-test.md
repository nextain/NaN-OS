# AI-Native Onboarding & Contribution Test Scenarios

These scenarios verify that AI coding agents (Claude Code, Codex, Gemini, OpenCode, Cline, etc.) correctly understand the project and guide contributors when reading `.agents/` context.

## How to Test

1. Clone the repo fresh (or open a new AI session in this repo)
2. Copy each scenario prompt and paste it into your AI coding agent
3. Compare the response against the expected behavior
4. Check each item in the verification checklist at the bottom

---

## Test 1: First Contact — "What is this project?"

**Prompt:**
> What is this project and how can I help?

**Expected:**
- Agent explains Naia OS (AI OS based on Bazzite, avatar-centric)
- Agent lists contribution types (at least: translation, skill, code, bug report, docs)
- Agent mentions that any language is welcome
- Agent does NOT ask the contributor to read lengthy documentation first

---

## Test 2: Contribution Types — Know All 10

**Prompt:**
> What are all the ways I can contribute to this project?

**Expected:**
- Agent lists at least these 10 types: Translation, Skill, New Feature, Bug Report, Code/PR, Documentation, Testing, Design/UX/Assets, Security Report, Context Contribution
- Agent mentions that context contributions are valued equally to code
- Agent mentions appropriate issue templates for each type

---

## Test 3: Beginner Guidance

**Prompt:**
> I'm a beginner developer. I've never contributed to open source before. What should I do?

**Expected:**
- Agent recommends low-difficulty contributions (Translation, Bug Report, Testing, Documentation)
- Agent explains the onboarding steps (clone → open with AI → ask)
- Agent does NOT overwhelm with architecture details
- Agent is encouraging and welcoming

---

## Test 4: Translation Contribution Flow

**Prompt:**
> I want to translate the project docs to Japanese. How do I do this?

**Expected:**
- Agent explains: create `.users/context/ja/` directory
- Agent mentions the English originals are in `.users/context/`
- Agent mentions opening a `translation.yml` issue template
- Agent mentions CI will check structural sync with English
- Agent mentions SPDX license headers are required

---

## Test 5: Code Contribution Flow

**Prompt:**
> I want to fix a bug. What's the process?

**Expected:**
- Agent describes: pick issue → create branch (`issue-{N}-{desc}`) → code → self-review → PR
- Agent mentions TDD (test first)
- Agent mentions "code + tests + context = one PR" (all three required together)
- Agent mentions the PR checklist (tests included, tests pass, app runs, context updated)
- Agent mentions AI attribution (`Assisted-by` trailer)
- Agent mentions commit messages must be in English

---

## Test 6: AI Attribution Awareness

**Prompt:**
> Do I need to disclose that I'm using an AI tool?

**Expected:**
- Agent confirms: yes, AI disclosure is required
- Agent explains: use `Assisted-by: {tool}` git trailer
- Agent explains: check the AI disclosure box in the PR template
- Agent clarifies: this is enforced but not blocking (educational, not punitive)
- Agent affirms: AI usage is welcomed, transparency is the requirement

---

## Test 7: Context Contribution Understanding

**Prompt:**
> I think the architecture documentation is outdated. Can I update it?

**Expected:**
- Agent confirms: yes, context contributions are welcome and valued equally to code
- Agent explains the triple-mirror sync: `.agents/` → `.users/context/` → `.users/context/ko/`
- Agent mentions SPDX license headers (CC-BY-SA-4.0)
- Agent mentions using the `context_contribution.yml` issue template
- Agent warns about cascade rules (changes propagate)

---

## Test 8: Security Report Handling

**Prompt:**
> I found a security vulnerability in the agent. Should I open an issue?

**Expected:**
- Agent says: do NOT open a public issue
- Agent directs to GitHub Security Advisory (private vulnerability reporting)
- Agent explains this is for responsible disclosure

---

## Test 9: Language Barrier Test

**Prompt (in Japanese):**
> このプロジェクトに貢献したいのですが、英語が苦手です。日本語で参加できますか？

**Expected:**
- Agent responds in Japanese (or the contributor's language)
- Agent confirms: any language is welcome
- Agent explains: Git records (code, commits) should be English, but AI translates
- Agent explains: issues and PR descriptions can be in native language
- Agent reassures: language should not be a barrier

---

## Test 10: Skill Contribution Flow

**Prompt:**
> I want to create a new AI skill that checks the weather. How?

**Expected:**
- Agent explains skill location: `agent/assets/default-skills/`
- Agent mentions OpenClaw `skill.json` spec
- Agent mentions naming convention: Naia-specific skills use `naia-{name}/`, upstream OpenClaw skills keep original names
- Agent mentions using the `skill_proposal.yml` issue template
- Agent mentions testing approach: integration tests preferred, mock-based unit tests acceptable for isolated logic

---

## Test 11: PR Template Awareness

**Prompt:**
> I'm about to submit a PR. What should I include?

**Expected:**
- Agent describes the PR template sections:
  - What changed (with issue reference)
  - Type of change (checkbox)
  - AI disclosure (checkbox)
  - Checklist (tests, verify, context, license, English commits)
- Agent mentions title format: `type(scope): description`
- Agent mentions keeping PRs small and focused (under 20 files)

---

## Test 12: Quality Strategy Understanding

**Prompt:**
> How does this project handle quality control for contributions?

**Expected:**
- Agent describes the layered quality strategy:
  - L1: Context (`.agents/` ensures AI understands the project)
  - L2: Automation (CI gates)
  - L3: AI Review (PR Agent, Phase 2)
  - L4: Human Judgment (maintainer review)
- Agent mentions that rich context is the primary quality mechanism
- Agent does NOT describe the project as having a "gatekeeping" approach

---

---

## Test 13: Artifact Storage

**Prompt:**
> I've been investigating a bug and have detailed findings. Where should I save them?

**Expected:**
- Agent recommends posting findings as a GitHub Issue comment (not as a file in the repo)
- Agent mentions Issue comments provide transparency and are accessible to all contributors
- Agent mentions `.agents/` is for permanent context only, not work-in-progress artifacts
- Agent may mention `work-logs/` for personal notes

---

## Test 14: Language Principle

**Prompt:**
> I want to write a progress report about my work. Should I write it in Korean?

**Expected:**
- Agent distinguishes between public and private writing
- Agent says: Issue comments, PR descriptions, commits → English (public, transparent)
- Agent says: work-logs, personal notes → any language (private, native language)
- Agent does NOT say "everything must be in English"

---

## Test 15: Work-Logs Convention

**Prompt:**
> Where do I keep my personal notes while working on this project?

**Expected:**
- Agent mentions `work-logs/` directory (gitignored, project-internal)
- Agent mentions `{username}/` subdirectory convention
- Agent mentions file naming: `YYYYMMDD-NN-topic.md`
- Agent mentions these are private (gitignored) and in contributor's preferred language

---

## Test 16: Multi-Project Workspace

**Prompt:**
> I manage multiple repos in ~/dev/. How should I set up my AI context?

**Expected:**
- Agent references `.agents/context/multi-project-workspace.yaml`
- Agent explains context layering (project-level takes precedence over workspace-level)
- Agent mentions potential name collisions between workspace and project files
- Agent does NOT assume single-project setup is the only option

---

## Verification Checklist

After running all tests, verify:

- [ ] Agent correctly identified the project (Test 1)
- [ ] Agent listed all 10 contribution types (Test 2)
- [ ] Agent adapted to beginner level (Test 3)
- [ ] Agent explained translation flow with triple-mirror (Test 4)
- [ ] Agent described code contribution with TDD and attribution (Test 5)
- [ ] Agent correctly explained AI attribution policy (Test 6)
- [ ] Agent valued context contributions equally to code (Test 7)
- [ ] Agent directed security reports to GHSA, not public issues (Test 8)
- [ ] Agent responded in contributor's language (Test 9)
- [ ] Agent knew skill contribution details (Test 10)
- [ ] Agent described full PR template (Test 11)
- [ ] Agent described quality strategy without "gatekeeping" framing (Test 12)
- [ ] Agent recommended Issue comments for findings, not file storage (Test 13)
- [ ] Agent distinguished public (English) vs private (any language) (Test 14)
- [ ] Agent knew work-logs convention (Test 15)
- [ ] Agent referenced multi-project workspace guide (Test 16)
- [ ] Agent was welcoming and encouraging in all responses

## Scoring

| Score | Result |
|-------|--------|
| 16/16 | Full AI-native onboarding works |
| 12-15/16 | Mostly works, minor gaps in context |
| 8-11/16 | Partial — context needs enrichment |
| <8/16 | Context is insufficient — major gaps |
