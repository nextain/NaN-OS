[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

<p align="center">
  <img src="../assets/readme-hero.jpg" alt="Naia OS" width="800" />
</p>

**The Next Generation AI OS** — Un sistema operativo de IA personal donde vive tu propia IA

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "Codigo abierto. Tu IA, tus reglas. Elige tu IA, moldea su memoria y personalidad, dale tu voz — todo en tu propia maquina, todo verificable en el codigo."

> **Nota:** Las muestras de avatares VRM mostradas son de [VRoid Hub](https://hub.vroid.com/). El VRM oficial de la mascota Naia esta en desarrollo.

## Conoce a Naia

<p align="center">
  <img src="../assets/character/naia-default-character.png" alt="Naia predeterminado" width="180" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="../assets/character/naia-character.png" alt="Naia con cabello" width="180" />
</p>

<p align="center">
  <em>Predeterminado (sin genero) &nbsp;·&nbsp; Con cabello (variante femenina)</em>
</p>

<details>
<summary>Mas variaciones del personaje</summary>
<p align="center">
  <img src="../assets/character/naia-varaiations.png" alt="Variaciones de Naia" width="600" />
</p>
</details>

## Conecta el USB, ejecuta IA al instante

<p align="center">
  <img src="../assets/plug-usb-and-run-ai.webp" alt="Conecta el USB y ejecuta Naia OS" width="600" />
</p>

<p align="center">
  <strong>Sin instalación, sin configuración.</strong><br/>
  Solo conecta el USB de Naia OS a cualquier portátil y enciéndelo — tu propia IA cobra vida al instante.<br/>
  Pruébalo e instálalo en tu disco duro si te gusta.
</p>

## Que es Naia?

Naia es un SO de IA personal que otorga a las personas soberania total sobre su IA. Elige que IA usar (incluyendo modelos locales), configura su memoria y personalidad localmente, personaliza su avatar 3D y voz — todo permanece en tu maquina, bajo tu control.

Esto no es solo otra herramienta de IA. Es un sistema operativo donde tu IA vive, crece y trabaja junto a ti. Hoy es un SO de escritorio con un avatar 3D. Manana — avatares de video en tiempo real, cantar, jugar, y eventualmente tu propio Physical AI (SO para androide).

### Filosofia central

- **Soberania de IA** — Tu eliges tu IA. Nube o local. El SO no dicta.
- **Control completo** — Memoria, personalidad, configuracion — todo almacenado localmente. Sin dependencia de la nube.
- **Tu propia IA** — Personaliza avatar, voz, nombre, personalidad. Hazla verdaderamente tuya.
- **Siempre activa** — La IA funciona 24/7 en segundo plano, recibiendo mensajes y trabajando incluso cuando no estas.
- **Codigo abierto** — Apache 2.0. Inspecciona como la IA maneja tus datos. Modifica, personaliza, contribuye.
- **Vision de futuro** — Avatares VRM 3D → avatares de video en tiempo real → cantar y jugar juntos → Physical AI

### Funcionalidades

- **Avatar 3D** — Personaje VRM con expresiones de emociones (alegria/tristeza/sorpresa/reflexion) y sincronizacion labial
- **Libertad de IA** — 7 proveedores en la nube (Gemini, Claude, GPT, Grok, zAI) + IA local (Ollama) + Claude Code CLI
- **Local primero** — Memoria, personalidad, toda la configuracion almacenada en tu maquina
- **Ejecucion de herramientas** — 8 herramientas: lectura/escritura de archivos, terminal, busqueda web, navegador, sub-agente
- **70+ habilidades** — 7 integradas + 63 personalizadas + 5,700+ habilidades de la comunidad ClawHub
- **Voz** — 5 proveedores TTS + STT + sincronizacion labial. Dale a tu IA la voz que quieras.
- **14 idiomas** — Coreano, ingles, japones, chino, frances, aleman, ruso y mas
- **Siempre encendido** — El demonio OpenClaw Gateway mantiene tu IA funcionando en segundo plano
- **Integracion de canales** — Habla con tu IA via Discord DM, en cualquier momento, desde cualquier lugar
- **Seguridad de 4 niveles** — T0 (lectura) a T3 (peligroso), aprobacion por herramienta, registros de auditoria
- **Personalizacion** — Nombre, personalidad, estilo de habla, avatar, tema (8 tipos)

## Por que Naia?

Otras herramientas de IA son solo "herramientas". Naia es **"tu propia IA"**.

| | Otras herramientas de IA | Naia |
|---|--------------------------|------|
| **Filosofia** | Usar IA como herramienta | Darle a la IA el SO. Vivir juntos. |
| **Publico** | Solo desarrolladores | Todos los que quieran su propia IA |
| **Eleccion de IA** | La plataforma decide | 7 nube + IA local — tu decides |
| **Datos** | Atrapados en la nube | Memoria, personalidad, configuracion todo local |
| **Avatar** | Ninguno | Personaje VRM 3D + emociones + sincronizacion labial |
| **Voz** | Solo texto o TTS basico | 5 TTS + STT + la voz propia de tu IA |
| **Despliegue** | npm / brew / pip | Aplicacion de escritorio o SO en USB arrancable |
| **Plataforma** | macOS / CLI / Web | Escritorio Linux nativo → futuro: Physical AI |
| **Costo** | Se requieren claves API por separado | Creditos gratis para empezar, IA local completamente gratis |

## Relacion con OpenClaw

Naia esta construido sobre el ecosistema [OpenClaw](https://github.com/openclaw-ai/openclaw), pero es un producto fundamentalmente diferente.

| | OpenClaw | Naia |
|---|---------|---------|
| **Forma** | Demonio CLI + terminal | Aplicacion de escritorio + avatar 3D |
| **Objetivo** | Desarrolladores | Todos |
| **UI** | Ninguna (terminal) | Aplicacion nativa Tauri 2 (React + Three.js) |
| **Avatar** | Ninguno | Personaje VRM 3D (emociones, sincronizacion labial, mirada) |
| **LLM** | Proveedor unico | Multi-proveedor 7 + cambio en tiempo real |
| **Voz** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + sincronizacion labial del avatar |
| **Emociones** | Ninguna | 6 emociones mapeadas a expresiones faciales |
| **Onboarding** | CUI | GUI + seleccion de avatar VRM |
| **Seguimiento de costos** | Ninguno | Panel de creditos en tiempo real |
| **Distribucion** | npm install | Flatpak / AppImage / DEB / RPM + imagen de SO |
| **Multilingue** | CLI en ingles | GUI de 14 idiomas |
| **Canales** | Bot de servidor (multicanal) | Bot de Discord DM dedicado a Naia |

**Lo que tomamos de OpenClaw:** Arquitectura de demonio, motor de ejecucion de herramientas, sistema de canales, ecosistema de habilidades (compatible con 5,700+ habilidades Clawhub)

**Lo que Naia construyo nuevo:** Tauri Shell, sistema de avatar VRM, agente multi-LLM, motor de emociones, integracion TTS/STT, asistente de onboarding, seguimiento de costos, integracion de cuenta Nextain, sistema de memoria (STM/LTM), capas de seguridad

## Arquitectura

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

**Una fusion de 3 proyectos:**
- **OpenClaw** — Demonio + ejecucion de herramientas + canales + ecosistema de habilidades
- **Careti** — Multi-LLM + protocolo de herramientas + comunicacion stdio
- **OpenCode** — Patron de separacion cliente/servidor

## Estructura del proyecto

```
naia-os/
├── shell/              # Aplicacion de escritorio Tauri 2 (React + Rust)
│   ├── src/            #   Componentes React + gestion de estado
│   ├── src-tauri/      #   Backend Rust (gestion de procesos, SQLite, autenticacion)
│   └── e2e-tauri/      #   Pruebas E2E WebDriver
├── agent/              # Nucleo del agente IA Node.js
│   ├── src/providers/  #   Proveedores LLM (Gemini, Claude, GPT, etc.)
│   ├── src/tts/        #   Proveedores TTS (Edge, Google, OpenAI, etc.)
│   ├── src/skills/     #   Habilidades integradas (13 TypeScript especificos de Naia)
│   └── assets/         #   Habilidades incluidas (64 skill.json)
├── gateway/            # Puente OpenClaw Gateway
├── flatpak/            # Empaquetado Flatpak (io.nextain.naia)
├── recipes/            # Recetas de imagen de SO BlueBuild
├── config/             # Configuracion de SO (systemd, scripts envolventes)
├── .agents/            # Contexto de IA (ingles, JSON/YAML)
└── .users/             # Documentacion humana (coreano, Markdown)
```

## Documentos de contexto (Dual-directory Architecture)

Una estructura de documentacion dual para agentes de IA y desarrolladores humanos. `.agents/` contiene JSON/YAML eficiente en tokens para IA, `.users/` contiene Markdown en coreano para humanos.

| Contexto IA (`.agents/`) | Documentos humanos (`.users/`) | Descripcion |
|---|---|---|
| [`context/agents-rules.json`](../.agents/context/agents-rules.json) | [`context/agents-rules.md`](../.users/context/agents-rules.md) | Reglas del proyecto (SoT) |
| [`context/project-index.yaml`](../.agents/context/project-index.yaml) | — | Indice de contexto + reglas de espejo |
| [`context/vision.yaml`](../.agents/context/vision.yaml) | [`context/vision.md`](../.users/context/vision.md) | Vision del proyecto, conceptos fundamentales |
| [`context/plan.yaml`](../.agents/context/plan.yaml) | [`context/plan.md`](../.users/context/plan.md) | Plan de implementacion, estado por fase |
| [`context/architecture.yaml`](../.agents/context/architecture.yaml) | [`context/architecture.md`](../.users/context/architecture.md) | Arquitectura hibrida, capas de seguridad |
| [`context/openclaw-sync.yaml`](../.agents/context/openclaw-sync.yaml) | [`context/openclaw-sync.md`](../.users/context/openclaw-sync.md) | Sincronizacion de OpenClaw Gateway |
| [`context/channels-discord.yaml`](../.agents/context/channels-discord.yaml) | [`context/channels-discord.md`](../.users/context/channels-discord.md) | Arquitectura de integracion Discord |
| [`context/philosophy.yaml`](../.agents/context/philosophy.yaml) | [`context/philosophy.md`](../.users/context/philosophy.md) | Core philosophy (AI sovereignty, privacy) |
| [`context/contributing.yaml`](../.agents/context/contributing.yaml) | [`context/contributing.md`](../.users/context/contributing.md) | Contribution guide for AI agents and humans |
| [`context/brand.yaml`](../.agents/context/brand.yaml) | [`context/brand.md`](../.users/context/brand.md) | Brand identity, character design, color system |
| [`context/donation.yaml`](../.agents/context/donation.yaml) | [`context/donation.md`](../.users/context/donation.md) | Donation policy and open source sustainability |
| [`workflows/development-cycle.yaml`](../.agents/workflows/development-cycle.yaml) | [`workflows/development-cycle.md`](../.users/workflows/development-cycle.md) | Ciclo de desarrollo (PLAN->BUILD->VERIFY) |

**Regla de espejo:** Cuando se modifica un lado, el otro siempre debe sincronizarse.

## Stack tecnologico

| Capa | Tecnologia | Proposito |
|------|-----------|-----------|
| SO | Bazzite (Fedora Atomic) | Linux inmutable, controladores GPU |
| Build SO | BlueBuild | Imagenes de SO basadas en contenedores |
| App de escritorio | Tauri 2 (Rust) | Shell nativo |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | Renderizado VRM 3D |
| Gestion de estado | Zustand | Estado del cliente |
| Motor LLM | Node.js + multi SDK | Nucleo del agente |
| Protocolo | stdio JSON lines | Comunicacion Shell <-> Agent |
| Gateway | OpenClaw | Demonio + servidor RPC |
| BD | SQLite (rusqlite) | Memoria, registros de auditoria |
| Formateador | Biome | Linting + formateo |
| Pruebas | Vitest + tauri-driver | Unitarias + E2E |
| Paquetes | pnpm | Gestion de dependencias |

## Inicio rapido

### Requisitos previos

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (para compilacion de Tauri)
- Paquetes del sistema: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Ejecucion en desarrollo

```bash
# Instalar dependencias
cd shell && pnpm install
cd ../agent && pnpm install

# Ejecutar aplicacion Tauri (Gateway + Agent auto-spawn)
cd ../shell && pnpm run tauri dev
```

Al iniciar la aplicacion, automaticamente:
1. Verificacion de salud de OpenClaw Gateway → reutilizar si esta en ejecucion, si no auto-spawn
2. Spawn de Agent Core (Node.js, conexion stdio)
3. Al cerrar la aplicacion, solo se termina el Gateway auto-spawneado

### Pruebas

```bash
cd shell && pnpm test                # Pruebas unitarias de Shell
cd agent && pnpm test                # Pruebas unitarias de Agent
cd agent && pnpm exec tsc --noEmit   # Verificacion de tipos
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Pruebas Rust

# E2E (se requiere Gateway + clave API)
cd shell && pnpm run test:e2e:tauri
```

### Compilacion Flatpak

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Modelo de seguridad

Naia aplica un modelo de seguridad de **Defensa en profundidad (Defense in Depth)**:

| Capa | Proteccion |
|------|-----------|
| SO | rootfs inmutable de Bazzite + SELinux |
| Gateway | Autenticacion de dispositivo OpenClaw + alcances de token |
| Agente | Permisos de 4 niveles (T0~T3) + bloqueo por herramienta |
| Shell | Modal de aprobacion del usuario + interruptor ON/OFF de herramientas |
| Auditoria | Registro de auditoria SQLite (todas las ejecuciones de herramientas registradas) |

## Sistema de memoria

- **Memoria a corto plazo (STM):** Conversacion de la sesion actual (Zustand + SQLite)
- **Memoria a largo plazo (LTM):** Resumenes de sesion (generados por LLM) + extraccion automatica de hechos/preferencias del usuario
- **Habilidad de memo:** Guardado/recuperacion explicita de memos via `skill_memo`

## Estado actual

| Fase | Descripcion | Estado |
|------|-------------|--------|
| 0 | Pipeline de despliegue (BlueBuild -> ISO) | ✅ Completado |
| 1 | Integracion de avatar (renderizado VRM 3D) | ✅ Completado |
| 2 | Conversacion (texto/voz + sincronizacion labial + emociones) | ✅ Completado |
| 3 | Ejecucion de herramientas (8 herramientas + permisos + auditoria) | ✅ Completado |
| 4 | Demonio siempre activo (Gateway + Skills + Memoria + Discord) | ✅ Completado |
| 5 | Integracion de cuenta Nextain (OAuth + creditos + proxy LLM) | ✅ Completado |
| 6 | Distribucion de app Tauri (Flatpak/DEB/RPM/AppImage) | ✅ Completado |
| 7 | Imagen ISO de SO (arranque USB -> instalacion -> IA SO) | ✅ Completado |

## Descarga

| Formato | Enlace | Descripcion |
|---------|--------|-------------|
| **Naia OS (ISO)** | [Descargar (~7,2 GB)](https://pub-affd0538517845d98ce44a5aec11dd98.r2.dev/naia-os-live-amd64.iso) | SO IA completo — arrancar desde USB, instalar en disco duro |
| Flatpak | [GitHub Release](https://github.com/nextain/naia-os/releases/latest/download/Naia-Shell-x86_64.flatpak) | Solo la app Naia Shell (para Linux existente) |
| AppImage | [GitHub Release](https://github.com/nextain/naia-os/releases/latest/download/Naia-Shell-x86_64.AppImage) | App portatil (sin necesidad de instalar) |
| DEB / RPM | [Todas las versiones](https://github.com/nextain/naia-os/releases) | Para Debian/Ubuntu o Fedora/openSUSE |

Consulta [naia.nextain.io/download](https://naia.nextain.io/es/download) para detalles y checksums.

## Actualizaciones del SO

Naia OS esta construido sobre [Bazzite](https://github.com/ublue-os/bazzite) (Fedora Atomic). Las actualizaciones son **atomicas y seguras**:

- **Automaticas**: La reconstruccion semanal recoge los ultimos parches de seguridad y actualizaciones de Bazzite
- **Atomicas**: La nueva imagen se despliega junto a la actual — si falla, la imagen antigua queda intacta
- **Reversion**: Selecciona la version anterior desde el menu GRUB para recuperacion instantanea
- **Nuestra capa**: Solo agrega paquetes (fcitx5, fuentes) + Naia Shell (Flatpak, aislado) + configuraciones de marca — nunca toca el kernel, el bootloader ni el nucleo de systemd

```
Actualizacion base Bazzite → Reconstruccion auto semanal → Prueba de humo contenedor → Reconstruccion ISO → Subida R2
                                                                                      ↘ Push GHCR → actualizacion bootc usuario
```

## Proceso de desarrollo

### Desarrollo de funcionalidades (por defecto) — Issue-Driven Development

```
ISSUE → UNDERSTAND → SCOPE → INVESTIGATE → PLAN → BUILD → REVIEW → E2E → SYNC → COMMIT
```

- **3 puertas obligatorias** — Confirmacion del usuario requerida en UNDERSTAND, SCOPE y PLAN
- **Despues de aprobacion del plan** — La IA ejecuta BUILD hasta COMMIT continuamente sin detenerse
- **Principios** — Leer codigo upstream primero (sin adivinar). Modificacion minima. Nunca romper codigo funcional.
- **Commits** — Ingles, `<type>(<scope>): <description>`
- **Formateador** — Biome (tab, comillas dobles, puntos y coma)

## Proyectos de referencia

| Proyecto | Lo que tomamos |
|----------|---------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | SO Linux inmutable, GPU, optimizacion para gaming |
| [OpenClaw](https://github.com/steipete/openclaw) | Demonio Gateway, integracion de canales, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | Avatar VRM, protocolo de plugins (inspirado en Neuro-sama) |
| [OpenCode](https://github.com/anomalyco/opencode) | Separacion cliente/servidor, abstraccion de proveedores |
| [Careti](https://github.com/caretive-ai/careti) | Conexion LLM, conjunto de herramientas, sub-agente, gestion de contexto |
| [Neuro-sama](https://vedal.ai/) | Inspiracion AI VTuber — personaje IA con personalidad, streaming, interaccion con la audiencia |

Naia existe porque estos proyectos existen. Estamos profundamente agradecidos a todos los mantenedores y comunidades de codigo abierto que construyeron los cimientos sobre los que nos apoyamos.

## Licencia

- **Codigo fuente**: [Apache License 2.0](../LICENSE) — Copyright 2026 Nextain
- **Contexto IA** (`.agents/`, `.users/`, `AGENTS.md`): [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Enlaces

- **Sitio oficial:** [naia.nextain.io](https://naia.nextain.io)
- **Manual:** [naia.nextain.io/es/manual](https://naia.nextain.io/es/manual)
- **Panel de control:** [naia.nextain.io/es/dashboard](https://naia.nextain.io/es/dashboard)
