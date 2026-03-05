# Naia Hybrid Architecture

## Core Design Philosophy

> **Don't build from scratch. Combine 3 proven ecosystems.**

Naia takes the strengths from 3 parent projects and combines them in a **hybrid** approach:

| Parent | Role | What we take |
|--------|------|-------------|
| **OpenClaw** | Runtime backend | Gateway daemon, command execution, channels, skills, memory |
| **project-careti** | Agent intelligence | Multi-LLM, tool definitions, Alpha persona, cost tracking |
| **OpenCode** | Architecture patterns | Client/server separation, provider abstraction |

---

## Why Hybrid?

### Why not just one?

**OpenClaw only?** → CLI-only, no avatar, no visual feedback, no emotion
**Careti only?** → VS Code extension, no always-on, no channels/skills
**OpenCode only?** → TUI-only, no VRM avatar, no desktop app

### Hybrid Solution

```
OpenClaw's daemon + execution + channels + skills ecosystem (runtime backend)
+ Careti's multi-LLM + tools + persona (agent intelligence)
+ OpenCode's client/server separation pattern (architecture)
= Wrap it in a Tauri desktop shell with VRM avatar for accessible UX
```

---

## Runtime Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Naia Shell (Tauri 2 + React + Three.js VRM Avatar) │
│  Role: Desktop UI, avatar rendering, chat panel        │
│  Source: Naia + AIRI (VRM) + shadcn/ui              │
└──────────────────────┬──────────────────────────────────┘
                       │ stdio JSON lines
┌──────────────────────▼──────────────────────────────────┐
│  Naia Agent (Node.js)                                │
│  Role: LLM connection, tool orchestration, Alpha persona│
│  Source: Careti providers + OpenCode pattern             │
│  Features: multi-LLM, TTS, emotion, cost tracking       │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws://127.0.0.1:18789)
┌──────────────────────▼──────────────────────────────────┐
│  OpenClaw Gateway (systemd user service)                │
│  Role: Execution, security, channels, skills, memory    │
│  Source: OpenClaw ecosystem (npm: openclaw)              │
│  Auth: device identity + token scopes (protocol v3)     │
│  Methods: dynamic by profile (agent, node.invoke,        │
│  sessions.*, browser.request, skills.*, channels.* ...)  │
└─────────────────────────────────────────────────────────┘
```

## The 3 Pillars in Detail

### Pillar 1: OpenClaw (Runtime Backend)

What OpenClaw provides:
- **Gateway daemon**: systemd user service, always running
- **Command execution**: exec.bash primary + node.invoke(system.run) fallback
- **Security**: Device auth, token scopes, exec approval
- **Channels**: Discord, Telegram, WhatsApp, Slack, IRC, etc.
- **Skills**: 50+ built-in (weather, time, notes, etc.)
- **Memory**: Conversation persistence, context recall
- **Sessions**: Multi-session, sub-agent spawn
- **ACP**: Agent Control Protocol (client↔agent bridge)
- **TTS**: Integrated provider selector (Edge TTS free, Google Cloud, OpenAI, ElevenLabs) — direct API calls

### Pillar 2: project-careti (Agent Intelligence)

What Careti provides:
- **Multi-LLM**: Gemini (default), xAI (Grok), Claude
- **Tool definitions**: GATEWAY_TOOLS (8 tools)
- **Function calling**: Gemini native (xAI/Claude = tech debt)
- **Alpha persona**: System prompt, emotion mapping
- **Cost tracking**: Per-request cost display
- **stdio protocol**: Shell ↔ Agent JSON lines

### Pillar 3: OpenCode (Architecture Patterns)

What OpenCode provides:
- **Client/server separation**: Shell (client) / Agent (server)
- **Provider abstraction**: buildProvider factory pattern
- **Module boundaries**: shell / agent / gateway separation

---

## Shell UI Layout

```
App
├── TitleBar (panel toggle button + window controls)
└── .app-layout [data-panel-position="left"|"right"|"bottom"]
    ├── .side-panel (ChatPanel — only rendered when panelVisible=true)
    └── .main-area (AvatarCanvas — always visible)
