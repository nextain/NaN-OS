[English](README.md) | [한국어](READMES/README.ko.md) | [日本語](READMES/README.ja.md) | [中文](READMES/README.zh.md) | [Français](READMES/README.fr.md) | [Deutsch](READMES/README.de.md) | [Русский](READMES/README.ru.md) | [Español](READMES/README.es.md) | [Português](READMES/README.pt.md) | [Tiếng Việt](READMES/README.vi.md) | [Bahasa Indonesia](READMES/README.id.md) | [العربية](READMES/README.ar.md) | [हिन्दी](READMES/README.hi.md) | [বাংলা](READMES/README.bn.md)

# Naia

**The Next Generation AI OS** — A personal AI operating system where your own AI lives

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

> "Your AI, your rules. Choose your AI, shape its memory and personality, give it your voice — all on your own machine."

## What is Naia?

Naia is a personal AI OS that gives individuals full sovereignty over their AI. Choose which AI to use (including local models), configure its memory and personality locally, customize its 3D avatar and voice — everything stays on your machine, under your control.

This isn't just another AI tool. It's an operating system where your AI lives, grows, and works alongside you. Today it's a desktop OS with a 3D avatar. Tomorrow — real-time video avatars, singing, gaming, and eventually your own Physical AI (android OS).

### Core Philosophy

- **AI Sovereignty** — You choose your AI. Cloud or local. The OS doesn't dictate.
- **Complete Control** — Memory, personality, settings — all stored locally. No cloud dependency.
- **Your Own AI** — Customize avatar, voice, name, personality. Make it truly yours.
- **Always Alive** — AI runs 24/7 in the background, receiving messages and doing work even when you're away.
- **Future Vision** — VRM 3D avatars → real-time video avatars → singing & gaming together → Physical AI

### Features

- **3D Avatar** — VRM character with emotion expressions (joy/sadness/surprise/thinking) and lip-sync
- **AI Freedom** — 7 cloud providers (Gemini, Claude, GPT, Grok, zAI) + local AI (Ollama) + Claude Code CLI
- **Local-First** — Memory, personality, all settings stored on your machine
- **Tool Execution** — 8 tools: file read/write, terminal, web search, browser, sub-agent
- **70+ Skills** — 7 built-in + 63 custom + 5,700+ ClawHub community skills
- **Voice** — 5 TTS providers + STT + lip-sync. Give your AI the voice you want.
- **14 Languages** — Korean, English, Japanese, Chinese, French, German, Russian, and more
- **Always-On** — OpenClaw gateway daemon keeps your AI running in the background
- **Channel Integration** — Talk to your AI via Discord DM, anytime, anywhere
- **4-Tier Security** — T0 (read) to T3 (dangerous), per-tool approval, audit logs
- **Personalization** — Name, personality, speech style, avatar, theme (8 types)

## Why Naia?

Other AI tools are just "tools". Naia is **"your own AI"**.

| | Other AI Tools | Naia |
|---|----------------|------|
| **Philosophy** | Use AI as a tool | Give AI the OS. Live together. |
| **Target** | Developers only | Everyone who wants their own AI |
| **AI Choice** | Platform decides | 7 cloud + local AI — you decide |
| **Data** | Cloud-locked | Memory, personality, settings all local |
| **Avatar** | None | VRM 3D character + emotions + lip-sync |
| **Voice** | Text only or basic TTS | 5 TTS + STT + your AI's own voice |
| **Deployment** | npm / brew / pip | Desktop app or bootable USB OS |
| **Platform** | macOS / CLI / Web | Linux native desktop → future: Physical AI |
| **Cost** | Separate API keys required | Free credits to start, local AI completely free |

## Relationship with OpenClaw

