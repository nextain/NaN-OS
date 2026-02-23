[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — Ein persoenliches Desktop-Betriebssystem, in dem ein KI-Avatar lebt

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "Das OS selbst ist das Werkzeug der KI. Die KI laeuft nicht auf dem OS — die KI steuert das OS."

## Was ist Naia?

Naia ist eine Linux-Desktop-App, in der ein 3D-Avatar-KI dauerhaft lebt. Unterhalten Sie sich per Chat und Sprache mit der KI, und sie fuehrt direkt Dateiverwaltung, Terminal-Befehle, Websuchen und Code-Erstellung durch. Jeder — nicht nur Entwickler — kann seinen eigenen KI-Agenten haben.

### Kernfunktionen

- **3D-Avatar** — VRM-Charakter liefert lebendige Gespraeche mit Emotionsausdruecken (Freude/Traurigkeit/Ueberraschung/Nachdenken usw.) und Lippensynchronisation
- **Multi-LLM** — Unterstuetzt 7 Anbieter: Gemini, Claude, GPT, Grok, zAI, Ollama, Claude Code CLI
- **Werkzeug-Ausfuehrung** — 8 Werkzeuge einschliesslich Datei-Lesen/Schreiben, Terminal-Ausfuehrung, Websuche, Browser, Sub-Agent
- **70 Faehigkeiten** — 7 eingebaut + 63 benutzerdefiniert (Wetter, GitHub, Slack, Notion, Spotify, Discord usw.)
- **Sprachgespraech** — TTS mit 5 Anbietern (Nextain Cloud, Edge, Google, OpenAI, ElevenLabs) + STT
- **14 Sprachen** — Koreanisch, Englisch, Japanisch, Chinesisch, Franzoesisch, Deutsch, Russisch und mehr
- **Kanal-Integration** — Sprechen Sie jederzeit und ueberall per Discord DM mit der KI
- **4-Stufen-Sicherheit** — Berechtigungshierarchie von T0 (Lesen) bis T3 (Gefaehrlich), werkzeugspezifisches Genehmigungssystem, Audit-Logs
- **Nextain-Konto** — Sofort mit kreditbasierter Nutzung starten, kein API-Schluessel noetig
- **Personalisierung** — Name, Persoenlichkeit, Sprechstil, Avatar und Theme (8 Typen) anpassen

## Warum Naia?

Bestehende KI-Werkzeuge folgen dem Paradigma "Menschen nutzen KI als Werkzeug". Naia kehrt diese Beziehung um — **"Gib der KI das gesamte OS."**

| Bestehender Ansatz | Einschraenkung | Naia |
|-------------------|----------------|---------|
| **VS Code-Erweiterungen** (Copilot, Cline) | IDE muss geoeffnet werden, um KI zu nutzen | Kein IDE noetig. Immer aktiv |
| **CLI-Agenten** (Claude Code, Aider) | Funktioniert nur im Terminal | Steuert Dateien, Browser, gesamtes System |
| **Chatbot-Apps** (ChatGPT, Gemini) | Kann nur chatten, nicht ausfuehren | Chat + Ausfuehrung. Sagen Sie "erstelle eine Datei" und es passiert wirklich |
| **macOS-Daemon** (OpenClaw) | brew install, nur macOS, CLI | Desktop-App + 3D-Avatar. Linux-basiert |
| **KI-Frameworks** (LangChain) | Nur von Entwicklern nutzbar | 7-Schritte-Onboarding fuer jeden |

## Beziehung zu OpenClaw

Naia ist auf dem [OpenClaw](https://github.com/openclaw-ai/openclaw)-Oekosystem aufgebaut, aber es ist ein grundlegend anderes Produkt.

| | OpenClaw | Naia |
|---|---------|---------|
| **Form** | CLI-Daemon + Terminal | Desktop-App + 3D-Avatar |
| **Zielgruppe** | Entwickler | Jeder |
| **UI** | Keine (Terminal) | Tauri 2 native App (React + Three.js) |
| **Avatar** | Keiner | VRM 3D-Charakter (Emotionen, Lippensynchronisation, Blick) |
| **LLM** | Einzelner Anbieter | Multi-Anbieter 7 + Echtzeit-Umschaltung |
| **Sprache** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + Avatar-Lippensynchronisation |
| **Emotionen** | Keine | 6 Emotionen auf Gesichtsausdruecke abgebildet |
| **Onboarding** | CUI | GUI + VRM-Avatar-Auswahl |
| **Kostenverfolgung** | Keine | Echtzeit-Kredit-Dashboard |
| **Verteilung** | npm install | Flatpak / AppImage / DEB / RPM + OS-Image |
| **Mehrsprachig** | Englische CLI | 14-Sprachen-GUI |
| **Kanaele** | Server-Bot (Multi-Kanal) | Naia-dedizierter Discord DM-Bot |

**Was wir von OpenClaw uebernommen haben:** Daemon-Architektur, Werkzeug-Ausfuehrungsengine, Kanal-System, Faehigkeiten-Oekosystem (5.700+ Clawhub-Faehigkeiten kompatibel)

**Was Naia neu gebaut hat:** Tauri Shell, VRM-Avatar-System, Multi-LLM-Agent, Emotions-Engine, TTS/STT-Integration, Onboarding-Assistent, Kostenverfolgung, Nextain-Konto-Integration, Gedaechtnissystem (STM/LTM), Sicherheitsschichten

## Architektur

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

**Eine Fusion aus 3 Projekten:**
- **OpenClaw** — Daemon + Werkzeug-Ausfuehrung + Kanaele + Faehigkeiten-Oekosystem
- **Careti** — Multi-LLM + Werkzeug-Protokoll + stdio-Kommunikation
- **OpenCode** — Client/Server-Trennungsmuster

## Projektstruktur

```
naia-os/
├── shell/              # Tauri 2 Desktop-App (React + Rust)
│   ├── src/            #   React-Komponenten + Zustandsverwaltung
│   ├── src-tauri/      #   Rust-Backend (Prozessverwaltung, SQLite, Auth)
│   └── e2e-tauri/      #   WebDriver E2E-Tests
├── agent/              # Node.js KI-Agent-Kern
│   ├── src/providers/  #   LLM-Anbieter (Gemini, Claude, GPT usw.)
│   ├── src/tts/        #   TTS-Anbieter (Edge, Google, OpenAI usw.)
│   ├── src/skills/     #   Eingebaute Faehigkeiten (13 Naia-spezifische TypeScript)
│   └── assets/         #   Gebundelte Faehigkeiten (64 skill.json)
├── gateway/            # OpenClaw Gateway-Bruecke
├── flatpak/            # Flatpak-Paketierung (io.nextain.naia)
├── recipes/            # BlueBuild OS-Image-Rezepte
├── config/             # OS-Konfiguration (systemd, Wrapper-Skripte)
├── .agents/            # KI-Kontext (Englisch, JSON/YAML)
└── .users/             # Menschliche Dokumentation (Koreanisch, Markdown)
```

## Kontext-Dokumente (Dual-directory Architecture)

Eine duale Dokumentationsstruktur fuer KI-Agenten und menschliche Entwickler. `.agents/` enthaelt token-effizientes JSON/YAML fuer KI, `.users/` enthaelt koreanisches Markdown fuer Menschen.

| KI-Kontext (`.agents/`) | Menschliche Doku (`.users/`) | Beschreibung |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | Projektregeln (SoT) |
| `context/project-index.yaml` | — | Kontext-Index + Spiegelungsregeln |
| `context/vision.yaml` | `context/vision.md` | Projektvision, Kernkonzepte |
| `context/plan.yaml` | `context/plan.md` | Implementierungsplan, phasenweiser Status |
| `context/architecture.yaml` | `context/architecture.md` | Hybride Architektur, Sicherheitsschichten |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | OpenClaw Gateway-Synchronisation |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Discord-Integrationsarchitektur |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | Entwicklungszyklus (PLAN->BUILD->VERIFY) |

**Spiegelungsregel:** Wenn eine Seite geaendert wird, muss die andere immer synchronisiert werden.

## Technologie-Stack

| Schicht | Technologie | Zweck |
|---------|-------------|-------|
| OS | Bazzite (Fedora Atomic) | Unveraenderliches Linux, GPU-Treiber |
| OS-Build | BlueBuild | Container-basierte OS-Images |
| Desktop-App | Tauri 2 (Rust) | Native Shell |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | 3D-VRM-Rendering |
| Zustandsverwaltung | Zustand | Client-Zustand |
| LLM-Engine | Node.js + Multi-SDK | Agent-Kern |
| Protokoll | stdio JSON lines | Shell <-> Agent-Kommunikation |
| Gateway | OpenClaw | Daemon + RPC-Server |
| DB | SQLite (rusqlite) | Speicher, Audit-Logs |
| Formatierer | Biome | Linting + Formatierung |
| Tests | Vitest + tauri-driver | Unit + E2E |
| Paket | pnpm | Abhaengigkeitsverwaltung |

## Schnellstart

### Voraussetzungen

- Linux (Bazzite, Ubuntu, Fedora usw.)
- Node.js 22+, pnpm 9+
- Rust stable (fuer Tauri-Build)
- Systempakete: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Entwicklungslauf

```bash
# Abhaengigkeiten installieren
cd shell && pnpm install
cd ../agent && pnpm install

# Tauri-App ausfuehren (Gateway + Agent Auto-Spawn)
cd ../shell && pnpm run tauri dev
```

Beim App-Start automatisch:
1. OpenClaw Gateway Health Check → Wiederverwendung wenn laufend, sonst Auto-Spawn
2. Agent Core Spawn (Node.js, stdio-Verbindung)
3. Beim App-Beenden wird nur das auto-gespawnte Gateway beendet

### Tests

```bash
cd shell && pnpm test                # Shell-Unit-Tests
cd agent && pnpm test                # Agent-Unit-Tests
cd agent && pnpm exec tsc --noEmit   # Typ-Pruefung
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust-Tests

# E2E (Gateway + API-Schluessel erforderlich)
cd shell && pnpm run test:e2e:tauri
```

### Flatpak-Build

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Sicherheitsmodell

Naia wendet ein **Tiefenverteidigung (Defense in Depth)** Sicherheitsmodell an:

| Schicht | Schutz |
|---------|--------|
| OS | Bazzite unveraenderliches rootfs + SELinux |
| Gateway | OpenClaw-Geraeteauthentifizierung + Token-Scopes |
| Agent | 4-Stufen-Berechtigungen (T0~T3) + werkzeugspezifische Blockierung |
| Shell | Benutzer-Genehmigungsmodal + Werkzeug-ON/OFF-Umschalter |
| Audit | SQLite-Audit-Log (alle Werkzeug-Ausfuehrungen aufgezeichnet) |

## Gedaechtnissystem

- **Kurzzeitgedaechtnis (STM):** Aktuelle Sitzungsgespraeche (Zustand + SQLite)
- **Langzeitgedaechtnis (LTM):** Sitzungszusammenfassungen (LLM-generiert) + automatische Extraktion von Benutzerfakten/-praeferenzen
- **Memo-Faehigkeit:** Explizites Memo-Speichern/-Abrufen ueber `skill_memo`

## Aktueller Status

| Phase | Beschreibung | Status |
|-------|-------------|--------|
| 0 | Bereitstellungspipeline (BlueBuild -> ISO) | ✅ Abgeschlossen |
| 1 | Avatar-Integration (VRM 3D-Rendering) | ✅ Abgeschlossen |
| 2 | Gespraech (Text/Sprache + Lippensynchronisation + Emotionen) | ✅ Abgeschlossen |
| 3 | Werkzeug-Ausfuehrung (8 Werkzeuge + Berechtigungen + Audit) | ✅ Abgeschlossen |
| 4 | Immer-an-Daemon (Gateway + Skills + Gedaechtnis + Discord) | ✅ Abgeschlossen |
| 5 | Nextain-Konto-Integration (OAuth + Credits + LLM-Proxy) | ✅ Abgeschlossen |
| 6 | Tauri-App-Verteilung (Flatpak/DEB/RPM/AppImage) | 🟡 In Arbeit |
| 7 | OS-ISO-Image (USB-Boot -> KI-OS) | ⏳ Geplant |

## Entwicklungsprozess

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Tests zuerst (RED) -> minimale Implementierung (GREEN) -> Refactoring
- **VERIFY** — Bestaetigung durch tatsaechliches Ausfuehren der App (Typ-Pruefung allein ist unzureichend)
- **Commits** — Englisch, `<type>(<scope>): <description>`
- **Formatierer** — Biome (Tab, doppelte Anfuehrungszeichen, Semikolons)

## Referenzprojekte

| Projekt | Was wir uebernehmen |
|---------|---------------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | Unveraenderliches Linux OS, GPU, Gaming-Optimierung |
| [OpenClaw](https://github.com/steipete/openclaw) | Gateway-Daemon, Kanal-Integration, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, Plugin-Protokoll |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server-Trennung, Anbieter-Abstraktion |
| Careti | LLM-Verbindung, Werkzeug-Set, Sub-Agent, Kontext-Verwaltung |

## Lizenz

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## Links

- **Offizielle Website:** [naia.nextain.io](https://naia.nextain.io)
- **Handbuch:** [naia.nextain.io/de/manual](https://naia.nextain.io/de/manual)
- **Dashboard:** [naia.nextain.io/de/dashboard](https://naia.nextain.io/de/dashboard)