```

- **panelPosition**: `"left" | "right" | "bottom"` — controls CSS flex-direction on .app-layout
- **panelVisible**: `boolean` — toggles chat panel; avatar always stays visible
- **panelSize**: `number (0-100)` — chat panel percentage of viewport. Default: **70**
- **Avatar sizing**: `ResizeObserver` on container (not window resize)
- **Config sync**: panelPosition + panelVisible + panelSize synced to Lab via `LAB_SYNC_FIELDS`

---

## Data Flow

| Scenario | Flow |
|----------|------|
| **Chat** | User → Shell → Agent → LLM → Agent → Shell → User |
| **Tool exec** | LLM → Agent (tool_use) → Gateway (exec.bash or node.invoke) → OS → result → LLM |
| **Approval** | Gateway → Agent (approval_request) → Shell (modal) → user decision → Agent → Gateway |
| **External** | Discord msg → Gateway → Agent → LLM → Agent → Gateway → Discord reply |

## Credential Storage Architecture

> Last updated: 2026-03-05

### naiaKey Dual-Storage (localStorage + Tauri Secure Store)

`naiaKey` (Naia Lab API key) is stored in **two locations** for reliability:

| Storage | Type | Used by |
|---------|------|---------|
| **localStorage** | Sync, fast | All UI components via `saveConfig`/`loadConfig` |
| **Tauri secure store** | Async, encrypted | Persists across browser storage clears |

**Write points:**
- **Login** (SettingsTab/OnboardingWizard): `saveConfig({naiaKey})` + `saveSecretKey("naiaKey", key)`
- **Save** (SettingsTab): `saveConfig()` + `void saveSecretKey()`
- **Logout** (SettingsTab): `saveConfig({naiaKey: undefined})` + `deleteSecretKey("naiaKey")`

**Read merge** (`loadConfigWithSecrets()`):
1. Read localStorage value (sync)
2. Read secure store value (async)
3. **localStorage takes priority** — syncs to secure store if different
4. If only secure store has value → use it (migration/recovery case)

### naiaKey Independence from LLM Provider

`naiaKey` is passed as a **top-level field** in `ChatRequest`, separate from `provider` config. This allows Naia Cloud TTS to work regardless of which LLM provider is selected.

- ChatPanel sends `naiaKey` in both `provider.naiaKey` (for LLM) and request-level `naiaKey` (for TTS)
- Agent resolves: `effectiveNaiaKey = request.naiaKey || provider.naiaKey`

**Key files:** `config.ts`, `secure-store.ts`, `SettingsTab.tsx`, `OnboardingWizard.tsx`, `agent/src/index.ts`, `agent/src/protocol.ts`

---

## Desktop Avatar Local File Pipeline

Rules for reliably loading VRM/backgrounds from local files:

- `file://` paths are normalized to absolute paths before save/render.
- Paths in `http://localhost/...` form are converted to `http://asset.localhost/...` for Tauri asset protocol compatibility.
- Absolute local VRMs are read as bytes via Rust command `read_local_binary`, then parsed as `ArrayBuffer` directly in frontend.
  This avoids CORS/access control failures with URL fetch.
- Background images use asset URL conversion, with fallback to default gradient on failure.

### E2E Execution Note

- `e2e-tauri` runs a fixed binary at `src-tauri/target/debug/naia-shell` (separate from `pnpm build` output).
- After changes to Rust `#[tauri::command]` or `invoke_handler`, always run `cargo build` in `src-tauri` before E2E.

### Agent Build Pipeline Note

Agent runs from `shell/src-tauri/target/debug/agent/dist/index.js` (pre-built). **Vite HMR does NOT apply to agent code.** After modifying `agent/src/`:
1. `cd agent && pnpm build` (tsc compiles to `agent/dist/`)
2. `cp -r agent/dist/ shell/src-tauri/target/debug/agent/dist/`
3. Or restart `pnpm run tauri dev` which rebuilds automatically.

## Channel/Onboarding Discord Routing Rules

- Discord bot addition flow uses `naia.nextain.io` routing, not direct token/webhook handling in Shell.
- Both the Channels tab Discord login button and the onboarding final step button open:
  `https://naia.nextain.io/ko/discord/connect?source=naia-shell`
- Security principles:
  - `DISCORD_BOT_TOKEN` is never used/exposed in shell frontend.
  - Bot secrets are managed only in `naia.nextain.io` server environment variables.

## Deep-link Persistence Contract (Important)

OAuth deep-link payloads must be persisted regardless of whether specific tabs (Settings/Onboarding) are rendered.

- Required rules:
  - Deep-link events affecting runtime behavior (`discord_auth_complete`, etc.) must be received/saved at **always-mounted layer (App root)**.
  - Settings/Onboarding listeners are for UI state sync only; persistence logic is centralized in common library.
  - Agent default send target must not depend on "whether Settings tab was open".
