<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Multi-Project Workspace Guide

> Mirror: `.agents/context/multi-project-workspace.yaml`

## Purpose

Guide for maintainers and power users who manage multiple projects from a single workspace (e.g., `~/dev/` with multiple repos). Single-project contributors (git clone one repo) do NOT need this.

---

## Context Layering

Project-level context takes precedence over workspace-level context.

**Resolution order:**
1. Project entry point (e.g., `naia-os/AGENTS.md`)
2. Project `.agents/` context files
3. Workspace entry point (e.g., `~/dev/CLAUDE.md`)
4. Workspace `.agents/` context files

---

## Name Collision Awareness

Files with the same name at workspace and project level may have different content.

**Known case:** `development-cycle.yaml`
- Workspace root: 27 lines (lightweight, typos/config)
- Project (naia-os): 217 lines (full coding cycle with TDD and security review)
- **Resolution**: Always use the project-internal version for coding work.

---

## Work-Logs Strategy

**Single-project** (default): `work-logs/` in project root (gitignored), `{username}/` subdirectory.

**Multi-project**: Two options:
1. **Per-project** (recommended): Each project's `work-logs/` directory. AI finds them naturally.
2. **Centralized**: Separate repo (e.g., `docs-work-logs/`). Cross-project visibility, but requires workspace-specific paths.

---

## File Lock Protocol

For parallel AI sessions in the same workspace. **Not needed for single-project contributors.**

- **Lock file**: `.claude/file-locks.json` (relative to workspace root)
- Before editing: check if file is locked by another session
- Lock with owner = branch name
- Unlock when done
- Files in `free` array can be freely modified

---

## Related Files

- **SoT**: `.agents/context/multi-project-workspace.yaml`
- **Korean mirror**: `.users/context/ko/multi-project-workspace.md`
