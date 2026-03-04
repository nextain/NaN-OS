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
- **Avatar sizing**: `ResizeObserver` on container (not window resize)
- **Config sync**: panelPosition + panelVisible synced to Lab via `LAB_SYNC_FIELDS`

---

## Data Flow

| Scenario | Flow |
|----------|------|
| **Chat** | User → Shell → Agent → LLM → Agent → Shell → User |
| **Tool exec** | LLM → Agent (tool_use) → Gateway (exec.bash or node.invoke) → OS → result → LLM |
| **Approval** | Gateway → Agent (approval_request) → Shell (modal) → user decision → Agent → Gateway |
| **External** | Discord msg → Gateway → Agent → LLM → Agent → Gateway → Discord reply |

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

## Memory Architecture (2-tier)

A 2-tier memory system for Alpha to remember and grow with the user.

### Short-Term Memory

| Item | Details |
|------|---------|
| **Storage** | Zustand (in-memory) + SQLite messages table |
| **Scope** | All messages in current session |
| **Lifetime** | Current session ~ last 7 days |
| **Implementation** | Rust memory.rs + Frontend db.ts + Chat store |

### Long-Term Memory

| Type | Storage | Content |
|------|---------|---------|
| **Episodic** | sessions.summary | LLM-generated session summaries |
| **Semantic (facts/preferences)** | facts table | Extracted facts like "user prefers Rust" |

### Search Engine Evolution (swappable via MemoryProcessor interface)

```
4.4a: SQLite LIKE (keyword matching)
4.4b: SQLite FTS5 BM25 (full-text search)
4.5:  Gemini Embedding API (semantic search)
5+:   sLLM (Ollama, llama.cpp) local summarization/embedding
```

### DB Schema

```sql
-- Short-term memory
CREATE TABLE sessions (id TEXT PK, created_at INT, title TEXT, summary TEXT);
CREATE TABLE messages (id TEXT PK, session_id TEXT FK, role TEXT, content TEXT,
                       timestamp INT, cost_json TEXT, tool_calls_json TEXT);

-- Long-term memory (Phase 4.4c+)
CREATE TABLE facts (id TEXT PK, key TEXT, value TEXT, source TEXT, updated_at INT);
```

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