- Prohibited patterns:
  - Saving auth payloads only inside tab components.
  - Duplicating different fallback rules across components.

## Memory Architecture (Dual-Origin)

Memory lives in **two systems** that serve different purposes and connect at session boundaries.

- **Shell** owns "who is the user" (facts)
- **OpenClaw** owns "what happened" (session transcripts + semantic search index)

### Shell Memory (Tauri)

#### Short-Term Memory

| Item | Details |
|------|---------|
| **Storage** | Zustand (in-memory) + SQLite messages table |
| **Scope** | All messages in current session |
| **Lifetime** | Current session ~ last 7 days |
| **Implementation** | Rust `memory.rs` + Frontend `db.ts` + Chat store |

#### Long-Term Memory — Facts

| Item | Details |
|------|---------|
| **Storage** | `~/.config/naia-os/memory.db` (SQLite, facts table) |
| **Scope** | Cross-session user knowledge (name, birthday, preferences, decisions) |
| **Extraction** | `memory-processor.ts` `extractFacts()` — LLM parses conversation → `{key, value}[]` |
| **Injection** | `persona.ts` `buildSystemPrompt()` → `"Known facts about the user: ..."` in system prompt |

### OpenClaw Memory (Daemon)

#### Session Transcripts

| Item | Details |
|------|---------|
| **Storage** | `~/.openclaw/agents/main/sessions/` (`sessions.json` + `*.jsonl` per session) |
| **Scope** | Full conversation history per session key (`agent:main:main`, `discord:dm:*`, etc.) |
| **RPC** | `sessions.list`, `chat.history`, `sessions.transcript`, `sessions.compact` |
| **Hook** | `session-memory` — on `/new` or `/reset`, saves conversation to `workspace/memory/*.md` |

#### Semantic Search Index

| Item | Details |
|------|---------|
| **Storage** | `~/.openclaw/memory/main.sqlite` (SQLite with embeddings) |
| **Tools** | `memory_search` (semantic search), `memory_get` (retrieve entry) |
| **Scope** | Cross-session searchable index (sessions + `workspace/memory/*.md` files) |

#### Workspace Bootstrap Files

| Item | Details |
|------|---------|
| **Storage** | `~/.openclaw/workspace/` (`SOUL.md`, `IDENTITY.md`, `USER.md`) |
| **Sync** | Shell writes these via `sync_openclaw_config` (`lib.rs`) on settings change |
| **Note** | Regenerable from Shell settings — not primary data |

### Data Flow (How the Two Systems Connect)

```
SESSION START
  Shell: buildMemoryContext() → getAllFacts() from Shell DB
  Shell: buildSystemPrompt(persona, {facts, userName, locale, ...})
  → System prompt with user facts sent to Agent

DURING SESSION
  Agent ↔ OpenClaw: messages stored in session transcript (*.jsonl)
  OpenClaw: memory_search tool available for LLM to query past sessions
  Shell: Zustand store holds current messages for UI

SESSION END (user clicks "New Conversation")
  Shell [fire-and-forget]:
    1. summarizeSession(messages) → LLM generates 2-3 sentence summary
    2. patchGatewaySession("agent:main:main", {summary}) → OpenClaw session metadata
    3. extractFacts(messages, summary) → LLM extracts {key, value}[] user facts
    4. upsertFact() × N → Shell facts DB (memory.db)
  OpenClaw:
    session-memory hook saves conversation to workspace/memory/YYYY-MM-DD-slug.md
    semantic index updated with new session content

NEXT SESSION
  Shell: loads facts → injects into system prompt ("Known facts about the user")
  OpenClaw: memory_search finds content from previous sessions
  → User is "remembered" through both system prompt facts AND searchable history
```

### Discord Channel Memory

Discord messages flow through OpenClaw sessions (key: `agent:main:discord:direct:<userId>`).
These are stored in OpenClaw session transcripts and indexed by `memory_search`.
However, Shell fact extraction (`summarizePreviousSession`) only runs on Shell chat sessions —
**Discord conversations do NOT trigger fact extraction yet**.

### Device Migration — Backup Required

