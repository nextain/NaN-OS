[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — Un systeme d'exploitation de bureau personnel ou vit un avatar IA

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "L'OS lui-meme est l'outil de l'IA. L'IA ne s'execute pas au-dessus de l'OS — l'IA controle l'OS."

## Qu'est-ce que Naia ?

Naia est une application de bureau Linux dans laquelle reside un avatar IA 3D. Communiquez avec l'IA par chat et voix, et elle execute directement la gestion de fichiers, les commandes terminal, les recherches web et l'ecriture de code. Tout le monde — pas seulement les developpeurs — peut avoir son propre agent IA.

### Fonctionnalites principales

- **Avatar 3D** — Un personnage VRM offre des conversations vivantes avec des expressions d'emotions (joie/tristesse/surprise/reflexion, etc.) et la synchronisation labiale
- **Multi LLM** — Prise en charge de 7 fournisseurs : Gemini, Claude, GPT, Grok, zAI, Ollama, Claude Code CLI
- **Execution d'outils** — 8 outils incluant lecture/ecriture de fichiers, execution terminal, recherche web, navigateur, sous-agent
- **70 competences** — 7 integrees + 63 personnalisees (meteo, GitHub, Slack, Notion, Spotify, Discord, etc.)
- **Conversation vocale** — TTS avec 5 fournisseurs (Nextain Cloud, Edge, Google, OpenAI, ElevenLabs) + STT
- **14 langues** — Coreen, anglais, japonais, chinois, francais, allemand, russe et plus
- **Integration de canaux** — Parlez a l'IA a tout moment via Discord DM
- **Securite a 4 niveaux** — Hierarchie de permissions de T0 (lecture) a T3 (dangereux), systeme d'approbation par outil, journaux d'audit
- **Compte Nextain** — Demarrez immediatement avec une utilisation basee sur les credits, sans cle API
- **Personnalisation** — Personnalisez le nom, la personnalite, le style de parole, l'avatar et le theme (8 types)

## Pourquoi Naia ?

Les outils IA existants suivent le paradigme "les humains utilisent l'IA comme outil". Naia inverse cette relation — **"Donner tout l'OS a l'IA."**

| Approche existante | Limitation | Naia |
|-------------------|------------|---------|
| **Extensions VS Code** (Copilot, Cline) | Il faut ouvrir l'IDE pour utiliser l'IA | Pas besoin d'IDE. Toujours actif |
| **Agents CLI** (Claude Code, Aider) | Fonctionne uniquement dans le terminal | Controle les fichiers, le navigateur, tout le systeme |
| **Applications chatbot** (ChatGPT, Gemini) | Ne peut que discuter, pas executer | Discussion + Execution. Dites "cree un fichier" et il le fait vraiment |
| **Daemon macOS** (OpenClaw) | Installation brew, macOS uniquement, CLI | Application de bureau + avatar 3D. Base sur Linux |
| **Frameworks IA** (LangChain) | Utilisable uniquement par les developpeurs | Onboarding en 7 etapes pour que tout le monde puisse commencer |

## Relation avec OpenClaw

Naia est construit sur l'ecosysteme [OpenClaw](https://github.com/openclaw-ai/openclaw), mais c'est un produit fondamentalement different.

| | OpenClaw | Naia |
|---|---------|---------|
| **Forme** | Daemon CLI + terminal | Application de bureau + avatar 3D |
| **Cible** | Developpeurs | Tout le monde |
| **UI** | Aucune (terminal) | Application native Tauri 2 (React + Three.js) |
| **Avatar** | Aucun | Personnage VRM 3D (emotions, synchronisation labiale, regard) |
| **LLM** | Fournisseur unique | Multi-fournisseur 7 + basculement en temps reel |
| **Voix** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + synchronisation labiale avatar |
| **Emotions** | Aucune | 6 emotions mappees aux expressions faciales |
| **Onboarding** | CUI | GUI + selection d'avatar VRM |
| **Suivi des couts** | Aucun | Tableau de bord de credits en temps reel |
| **Distribution** | npm install | Flatpak / AppImage / DEB / RPM + image OS |
| **Multilingue** | CLI anglais | GUI 14 langues |
| **Canaux** | Bot serveur (multicanal) | Bot Discord DM dedie a Naia |

**Ce que nous avons pris d'OpenClaw :** Architecture daemon, moteur d'execution d'outils, systeme de canaux, ecosysteme de competences (compatible avec 5 700+ competences Clawhub)

**Ce que Naia a construit de nouveau :** Tauri Shell, systeme d'avatar VRM, agent multi-LLM, moteur d'emotions, integration TTS/STT, assistant d'onboarding, suivi des couts, integration du compte Nextain, systeme de memoire (STM/LTM), couches de securite

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

**Une fusion de 3 projets :**
- **OpenClaw** — Daemon + execution d'outils + canaux + ecosysteme de competences
- **Careti** — Multi-LLM + protocole d'outils + communication stdio
- **OpenCode** — Pattern de separation client/serveur

## Structure du projet

```
naia-os/
├── shell/              # Application de bureau Tauri 2 (React + Rust)
│   ├── src/            #   Composants React + gestion d'etat
│   ├── src-tauri/      #   Backend Rust (gestion de processus, SQLite, auth)
│   └── e2e-tauri/      #   Tests E2E WebDriver
├── agent/              # Coeur de l'agent IA Node.js
│   ├── src/providers/  #   Fournisseurs LLM (Gemini, Claude, GPT, etc.)
│   ├── src/tts/        #   Fournisseurs TTS (Edge, Google, OpenAI, etc.)
│   ├── src/skills/     #   Competences integrees (13 TypeScript specifiques a Naia)
│   └── assets/         #   Competences fournies (64 skill.json)
├── gateway/            # Pont OpenClaw Gateway
├── flatpak/            # Empaquetage Flatpak (io.nextain.naia)
├── recipes/            # Recettes d'image OS BlueBuild
├── config/             # Configuration OS (systemd, scripts wrapper)
├── .agents/            # Contexte IA (anglais, JSON/YAML)
└── .users/             # Documentation humaine (coreen, Markdown)
```

## Documents de contexte (Dual-directory Architecture)

Une structure de documentation duale pour les agents IA et les developpeurs humains. `.agents/` contient du JSON/YAML optimise en tokens pour l'IA, `.users/` contient du Markdown en coreen pour les humains.

| Contexte IA (`.agents/`) | Documentation humaine (`.users/`) | Description |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | Regles du projet (SoT) |
| `context/project-index.yaml` | — | Index de contexte + regles de miroir |
| `context/vision.yaml` | `context/vision.md` | Vision du projet, concepts fondamentaux |
| `context/plan.yaml` | `context/plan.md` | Plan d'implementation, statut par phase |
| `context/architecture.yaml` | `context/architecture.md` | Architecture hybride, couches de securite |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | Synchronisation OpenClaw Gateway |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Architecture d'integration Discord |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | Cycle de developpement (PLAN->BUILD->VERIFY) |

**Regle de miroir :** Lorsqu'un cote est modifie, l'autre doit toujours etre synchronise.

## Stack technique

| Couche | Technologie | Usage |
|--------|-------------|-------|
| OS | Bazzite (Fedora Atomic) | Linux immuable, pilotes GPU |
| Build OS | BlueBuild | Images OS basees sur conteneurs |
| Application de bureau | Tauri 2 (Rust) | Shell natif |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | Rendu VRM 3D |
| Gestion d'etat | Zustand | Etat client |
| Moteur LLM | Node.js + multi SDK | Coeur de l'agent |
| Protocole | stdio JSON lines | Communication Shell <-> Agent |
| Gateway | OpenClaw | Daemon + serveur RPC |
| BDD | SQLite (rusqlite) | Memoire, journaux d'audit |
| Formateur | Biome | Linting + formatage |
| Tests | Vitest + tauri-driver | Unitaires + E2E |
| Paquets | pnpm | Gestion des dependances |

## Demarrage rapide

### Prerequis

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (pour la compilation Tauri)
- Paquets systeme : `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Execution en developpement

```bash
# Installer les dependances
cd shell && pnpm install
cd ../agent && pnpm install

# Lancer l'application Tauri (Gateway + Agent auto-spawn)
cd ../shell && pnpm run tauri dev
```

Au lancement de l'application, automatiquement :
1. Verification de sante OpenClaw Gateway → reutilisation si en cours d'execution, sinon auto-spawn
2. Spawn Agent Core (Node.js, connexion stdio)
3. A la fermeture de l'application, seul le Gateway auto-spawne est termine

### Tests

```bash
cd shell && pnpm test                # Tests unitaires Shell
cd agent && pnpm test                # Tests unitaires Agent
cd agent && pnpm exec tsc --noEmit   # Verification des types
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Tests Rust

# E2E (Gateway + cle API requise)
cd shell && pnpm run test:e2e:tauri
```

### Build Flatpak

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Modele de securite

Naia applique un modele de securite **Defense en profondeur (Defense in Depth)** :

| Couche | Protection |
|--------|-----------|
| OS | rootfs immuable Bazzite + SELinux |
| Gateway | Authentification appareil OpenClaw + portees de token |
| Agent | Permissions a 4 niveaux (T0~T3) + blocage par outil |
| Shell | Modale d'approbation utilisateur + bascule ON/OFF des outils |
| Audit | Journal d'audit SQLite (toutes les executions d'outils enregistrees) |

## Systeme de memoire

- **Memoire a court terme (STM) :** Conversation de session en cours (Zustand + SQLite)
- **Memoire a long terme (LTM) :** Resumes de session (generes par LLM) + extraction automatique des faits/preferences utilisateur
- **Competence Memo :** Sauvegarde/recuperation explicite de memos via `skill_memo`

## Etat actuel

| Phase | Description | Statut |
|-------|-------------|--------|
| 0 | Pipeline de deploiement (BlueBuild -> ISO) | ✅ Termine |
| 1 | Integration avatar (rendu VRM 3D) | ✅ Termine |
| 2 | Conversation (texte/voix + synchronisation labiale + emotions) | ✅ Termine |
| 3 | Execution d'outils (8 outils + permissions + audit) | ✅ Termine |
| 4 | Daemon permanent (Gateway + Skills + Memoire + Discord) | ✅ Termine |
| 5 | Integration compte Nextain (OAuth + credits + proxy LLM) | ✅ Termine |
| 6 | Distribution app Tauri (Flatpak/DEB/RPM/AppImage) | 🟡 En cours |
| 7 | Image ISO OS (demarrage USB -> AI OS) | ⏳ Prevu |

## Processus de developpement

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Tests d'abord (RED) -> implementation minimale (GREEN) -> refactoring
- **VERIFY** — Confirmer en executant reellement l'application (la verification de types seule est insuffisante)
- **Commits** — Anglais, `<type>(<scope>): <description>`
- **Formateur** — Biome (tab, double quote, points-virgules)

## Projets de reference

| Projet | Ce que nous prenons |
|--------|-------------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | OS Linux immuable, GPU, optimisation gaming |
| [OpenClaw](https://github.com/steipete/openclaw) | Daemon Gateway, integration de canaux, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | Avatar VRM, protocole de plugins |
| [OpenCode](https://github.com/anomalyco/opencode) | Separation client/serveur, abstraction de fournisseurs |
| Careti | Connexion LLM, ensemble d'outils, sous-agent, gestion de contexte |

## Licence

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## Liens

- **Site officiel :** [naia.nextain.io](https://naia.nextain.io)
- **Manuel :** [naia.nextain.io/fr/manual](https://naia.nextain.io/fr/manual)
- **Tableau de bord :** [naia.nextain.io/fr/dashboard](https://naia.nextain.io/fr/dashboard)
