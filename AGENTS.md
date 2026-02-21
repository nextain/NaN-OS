# Naia OS — Agent Entry Point

## Context Loading (MUST read first)

1. `.agents/context/agents-rules.json` — Project rules (SoT)
2. `.agents/context/project-index.yaml` — Context index + mirroring rules

## On-demand Context

Load these when relevant to the current task:

| Context | When to read |
|---------|-------------|
| `.agents/context/vision.yaml` | Discussing direction, purpose, positioning |
| `.agents/context/architecture.yaml` | **Gateway/agent integration (ALWAYS read before gateway work)** |
| `.agents/context/plan.yaml` | Planning or implementing any phase |
| `.agents/context/careti-reuse.yaml` | Porting code from project-careti |
| `.agents/context/testing.yaml` | Writing or running tests |
| `.agents/workflows/development-cycle.yaml` | Before any coding (ALWAYS) |

## Mirroring

Every `.agents/context/*.yaml` has a `.users/context/*.md` mirror (Korean, detailed).
When updating one side, update the other.

## Quick Reference

- **Language**: TypeScript (shell/agent/gateway), Rust (Tauri)
- **Package manager**: pnpm
- **Formatter**: Biome
- **Test**: Vitest + tauri-driver (WebDriver), integration-first TDD
- **Logging**: Structured Logger only (no console.log)
- **Security**: Permission tiers 0-3
- **Commits**: English, `<type>(<scope>): <description>`
- **Response language**: Korean