| Path | Content | Required? |
|------|---------|-----------|
| `~/.config/naia-os/memory.db` | Shell facts (user knowledge) | **Must backup** |
| `~/.openclaw/memory/main.sqlite` | Semantic search index | **Must backup** (rebuildable but slow) |
| `~/.openclaw/agents/main/sessions/` | Conversation transcripts | Recommended |
| `~/.openclaw/openclaw.json` | Gateway config (API keys, model) | Recommended |
| `~/.openclaw/workspace/` | SOUL/IDENTITY/USER.md | Regenerable from Shell |
| `~/.openclaw/credentials/` | OAuth tokens | Re-authenticatable |

### Search Engine Evolution (swappable via MemoryProcessor interface)

```
4.4a: SQLite LIKE (keyword matching)
4.4b: SQLite FTS5 BM25 (full-text search)
4.5:  Gemini Embedding API (semantic search)
5+:   sLLM (Ollama, llama.cpp) local summarization/embedding
```

### DB Schema

```sql
-- Shell facts (user knowledge, cross-session)
CREATE TABLE facts (id TEXT PK, key TEXT UNIQUE, value TEXT,
                    source_session TEXT, created_at INT, updated_at INT);

-- OpenClaw sessions: ~/.openclaw/agents/main/sessions/sessions.json (metadata)
--                  + *.jsonl per session (transcripts)
-- OpenClaw semantic: ~/.openclaw/memory/main.sqlite (embeddings index)
```

---

## Skill System

Skill management: built-in skills, Gateway skills, and install flow. *(Updated: 2026-03-05)*

### Built-in Skills

- **Count**: 20 skills
- **Sync locations** (all 4 must list the same 20 skills):
  1. `shell/src-tauri/src/lib.rs` — `list_skills` Tauri command
  2. `shell/src/components/ChatPanel.tsx` — `BUILTIN_SKILLS` Set (guards against disable)
  3. `agent/src/skills/built-in/*.ts` — tool-bridge registry
  4. `agent/scripts/generate-skill-manifests.ts` — `SKIP_BUILT_IN` list
- **Rule**: Adding a new built-in requires updating all 4 locations.

### Gateway Skills

- **Source**: OpenClaw Gateway `skills.status` RPC
- **Response fields**: `name`, `description`, `eligible`, `missing[]`, `install[]` (`{ id, kind, label }`)
- **Install kinds**: `brew`, `node`, `go`, `uv`, `download`

### Install Flow

```
1. Shell SkillsTab calls fetchGatewayStatus()
   → directToolCall({ action: "gateway_status" })
   → Agent skill_skill_manager → Gateway skills.status RPC
   → Returns skills[] with install[] arrays

2. User clicks Install button
   → Shell resolves installId from gs.install[0].id
   → directToolCall({ action: "install", skillName, installId })
   → Agent skill_skill_manager → Gateway skills.install RPC
   → Gateway runs installer (brew/npm/go/etc)
   → Returns success/error

3. Shell shows install result feedback
   → Re-fetches gateway status to update UI
```

- **RPC params**: `skills.status: { agentId? }`, `skills.install: { name, installId }` — `installId` is REQUIRED (from `install[].id`)
- **directToolCall flow**: Shell → Tauri stdin → Agent `handleToolRequest()` → `executeTool(skill_skill_manager)` → Gateway RPC → result back to Shell
- **Event cleanup**: `GatewayClient.offEvent(handler)` must be called after `delegateStreaming` completes to prevent event handler memory leaks.

---

## Security 4-Layer (Defense in Depth)

| Layer | Role | Config |
|-------|------|--------|
| **OS** | Bazzite immutable rootfs + SELinux | System file protection |
| **Gateway** | OpenClaw device auth + token scopes + exec approval | protocol v3, Ed25519 |
| **Agent** | Permission tiers 0-3 + per-tool blocking | Tier 3: blocks rm -rf, sudo, etc. |
| **Shell** | User approval modal + tool on/off toggle | User-controlled |

**Principle: Each layer is independent. If one layer is breached, the rest still defend.**

---

## Gateway Connection Protocol

How Naia Agent connects to OpenClaw Gateway:

```
1. WebSocket connection: ws://127.0.0.1:18789
2. Gateway → connect.challenge event (with nonce)
3. Agent → connect request (token + protocol v3 + client info)
4. Gateway → hello-ok response (88 methods + capability list)
5. Agent → req/res frames for tool execution (exec.bash / node.invoke etc.)
```

### Auth Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| auth.token | gateway.auth.token | Shared token from gateway config |
| client.id | "cli" | Paired device ID |
| client.platform | "linux" | Platform |
| client.mode | "cli" | Client mode |
| minProtocol | 3 | Minimum protocol version |
| maxProtocol | 3 | Maximum protocol version |

