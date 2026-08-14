# Issue 417 — Herdr-native Workspace integration

Date: 2026-08-14
Release base: `26ff9d35` (`v0.1.7`)
Status: v0.1.7 candidate implemented and automated verification complete; packaged native acceptance remains open

## User outcome

Herdr is embedded directly in Naia Shell Workspace, not placed beside a second
Shell session experience. The left navigation order is **File Tree → Spaces →
Agents**. Choosing a Space shows the existing Herdr terminal/tab/pane work surface
on the right. Choosing an Agent focuses the Herdr space, tab, pane, and terminal
that own that agent.

Clicking a file path in a Herdr terminal changes the active left section to File
Tree, expands and reveals the file, and opens it in the Workspace viewer at the
referenced line and column. Closing or going back from the viewer restores the
previous Herdr pane and focus. The file-tree root follows the active Herdr Space's
worktree/CWD.

## Architecture decision

- Shell owns the unified React navigation rail and document viewer.
- Herdr remains the runtime source of truth for spaces, tabs, panes, terminals,
  agents, focus, and session restoration.
- The embedded Herdr client uses a Shell-owned `HERDR_CONFIG_PATH` with
  `sidebar_start_collapsed = true` and `sidebar_collapsed_mode = "hidden"`.
  This hides only Herdr's duplicate presentation; it does not alter the user's
  global Herdr configuration or reimplement the right-hand Herdr work surface.
- Shell reads Herdr's public snapshot and invokes its public `workspace focus`
  and `agent focus` commands. Herdr 0.8.0 does not expose a public event stream
  or absolute pane-focus command, so P1 uses single-flight snapshot polling with
  stale-response rejection. Private TUI sockets and raw PTY input are not
  application control protocols.
- The right work surface has two states: Herdr and Viewer. Viewer is a reversible
  drill-in, not a permanent top/bottom split. The Herdr xterm remains mounted
  while Viewer is visible; therefore its tab/pane focus is preserved rather than
  reconstructed through an unavailable absolute pane-focus API.

## Three-layer destination

- L3: Naia/naia-agent owns user intent, issue portfolio, approvals, context
  exchange, and orchestration policy.
- L2: one Herdr issue leader coordinates an issue.
- L1: Herdr workers execute bounded implementation and verification tasks.

The staged delivery is: (P1) embed the unified Herdr experience, (P2) connect
terminal paths and viewer focus, (P3) add typed Naia observation/control and
context exchange, then (P4) complete L3→L2→L1 orchestration.

## Preservation and retirement contract

| Baseline capability | Disposition | Gate |
|---|---|---|
| Workspace route and one ChatPanel lifetime | preserve | route/lifetime regression |
| FileTree, Quick Open, document tabs/viewer, editor line reveal | preserve and integrate | unit + Playwright + native path-click |
| PTY transport, resize, cleanup, process-exit handling | preserve and reuse | native PTY regressions |
| Session/worktree/agent tests and fixtures | preserve until replacement parity is proven | no test deletion as a substitute for passing |
| Herdr terminal/tab/pane surface | adopt unchanged on the right | native visual and interaction evidence |
| Shell duplicate session/agent presentation | retire only from the active render path after parity | preservation probes remain |
| Obsolete Shell lifecycle ownership/tools | remove only after Herdr public-API replacement coverage | descriptor/handler and negative regressions |
| Coding Workers orchestration | retire only when P3/P4 replacement is implemented | no premature deletion in P1/P2 |

Commit `2886b7bb` violated this contract by deleting broad PTY, viewer, session,
worktree, course, screenshot, and E2E evidence while reporting a reduced suite as
a full pass. Its completion claims are invalid. The safe implementation starts
from the stated baseline and makes additive, coverage-preserving changes.

## UC and feature-evidence map

| UC | Expected behavior | Automated evidence | Integration evidence |
|---|---|---|---|
| UC-HW-01 enter Workspace | unified rail is File Tree, Spaces, Agents; right side is real Herdr | layout/render + no-duplicate-active-surface tests | native visual capture |
| UC-HW-02 select Space | public API focus; right Herdr surface follows; reverse focus syncs rail | snapshot poll reducer + focus command tests | real multi-space native run |
| UC-HW-03 select Agent | focus owning workspace/tab/pane/terminal and reveal selected agent | agent mapping/failure tests | real two-agent native run |
| UC-HW-04 click file path | activate File Tree, expand/reveal/select path, open viewer at line/column | parser, root guard, FileTree imperative focus, viewer tests | alternate-screen path click E2E |
| UC-HW-05 return to Herdr | close/back reveals the still-mounted Herdr surface and restores xterm input focus without changing its pane | navigation state + mounted-lifetime tests | keyboard/mouse native E2E |
| UC-HW-06 change Space | FileTree root follows worktree/CWD without losing safe viewer state | root transition and out-of-root tests | multi-worktree native E2E |
| UC-HW-07 failures | missing Herdr/API disconnect/exited PTY is honest and retryable; no duplicate process | lifecycle/error/retry tests | missing binary + reconnect smoke |
| UC-HW-08 preserved journeys | Quick Open, document AI action, independent file/command tools still work | existing full regression suite | existing Playwright/native suites |

## Issue structure

- `naia-shell#417` — main epic and architecture/source of truth.
- P1 child — unified File Tree/Spaces/Agents rail, embedded Herdr client, public
  snapshot/focus bridge, lifecycle and preservation coverage.
- P2 child — Herdr terminal path → FileTree reveal → viewer line/column → focus
  return. Reuse and link `naia-shell#227` viewer infrastructure.
- P3 child — typed Naia observation/control/context bridge with policy, denial,
  cancellation, timeout, correlation, and audit behavior.
