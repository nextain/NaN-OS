[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — Um sistema operacional de desktop pessoal onde vive um avatar de IA

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "O SO em si e a ferramenta da IA. A IA nao roda sobre o SO — a IA controla o SO."

## O que e o Naia?

Naia e um aplicativo de desktop Linux onde reside permanentemente um avatar de IA 3D. Converse com a IA por chat e voz, e ela executa diretamente gerenciamento de arquivos, comandos de terminal, buscas na web e escrita de codigo. Qualquer pessoa — nao apenas desenvolvedores — pode ter seu proprio agente de IA.

### Funcionalidades principais

- **Avatar 3D** — Personagem VRM oferece conversas vivas com expressoes de emocoes (alegria/tristeza/surpresa/reflexao, etc.) e sincronizacao labial
- **Multi LLM** — Suporte a 7 provedores: Gemini, Claude, GPT, Grok, zAI, Ollama, Claude Code CLI
- **Execucao de ferramentas** — 8 ferramentas incluindo leitura/escrita de arquivos, execucao de terminal, busca web, navegador, sub-agente
- **70 habilidades** — 7 integradas + 63 personalizadas (clima, GitHub, Slack, Notion, Spotify, Discord, etc.)
- **Conversa por voz** — TTS com 5 provedores (Nextain Cloud, Edge, Google, OpenAI, ElevenLabs) + STT
- **14 idiomas** — Coreano, ingles, japones, chines, frances, alemao, russo e mais
- **Integracao de canais** — Converse com a IA a qualquer momento via Discord DM
- **Seguranca de 4 niveis** — Hierarquia de permissoes de T0 (leitura) a T3 (perigoso), sistema de aprovacao por ferramenta, logs de auditoria
- **Conta Nextain** — Comece imediatamente com uso baseado em creditos, sem necessidade de chave API
- **Personalizacao** — Personalize nome, personalidade, estilo de fala, avatar e tema (8 tipos)

## Por que Naia?

As ferramentas de IA existentes seguem o paradigma "humanos usam IA como ferramenta". Naia inverte essa relacao — **"De a IA o SO inteiro."**

| Abordagem existente | Limitacao | Naia |
|--------------------|-----------|---------|
| **Extensoes VS Code** (Copilot, Cline) | Precisa abrir IDE para usar IA | Nao precisa de IDE. Sempre ligado |
| **Agentes CLI** (Claude Code, Aider) | Funciona apenas dentro do terminal | Controla arquivos, navegador, sistema inteiro |
| **Apps de chatbot** (ChatGPT, Gemini) | So pode conversar, nao executar | Chat + Execucao. Diga "crie um arquivo" e ele realmente cria |
| **Daemon macOS** (OpenClaw) | brew install, apenas macOS, CLI | App de desktop + avatar 3D. Baseado em Linux |
| **Frameworks de IA** (LangChain) | Apenas para desenvolvedores | Onboarding de 7 passos para qualquer pessoa comecar |

## Relacao com OpenClaw

Naia e construido sobre o ecossistema [OpenClaw](https://github.com/openclaw-ai/openclaw), mas e um produto fundamentalmente diferente.

| | OpenClaw | Naia |
|---|---------|---------|
| **Forma** | Daemon CLI + terminal | App de desktop + avatar 3D |
| **Publico** | Desenvolvedores | Todos |
| **UI** | Nenhuma (terminal) | App nativo Tauri 2 (React + Three.js) |
| **Avatar** | Nenhum | Personagem VRM 3D (emocoes, sincronizacao labial, olhar) |
| **LLM** | Provedor unico | Multi-provedor 7 + troca em tempo real |
| **Voz** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + sincronizacao labial do avatar |
| **Emocoes** | Nenhuma | 6 emocoes mapeadas para expressoes faciais |
| **Onboarding** | CUI | GUI + selecao de avatar VRM |
| **Rastreamento de custos** | Nenhum | Painel de creditos em tempo real |
| **Distribuicao** | npm install | Flatpak / AppImage / DEB / RPM + imagem de SO |
| **Multilingue** | CLI em ingles | GUI de 14 idiomas |
| **Canais** | Bot de servidor (multicanal) | Bot de Discord DM dedicado ao Naia |

**O que pegamos do OpenClaw:** Arquitetura de daemon, motor de execucao de ferramentas, sistema de canais, ecossistema de habilidades (compativel com 5.700+ habilidades Clawhub)

**O que Naia construiu novo:** Tauri Shell, sistema de avatar VRM, agente multi-LLM, motor de emocoes, integracao TTS/STT, assistente de onboarding, rastreamento de custos, integracao de conta Nextain, sistema de memoria (STM/LTM), camadas de seguranca

## Arquitetura

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

**Uma fusao de 3 projetos:**
- **OpenClaw** — Daemon + execucao de ferramentas + canais + ecossistema de habilidades
- **Careti** — Multi-LLM + protocolo de ferramentas + comunicacao stdio
- **OpenCode** — Padrao de separacao cliente/servidor

## Estrutura do projeto

```
naia-os/
├── shell/              # App de desktop Tauri 2 (React + Rust)
│   ├── src/            #   Componentes React + gerenciamento de estado
│   ├── src-tauri/      #   Backend Rust (gerenciamento de processos, SQLite, autenticacao)
│   └── e2e-tauri/      #   Testes E2E WebDriver
├── agent/              # Nucleo do agente IA Node.js
│   ├── src/providers/  #   Provedores LLM (Gemini, Claude, GPT, etc.)
│   ├── src/tts/        #   Provedores TTS (Edge, Google, OpenAI, etc.)
│   ├── src/skills/     #   Habilidades integradas (13 TypeScript especificos do Naia)
│   └── assets/         #   Habilidades incluidas (64 skill.json)
├── gateway/            # Ponte OpenClaw Gateway
├── flatpak/            # Empacotamento Flatpak (io.nextain.naia)
├── recipes/            # Receitas de imagem de SO BlueBuild
├── config/             # Configuracao de SO (systemd, scripts wrapper)
├── .agents/            # Contexto de IA (ingles, JSON/YAML)
└── .users/             # Documentacao humana (coreano, Markdown)
```

## Documentos de contexto (Dual-directory Architecture)

Uma estrutura de documentacao dual para agentes de IA e desenvolvedores humanos. `.agents/` contem JSON/YAML eficiente em tokens para IA, `.users/` contem Markdown em coreano para humanos.

| Contexto IA (`.agents/`) | Documentos humanos (`.users/`) | Descricao |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | Regras do projeto (SoT) |
| `context/project-index.yaml` | — | Indice de contexto + regras de espelhamento |
| `context/vision.yaml` | `context/vision.md` | Visao do projeto, conceitos fundamentais |
| `context/plan.yaml` | `context/plan.md` | Plano de implementacao, status por fase |
| `context/architecture.yaml` | `context/architecture.md` | Arquitetura hibrida, camadas de seguranca |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | Sincronizacao do OpenClaw Gateway |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Arquitetura de integracao Discord |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | Ciclo de desenvolvimento (PLAN->BUILD->VERIFY) |

**Regra de espelhamento:** Quando um lado e modificado, o outro deve sempre ser sincronizado.

## Stack tecnologico

| Camada | Tecnologia | Proposito |
|--------|-----------|-----------|
| SO | Bazzite (Fedora Atomic) | Linux imutavel, drivers GPU |
| Build SO | BlueBuild | Imagens de SO baseadas em conteineres |
| App de desktop | Tauri 2 (Rust) | Shell nativo |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | Renderizacao VRM 3D |
| Gerenciamento de estado | Zustand | Estado do cliente |
| Motor LLM | Node.js + multi SDK | Nucleo do agente |
| Protocolo | stdio JSON lines | Comunicacao Shell <-> Agent |
| Gateway | OpenClaw | Daemon + servidor RPC |
| BD | SQLite (rusqlite) | Memoria, logs de auditoria |
| Formatador | Biome | Linting + formatacao |
| Testes | Vitest + tauri-driver | Unitarios + E2E |
| Pacotes | pnpm | Gerenciamento de dependencias |

## Inicio rapido

### Pre-requisitos

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (para build Tauri)
- Pacotes do sistema: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Execucao de desenvolvimento

```bash
# Instalar dependencias
cd shell && pnpm install
cd ../agent && pnpm install

# Executar app Tauri (Gateway + Agent auto-spawn)
cd ../shell && pnpm run tauri dev
```

Ao iniciar o app, automaticamente:
1. Health check do OpenClaw Gateway → reutilizar se em execucao, senao auto-spawn
2. Spawn do Agent Core (Node.js, conexao stdio)
3. Ao fechar o app, apenas o Gateway auto-spawnado e encerrado

### Testes

```bash
cd shell && pnpm test                # Testes unitarios do Shell
cd agent && pnpm test                # Testes unitarios do Agent
cd agent && pnpm exec tsc --noEmit   # Verificacao de tipos
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Testes Rust

# E2E (requer Gateway + chave API)
cd shell && pnpm run test:e2e:tauri
```

### Build Flatpak

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Modelo de seguranca

Naia aplica um modelo de seguranca de **Defesa em profundidade (Defense in Depth)**:

| Camada | Protecao |
|--------|---------|
| SO | rootfs imutavel Bazzite + SELinux |
| Gateway | Autenticacao de dispositivo OpenClaw + escopos de token |
| Agente | Permissoes de 4 niveis (T0~T3) + bloqueio por ferramenta |
| Shell | Modal de aprovacao do usuario + toggle ON/OFF de ferramentas |
| Auditoria | Log de auditoria SQLite (todas as execucoes de ferramentas registradas) |

## Sistema de memoria

- **Memoria de curto prazo (STM):** Conversa da sessao atual (Zustand + SQLite)
- **Memoria de longo prazo (LTM):** Resumos de sessao (gerados por LLM) + extracao automatica de fatos/preferencias do usuario
- **Habilidade de memo:** Salvar/recuperar memos explicitamente via `skill_memo`

## Status atual

| Fase | Descricao | Status |
|------|-----------|--------|
| 0 | Pipeline de deploy (BlueBuild -> ISO) | ✅ Concluido |
| 1 | Integracao de avatar (renderizacao VRM 3D) | ✅ Concluido |
| 2 | Conversa (texto/voz + sincronizacao labial + emocoes) | ✅ Concluido |
| 3 | Execucao de ferramentas (8 ferramentas + permissoes + auditoria) | ✅ Concluido |
| 4 | Daemon sempre ativo (Gateway + Skills + Memoria + Discord) | ✅ Concluido |
| 5 | Integracao de conta Nextain (OAuth + creditos + proxy LLM) | ✅ Concluido |
| 6 | Distribuicao do app Tauri (Flatpak/DEB/RPM/AppImage) | 🟡 Em andamento |
| 7 | Imagem ISO do SO (boot USB -> IA SO) | ⏳ Planejado |

## Processo de desenvolvimento

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Testes primeiro (RED) -> implementacao minima (GREEN) -> refatoracao
- **VERIFY** — Confirmar executando realmente o app (verificacao de tipos sozinha e insuficiente)
- **Commits** — Ingles, `<type>(<scope>): <description>`
- **Formatador** — Biome (tab, aspas duplas, ponto e virgula)

## Projetos de referencia

| Projeto | O que pegamos |
|---------|--------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | SO Linux imutavel, GPU, otimizacao para jogos |
| [OpenClaw](https://github.com/steipete/openclaw) | Daemon Gateway, integracao de canais, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | Avatar VRM, protocolo de plugins |
| [OpenCode](https://github.com/anomalyco/opencode) | Separacao cliente/servidor, abstracao de provedores |
| Careti | Conexao LLM, conjunto de ferramentas, sub-agente, gerenciamento de contexto |

## Licenca

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## Links

- **Site oficial:** [naia.nextain.io](https://naia.nextain.io)
- **Manual:** [naia.nextain.io/pt/manual](https://naia.nextain.io/pt/manual)
- **Painel:** [naia.nextain.io/pt/dashboard](https://naia.nextain.io/pt/dashboard)