---

## Voice Architecture

> Last updated: 2026-03-05

### Overview

Naia supports two voice output modes that share a single voice setting:

1. **Live Voice Conversation** — real-time bidirectional audio via Gemini Live API
2. **TTS (Text-to-Speech)** — text chat responses read aloud

Naia account users use the same Chirp 3 HD voice (e.g., "Kore") for both modes.

### Voice Setting Unification

| Item | Value |
|------|-------|
| Config field | `liveVoice` |
| Stored value | Short name (e.g., `"Kore"`, `"Puck"`) |
| Live API usage | Passed directly as voice parameter |
| TTS usage | ChatPanel derives full name: `ko-KR-Chirp3-HD-{liveVoice}` |

**Available voices:**
Kore (female, calm), Puck (male, lively), Charon (male, deep), Aoede (female, bright), Fenrir (male, low), Leda (female, soft), Orus (male, firm), Zephyr (neutral), Achernar, Gacrux, Sulafat, Umbriel

Non-Naia providers (google, edge, openai, elevenlabs) use a separate `ttsVoice` field.

### Live Voice Conversation (Gemini Live API)

```
┌──────────┐  mic PCM 16kHz   ┌──────────────┐  WebSocket   ┌──────────────┐  gRPC   ┌─────────────┐
│  Shell   │ ────────────────→ │ voice-session │ ──────────→ │  any-llm GW  │ ──────→ │ Gemini Live │
│(ChatPanel)│ ←──────────────── │  (browser WS) │ ←────────── │  (live.py)   │ ←────── │    API      │
└──────────┘  PCM 24kHz audio  └──────────────┘  JSON+audio  └──────────────┘         └─────────────┘
```

**Key components:**

| File | Role |
|------|------|
| `shell/src/components/ChatPanel.tsx` | UI state (off/connecting/active), event wiring, transcript accumulation |
| `shell/src/lib/voice-session.ts` | WebSocket client to any-llm gateway `/v1/live` |
| `shell/src/lib/audio-player.ts` | Continuous PCM playback (24kHz Int16 mono → AudioContext) |
| `shell/src/lib/mic-stream.ts` | Mic capture, downsample to 16kHz PCM, emit base64 chunks |
| `project-any-llm/.../routes/live.py` | WebSocket proxy: client ↔ Gemini Live SDK session |

**Key technical details:**
- `session.receive()` iterator breaks after `turnComplete` (SDK behavior) → wrapped in `while True` for multi-turn
- Token usage accumulated with `+=` across turns for correct billing
- AudioContext auto-suspends in webkit2gtk → requires `ctx.resume()` call
- Transcripts arrive word-by-word → accumulated via `inputAccum`/`outputAccum` (not overwritten)

**Auth:** Naia API key (`X-AnyLLM-Key: Bearer {naiaKey}`) → any-llm gateway verifies → creates Gemini session via Vertex AI

**Model:** `gemini-live-2.5-flash-native-audio` (configurable via config.liveModel)

### TTS (Text-to-Speech)

**Default provider:** `edge` (free, no login required)

**naiaKey routing:** TTS auth (`naiaKey`) is independent of LLM provider selection. `ChatRequest` carries `naiaKey` as a top-level field, so Naia Cloud TTS works even when LLM is set to gemini/openai/xai/anthropic.

| Provider | Route | Voices |
|----------|-------|--------|
| nextain | ChatPanel → agent → nextain-tts.ts → any-llm gateway → Google Cloud TTS | Chirp 3 HD (derived from liveVoice) |
| google | ChatPanel → agent → Rust preview_tts → Google Cloud TTS directly | Neural2 series |
| edge | ChatPanel → agent → OpenClaw gateway → Edge TTS | Free |
| openai | ChatPanel → agent → OpenClaw gateway → OpenAI TTS | OpenAI voices |
| elevenlabs | ChatPanel → agent → OpenClaw gateway → ElevenLabs | ElevenLabs voices |

### STT Status

Legacy STT (`stt.ts`, `audio-recorder.ts`) has been removed.
Real-time speech input is handled entirely by Gemini Live API's built-in speech recognition (`inputTranscription` events).

### Billing

- **Live conversation:** $0.10/M input tokens + $0.40/M output tokens (Gemini Live)
- **TTS:** Varies by provider (Chirp 3 HD, Neural2, Edge free, OpenAI, ElevenLabs)
