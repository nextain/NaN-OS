# Naia account Azure model connection — issue #396

## Scope

This Shell slice only connects the existing Naia account/provider pipeline to
`grok-4.3`, `deepseek-v4-pro`, `gpt-5.6-sol`, `gpt-5.6-luna`, and the quota-blocked
`claude-opus-5`. It covers catalog display, capability metadata,
selection, persistence, reload and ordinary chat responses.

Shell Coding Workers, Pi task lifecycle and Workspace coding UX are explicitly
deferred to the next large Workspace improvement issue.

## Azure Foundry extension (#399)

- `gpt-5.6-sol` and `gpt-5.6-luna` are live Azure routes with controlled tool-call evidence.
- `claude-opus-5` is catalogued with the Anthropic Messages protocol but remains
  `quota_blocked` and cannot be applied while this subscription has zero quota.
- Gateway pricing is the final customer price (official source price × 1.10).
  Shell now displays that value directly instead of applying a second 10% markup.
- Verification: 99 focused registry/Settings tests, 1,391 full Shell regression
  tests, and the production build pass (13 environment/opt-in tests skipped).
- Adversarial primary-evidence review found and fixed the Azure GPT-5.6
  `max_tokens` incompatibility. The real AnyLLM Azure SDK path then returned one
  tool call from each Sol and Luna deployment. External review CLIs timed out,
  so no multi-AI consensus is claimed for this extension.

## Traceability

| ID | User scenario | Feature (FE) | Verification |
|---|---|---|---|
| REQ-SHELL-NAIA-001 | Signed-in user sees both models under the Naia account. | static fallback plus gateway catalog merge | registry/catalog unit + Settings FE test |
| REQ-SHELL-NAIA-002 | Selection survives save and restart. | existing `naia-settings/config.json` SoT roundtrip | config contract + Tauri settings E2E |
| REQ-SHELL-NAIA-003 | Ordinary chat reaches the exact model through the Naia key. DeepSeek requests contain no `tools`/`tool_choice`; Grok preserves the existing tool policy. | existing Shell-to-Agent pipeline resolves model tool policy, no new transport | request-body capture: DeepSeek upstream once/no tools, Grok tool policy preserved |
| REQ-SHELL-NAIA-004 | Tool support and Azure provenance are truthful. | map `azure:*` catalog entries into Naia and consume `supports_tools`/`upstream_provider`; provenance is `unknown` without live metadata | catalog mapping plus absent/stale metadata tests |
| REQ-SHELL-NAIA-005 | Catalog failure uses only a static display/capability fallback. Chat execution never changes Grok↔DeepSeek, Gemini/OpenCode, provider, or DeepSeek's fail-closed no-tool policy. | separate catalog fallback from execution fallback | negative fetch/chat exact-model and stale-catalog request-body assertions |

## Deferred

- model-to-coding-role eligibility
- Coding Worker request/RPC changes
- start, cancel, resume and progress UI
- Workspace review and coding process redesign

## Verification

Run unit/contract tests, Shell typecheck/build, controlled Shell-to-Agent chat
integration and the Harness-Book-derived manual. Coding-worker tests are not part
of this issue's Done condition.

## Implementation verification — 2026-07-30

- Shell registry/capability/Settings tests: 93 passed.
- Shell core tests: 230 passed.
- Shell core TypeScript build and package production build: PASS.
- Paired Agent request-body capture: PASS — exact DeepSeek model keeps
  `supportsTools=false`, so `tools`/`tool_choice` are absent; Grok policy is not
  remapped.
- Missing/omitted gateway metadata leaves provenance/lifecycle `unknown` while
  DeepSeek remains no-tools fail-closed.
- No Coding Worker, Pi lifecycle, or Workspace coding UX file was changed.
- Live Naia/Azure ordinary chat: `OPERATIONAL_UNVERIFIED` because no credential
  is present in the validation environment.
