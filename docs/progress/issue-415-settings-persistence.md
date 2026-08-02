# Issue #415 — Settings persistence and runtime reload

Status: P04 implementation complete; P05 full Shell and native acceptance verification in progress (2026-08-03).

## Scope

- Make `naia-settings/config.json` and `ui-config.json` the explicit workspace sources of truth; localStorage is a render cache only.
- Separate `subLlm*` and `memoryLlm*` ownership and keep `llmRoles` plus legacy migration mirrors consistent.
- Store every stripped credential in the secure store and restore it after restart without writing plaintext to workspace files.
- Prevent derived `NAIA_*`/`OPENAI_BASE_URL` aliases from re-entering application config.
- Verify UI save, native file round-trip, cache-clear/reload, agent reload, and actual memory behavior.

## Confirmed failures

1. `memoryLlmProvider` was interpreted as both sub LLM and memory LLM.
2. several TTS and memory credentials were stripped from files but absent from the secure-store key list.
3. derived environment aliases survived provider changes and could resurrect stale Ollama routing.
4. expert-role fallback hydration was missing.
5. Agent `ReloadSettings` replaced the main model only; the memory instance remained startup-bound (tracked by naia-agent #106).
6. memory native tests still referenced the removed gateway configuration path.
7. settings save sent a fire-and-forget reload message and swallowed every failure, so the UI could report success while memory kept the previous provider.

## Verified implementation

- Agent #106 (`b327712`) now rebuilds memory on `ReloadSettings`/`SetWorkspace`, drains in-flight work, flushes the old backend, atomically swaps a ready replacement, and retains the old instance on failure.
- Shell uses a result-bearing `reload_agent_settings` native command. A running Agent reload failure rejects the settings save; no running Agent is represented as `available:false` for next-start application.
- The paired Agent commit and proto digest are pinned in both `agent-pairing.json` and Rust `build.rs`.
- A real Windows Shell restart loaded `nextain/gpt-5.6-sol`; the Agent log reported `memory ... llm=nextain` and repeated `committed=true` reloads. The persisted file remained `main -> sub -> memory` with no Ollama role resurrection.

## Completion evidence required

- deterministic unit/contract tests for role migration, secret round-trip, derived-key removal, and ordered persistence;
- native Shell save → file → cache clear → reload tests for memory, weather/DJ, model sorting, and local GPU profiles;
- Agent startup → reload → next-turn memory extraction test;
- real Shell restart and memory recall observation with no Ollama route unless explicitly selected.
