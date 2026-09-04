# Issue 431 performance loop 3 evidence

## Scope

- Baseline: `c0e00c98b54562cf7bdca5fee9b31f4ddc885d7a`
- Review target: the repository HEAD containing this evidence file
- Complexity preflight: regenerated against the final review HEAD before reviewer invocation
- OpenRouter was not used.

## Measured result

- Entry raw: 2,913,442 -> 439,810 bytes (-84.90%)
- Entry gzip: 836,096 -> 138,469 bytes (-83.44%)
- Enforced entry budgets: 500,000 raw / 160,000 gzip bytes
- Shell suite: 1,891 passed, 21 skipped
- Production deferred-chunk Playwright: 2 passed
- TypeScript, production build, core tests, and core build passed.

## Independent reviewer receipts

The checked-in runtime receipts are historical pre-convergence evidence only.
Final exact-HEAD receipts will be attached to issue #431 only after two
consecutive clean rounds from Claude Code, Codex, and OpenCode. Each provider is
invoked directly against the same baseline, implementation HEAD, atom ledger,
original request, and complexity hash above.

## Naia notification receipt

- Sender configuration: named `naia` Discord instance (never `alpha`)
- Recipient: the fixed `discord.proactiveDmRecipientUserId` authorized in the
  local naia instance configuration
- Discord delivery state: `confirmed`
- HTTP status: 200
- Discord message ID: `1545157546187427861`
- Content: the measured bundle reduction, strengthened budgets, validation
  results, and BGM eager-retention decision

No credential or recipient identifier is stored in this repository.

## Next measured loop

BGM remains eager because it owns always-active `bgm_command` and compatibility
`agent_response` listeners (`packages/shell/src/components/BgmPlayer.tsx`, lines
903-908). A later loop may defer it only after extracting both listeners into
an eager lightweight bridge, measuring an additional initial-network reduction,
and proving event delivery before and after the deferred UI module loads. This
is a measured follow-up candidate, not an unverified change in this iteration.

Slide narration requests remain reliable across the new ChatArea loading
boundary: an eager lightweight listener buffers the latest request while the
deferred surface is loading, regardless of chat visibility. The small
`LoadedChatArea` wrapper activates the consumer and replays buffered narration
after a stable effect turn, so React StrictMode's setup-cleanup-setup replay
cannot lose the request; `ChatArea.tsx` itself remains byte-identical to the
baseline. A newer buffered request cancels the superseded one. Unmounting the
deferred surface settles any buffered request as cancelled, while a failed Chat
chunk settles it as failed. A correlated failure or cancellation moves an
active presenter from speaking to paused so it can resume safely. Regression
tests cover the real shared consumer handoff, one-time StrictMode delivery,
hidden chat, replacement cancellation, unmount settlement, and chunk-failure
settlement. Once the Chat chunk is known to have failed, later narration
requests are also settled as failed immediately instead of remaining pending;
retrying the chunk clears that failure state. If a newer live narration arrives
during the activation-to-replay handoff, the buffered predecessor is cancelled
exactly once and only the newer request reaches the consumer.

The production Playwright config still builds the exact checkout when invoked
standalone. CI reuses the production bundle built by its immediately preceding
budget step, avoiding a duplicate build and its former 120-second timeout risk.