Naia is built on top of the [OpenClaw](https://github.com/openclaw-ai/openclaw) ecosystem, but it is a fundamentally different product.

| | OpenClaw | Naia |
|---|---------|---------|
| **Form** | CLI daemon + terminal | Desktop app + 3D avatar |
| **Target** | Developers | Everyone |
| **UI** | None (terminal) | Tauri 2 native app (React + Three.js) |
| **Avatar** | None | VRM 3D character (emotions, lip-sync, gaze) |
| **LLM** | Single provider | Multi-provider 7 + real-time switching |
| **Voice** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + avatar lip-sync |
| **Emotions** | None | 6 emotions mapped to facial expressions |
| **Onboarding** | CUI | GUI + VRM avatar selection |
| **Cost Tracking** | None | Real-time credit dashboard |
| **Distribution** | npm install | Flatpak / AppImage / DEB / RPM + OS image |
| **Multilingual** | English CLI | 14-language GUI |
| **Channels** | Server bot (multi-channel) | Naia-dedicated Discord DM bot |

**What we took from OpenClaw:** Daemon architecture, tool execution engine, channel system, skill ecosystem (5,700+ Clawhub skill compatible)

**What Naia built new:** Tauri Shell, VRM avatar system, multi-LLM agent, emotion engine, TTS/STT integration, onboarding wizard, cost tracking, Nextain account integration, memory system (STM/LTM), security layers

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Naia Shell (Tauri 2 + React + Three.js)         │
│  Chat · Avatar · Skills · Channels · Settings    │
│  State: Zustand │ DB: SQLite │ Auth: OAuth        │
└──────────────┬───────────────────────────────────┘
               │ stdio JSON lines
┌──────────────▼───────────────────────────────────┐
│  Naia Agent (Node.js + TypeScript)               │
│  LLM: Gemini, Claude, GPT, Grok, zAI, Ollama    │
│  TTS: Nextain, Edge, Google, OpenAI, ElevenLabs  │
│  Skills: 7 built-in + 63 custom                  │
└──────────────┬───────────────────────────────────┘
               │ WebSocket (ws://127.0.0.1:18789)
┌──────────────▼───────────────────────────────────┐
│  OpenClaw Gateway (systemd user daemon)          │
│  88 RPC methods │ Tool exec │ Channels │ Memory  │
└──────────────────────────────────────────────────┘
```

**A fusion of 3 projects:**
- **OpenClaw** — Daemon + tool execution + channels + skill ecosystem
- **Careti** — Multi-LLM + tool protocol + stdio communication
- **OpenCode** — Client/server separation pattern

## Project Structure

```
naia-os/
├── shell/              # Tauri 2 desktop app (React + Rust)
│   ├── src/            #   React components + state management
│   ├── src-tauri/      #   Rust backend (process management, SQLite, auth)
│   └── e2e-tauri/      #   WebDriver E2E tests
├── agent/              # Node.js AI agent core
│   ├── src/providers/  #   LLM providers (Gemini, Claude, GPT, etc.)
│   ├── src/tts/        #   TTS providers (Edge, Google, OpenAI, etc.)
│   ├── src/skills/     #   Built-in skills (13 Naia-specific TypeScript)
│   └── assets/         #   Bundled skills (64 skill.json)
├── gateway/            # OpenClaw Gateway bridge
├── flatpak/            # Flatpak packaging (io.nextain.naia)
├── recipes/            # BlueBuild OS image recipes
├── config/             # OS configuration (systemd, wrapper scripts)
├── .agents/            # AI context (English, JSON/YAML)
└── .users/             # Human docs (Korean, Markdown)
```

## Context Documents (Dual-directory Architecture)

A dual documentation structure for AI agents and human developers. `.agents/` contains token-efficient JSON/YAML for AI, `.users/` contains Korean Markdown for humans.

| AI Context (`.agents/`) | Human Docs (`.users/`) | Description |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | Project rules (SoT) |
| `context/project-index.yaml` | — | Context index + mirroring rules |
| `context/vision.yaml` | `context/vision.md` | Project vision, core concepts |
| `context/plan.yaml` | `context/plan.md` | Implementation plan, phase-by-phase status |
| `context/architecture.yaml` | `context/architecture.md` | Hybrid architecture, security layers |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | OpenClaw Gateway synchronization |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Discord integration architecture |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | Development cycle (PLAN->BUILD->VERIFY) |

**Mirroring rule:** When one side is modified, the other must always be synchronized.

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| OS | Bazzite (Fedora Atomic) | Immutable Linux, GPU drivers |
| OS Build | BlueBuild | Container-based OS images |
| Desktop App | Tauri 2 (Rust) | Native shell |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | 3D VRM rendering |
| State Management | Zustand | Client state |
| LLM Engine | Node.js + multi SDK | Agent core |
| Protocol | stdio JSON lines | Shell <-> Agent communication |
| Gateway | OpenClaw | Daemon + RPC server |
| DB | SQLite (rusqlite) | Memory, audit logs |
| Formatter | Biome | Linting + formatting |
| Test | Vitest + tauri-driver | Unit + E2E |
| Package | pnpm | Dependency management |

## Quick Start

### Prerequisites

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (for Tauri build)
- System packages: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Development Run

```bash
# Install dependencies
cd shell && pnpm install
cd ../agent && pnpm install

# Run Tauri app (Gateway + Agent auto-spawn)
cd ../shell && pnpm run tauri dev
```

When the app launches, it automatically:
1. OpenClaw Gateway health check — reuse if running, otherwise auto-spawn
2. Agent Core spawn (Node.js, stdio connection)
3. On app exit, only auto-spawned Gateway is terminated

### Tests

```bash
cd shell && pnpm test                # Shell unit tests
cd agent && pnpm test                # Agent unit tests
cd agent && pnpm exec tsc --noEmit   # Type check
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust tests

# E2E (Gateway + API key required)
cd shell && pnpm run test:e2e:tauri
```

### Flatpak Build

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Security Model

Naia applies a **Defense in Depth** security model:

| Layer | Protection |
|-------|-----------|
| OS | Bazzite immutable rootfs + SELinux |
| Gateway | OpenClaw device authentication + token scopes |
| Agent | 4-tier permissions (T0~T3) + per-tool blocking |
| Shell | User approval modal + tool ON/OFF toggle |
| Audit | SQLite audit log (all tool executions recorded) |

## Memory System

- **Short-term Memory (STM):** Current session conversation (Zustand + SQLite)
- **Long-term Memory (LTM):** Session summaries (LLM-generated) + automatic extraction of user facts/preferences
- **Memo Skill:** Explicit memo save/retrieve via `skill_memo`

## Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Deployment pipeline (BlueBuild -> ISO) | ✅ Complete |
| 1 | Avatar integration (VRM 3D rendering) | ✅ Complete |
| 2 | Conversation (text/voice + lip-sync + emotions) | ✅ Complete |
| 3 | Tool execution (8 tools + permissions + audit) | ✅ Complete |
| 4 | Always-on daemon (Gateway + Skills + Memory + Discord) | ✅ Complete |
| 5 | Nextain account integration (OAuth + credits + LLM proxy) | ✅ Complete |
| 6 | Tauri app distribution (Flatpak/DEB/RPM/AppImage) | 🟡 In Progress |
| 7 | OS ISO image (USB boot -> AI OS) | ⏳ Planned |

## Development Process

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Test first (RED) -> minimal implementation (GREEN) -> refactor
- **VERIFY** — Confirm by actually running the app (type checking alone is insufficient)
- **Commits** — English, `<type>(<scope>): <description>`
- **Formatter** — Biome (tab, double quote, semicolons)

## Reference Projects

| Project | What We Take |
|---------|-------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | Immutable Linux OS, GPU, gaming optimization |
| [OpenClaw](https://github.com/steipete/openclaw) | Gateway daemon, channel integration, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, plugin protocol |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/server separation, provider abstraction |
| Careti | LLM connection, tool set, sub-agent, context management |

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Nextain

## Links

- **Official Site:** [naia.nextain.io](https://naia.nextain.io)
- **Manual:** [naia.nextain.io/en/manual](https://naia.nextain.io/en/manual)
- **Dashboard:** [naia.nextain.io/en/dashboard](https://naia.nextain.io/en/dashboard)
