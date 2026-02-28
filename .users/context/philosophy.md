<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Naia OS Project Philosophy

Human-readable guide for `.agents/context/philosophy.yaml`.

## Purpose

This document explains the core philosophy of the Naia OS project — **"why we build this"**.
Separated from architecture (what) and workflows (how), this is the reason the project exists.

---

## Core Principles

### 1. AI Sovereignty

**"Users choose their AI — no vendor lock-in"**

- Support multiple LLM providers (Vertex AI, Anthropic, xAI, local models)
- Users own their AI configuration and can switch freely
- No single provider dependency in core architecture

### 2. Privacy First

**"Local execution by default — cloud is opt-in"**

- Desktop-first architecture (Tauri, not Electron cloud)
- User data stays on device unless explicitly shared
- Local LLM support (Ollama) as first-class citizen

### 3. Transparency

**"Open source — verify by reading the code"**

- All core logic is open source (Apache 2.0)
- AI context is open and forkable (CC-BY-SA 4.0)
- No hidden telemetry or data collection

### 4. Assembly over Invention

**"Compose from proven components — don't reinvent the wheel"**

- Use upstream projects as building blocks (OpenClaw, Tauri, etc.)
- Contribute back to upstream when possible
- Reference submodules (ref-*) for learning and tracking

### 5. Always On

**"AI companion as a daemon — always present, always ready"**

- Background agent architecture (Node.js daemon)
- Gateway process management (spawn, restart, health check)
- Persistent AI character state across sessions

### 6. Avatar-Centric

**"AI as a living character — not just a tool"**

- Naia: named AI character with personality and voice
- 3D avatar with TTS and emotional expression
- Soul document (SOUL.md) defines character identity

### 7. Vibe Coding Era

**"AI context files are the new contribution infrastructure"**

- `.agents/` directories encode project philosophy, not just config
- Context quality determines AI collaboration quality
- Dual-directory architecture: AI-optimized + human-readable
- CC-BY-SA licensing preserves the contribution chain

---

## Related Files

- **SoT**: `.agents/context/philosophy.yaml`
- **Korean mirror**: `.users/context/philosophy.md`