- P4 child — L3 Naia → L2 issue leader → L1 workers; link `naia-agent#107`.
- `naia-shell#317` — its duplicate native multi-session UI direction is
  superseded only after the corresponding Herdr path reaches parity; reusable
  findings and tests remain historical evidence.
- `naia-shell#115` — closed PTY/session history whose reusable implementation and
  regression assets are preserved.

## Delivery gates

1. Correct UC, requirements, issue graph, and preservation contract.
2. Pass planning adversarial review with source fidelity, baseline preservation,
   implementation/test, and authority/release roles.
3. Restore the baseline evidence removed by the drifted implementation.
4. Implement P1, then P2, in coverage-preserving increments.
5. Run focused tests, full typecheck/unit suite, development review,
   Playwright/native integration and visual UX checks, integration review, and
   the repository verification skills.
6. Report only evidence generated from the final retained test surface.

## Manual findings and release disposition

| Finding | Release | Disposition |
|---|---|---|
| Stored Korean locale was applied after the first render | v0.1.7 | Fixed: Shell hydrates the file-backed locale before rendering the main UI; locale precedence is covered by regression tests. |
| ADK existing-data actions were hardcoded (`이미 데이터가 있어요`, `그대로 사용`, `삭제하고 새로 시작`) | v0.1.7 | Fixed: the complete state uses nine translation keys in all fourteen locale tables. |
| Linux native `<select>` rendered the Korean label with broken glyph shaping | v0.1.7 | Fixed: Settings uses the Web-rendered locale picker for identical labels and shaping across platforms. |
| File Tree briefly used a broad/mixed root and could expose `${backup_dir}` | v0.1.7 | Fixed: no fallback tree is rendered before an authoritative Herdr snapshot; root selection is bound to the focused Space worktree/CWD. |
| Herdr right surface remained black although Spaces and Agents loaded | v0.1.7 | Fixed: the PTY listener is registered before the initial resize/SIGWINCH so the first redraw cannot be lost. |
| Linux Browser child WebView content is offset below its Shell bounds | v0.1.8 | Deferred as a Linux/naia-os native child-WebView coordinate and resize issue; it is not part of the Windows launch patch. |
| `naia <path>` should open/reveal a file in Shell Workspace | v0.1.8 | Issue-only follow-up, intentionally excluded from the v0.1.7 launch scope. |
| One development launch restored a `1x1` main window before later becoming visible | v0.1.8 investigation | Not reproduced or changed in this patch; retain as Linux persisted-window follow-up rather than claiming a fix. |

The v0.1.7 fixes above have automated coverage. A packaged native run must still
confirm Korean glyphs, the selected Space/root, visible live terminal output, and
keyboard input before final release acceptance.

## Current evidence

- Herdr 0.8.0 public CLI exposes session snapshot plus workspace and agent focus;
  `pane focus` is directional only and there is no public event-stream command.
- Snapshot protocol 19 reports workspace/tab/pane focus, agent ownership, and CWD.
- Herdr officially supports `HERDR_CONFIG_PATH` and hidden collapsed sidebar
  configuration, enabling an isolated Shell embed without global config mutation.
- GitHub authentication is available; issue mutation follows planning review.
- Shell typecheck and production build pass. The final complete Vitest rerun reports
  148 passed files, 2 skipped files, 1,540 passed tests, and 22 skipped tests. One
  pre-existing media-queue test failed once immediately before that run, then passed
  both in isolation and in the complete rerun; no retained Herdr regression failed.
- The targeted Chromium integration run reports 4/4 passing UCs. It verifies the
  rail order, exact focus command arguments, active-root following, viewer drill-in,
  identical terminal DOM identity after return, and one frontend PTY-create request.
- The first Chromium run exposed two PTY-create requests under React development
  strict effects. The retained implementation now has an idempotent initial-launch
  guard; the rerun passes with exactly one request.
- Focused Rust Herdr tests report 9 passed against the v0.1.7 paired naia-agent commit
  `e297a30c74bf30d4ea0dbe27d7f5c3b6f5856955`, including focused multi-worktree
  location selection, rejection when native workspace/pane focus changes during a
  file-resolution request, bounded public API identifiers/labels, and isolation from
  ordinary Shell PTYs.
- The installed `herdr 0.8.0` binary was queried read-only: its live JSON schema
  reports protocol 19/schema 1, and a live snapshot returned the expected focused
  workspace/pane IDs and checkout path. The observation also confirmed that an
  agent's foreground process CWD may diverge from its stable workspace CWD; Shell
  therefore roots non-worktree Spaces at `agent.cwd`, matching the native resolver.
- File resolution now binds the frontend request to the observed workspace and pane
  IDs and makes the native side reject a result if focus changed before resolution.
  Snapshot optional display fields are type-checked, the isolated Herdr config is
  initialized once per process, and opening a file from either a terminal or Naia
  tool explicitly transfers focus to File Tree and the viewer.
- Changed-surface i18n checks cover the localized rail, Herdr errors, ADK
  existing-data state, and locale picker. Repository-wide hardcoded-string scanning
  still reports unrelated legacy debt in large pre-existing UI modules; it is not
  represented as a clean whole-repository result.
- Real FileTree and Editor component tests prove recursive reveal/select/scroll and
  line/column cursor positioning. The browser Tauri bridge remains mocked, so a
  packaged native run with a real Herdr binary is still required before acceptance.
- Root synchronization retries on every newly accepted Herdr snapshot after a
  transient `workspace_set_root` failure; the same focused Space therefore
  converges without requiring another focus change.
- P4 three-layer orchestration remains deferred. No release pass is claimed by this
  record; deterministic complexity preflight remains authoritative.
