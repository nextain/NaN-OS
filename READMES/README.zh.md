[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — AI虚拟形象常驻的个人桌面操作系统

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "操作系统本身就是AI的工具。AI不是运行在操作系统之上，而是AI控制着操作系统。"

## 什么是Naia？

Naia是一款3D虚拟形象AI常驻的Linux桌面应用。通过聊天和语音与AI对话，AI可以直接执行文件管理、终端命令、网页搜索和代码编写。即使不是开发者，任何人都可以拥有自己的AI代理。

### 核心功能

- **3D虚拟形象** — VRM角色通过情感表达（喜悦/悲伤/惊讶/思考等）和口型同步带来生动的对话
- **多LLM支持** — 支持7个提供商：Gemini、Claude、GPT、Grok、zAI、Ollama、Claude Code CLI
- **工具执行** — 8种工具，包括文件读写、终端执行、网页搜索、浏览器、子代理等
- **70个技能** — 7个内置 + 63个自定义（天气、GitHub、Slack、Notion、Spotify、Discord等）
- **语音对话** — TTS 5个提供商（Nextain Cloud、Edge、Google、OpenAI、ElevenLabs）+ STT
- **14种语言** — 韩语、英语、日语、中文、法语、德语、俄语等
- **频道集成** — 通过Discord DM随时随地与AI对话
- **4级安全** — T0（读取）到T3（危险）权限层级，按工具审批系统，审计日志
- **Nextain账户** — 无需API密钥，基于积分即可立即使用
- **个性化** — 自定义名称、性格、语气、虚拟形象和主题（8种）

## 为什么选择Naia？

现有的AI工具遵循"人类将AI作为工具使用"的范式。Naia颠覆了这种关系 — **"把整个操作系统交给AI。"**

| 现有方案 | 局限性 | Naia |
|---------|--------|---------|
| **VS Code扩展** (Copilot, Cline) | 必须打开IDE才能使用AI | 无需IDE。始终在线 |
| **CLI代理** (Claude Code, Aider) | 仅在终端内工作 | 控制文件、浏览器和整个系统 |
| **聊天机器人应用** (ChatGPT, Gemini) | 只能聊天，无法执行 | 聊天 + 执行。说"创建文件"就真的创建了 |
| **macOS守护进程** (OpenClaw) | brew安装，仅macOS，CLI | 桌面应用 + 3D虚拟形象。基于Linux |
| **AI框架** (LangChain) | 仅开发者可用 | 7步引导，任何人都能开始 |

## 与OpenClaw的关系

Naia构建于[OpenClaw](https://github.com/openclaw-ai/openclaw)生态系统之上，但是一个根本不同的产品。

| | OpenClaw | Naia |
|---|---------|---------|
| **形态** | CLI守护进程 + 终端 | 桌面应用 + 3D虚拟形象 |
| **目标用户** | 开发者 | 所有人 |
| **UI** | 无（终端） | Tauri 2原生应用（React + Three.js） |
| **虚拟形象** | 无 | VRM 3D角色（情感、口型同步、注视） |
| **LLM** | 单一提供商 | 多提供商7个 + 实时切换 |
| **语音** | TTS 3个（Edge、OpenAI、ElevenLabs） | TTS 5个（+Google、Nextain）+ STT + 虚拟形象口型同步 |
| **情感** | 无 | 6种情感 → 表情映射 |
| **引导** | CUI | GUI + VRM虚拟形象选择 |
| **费用追踪** | 无 | 实时积分仪表板 |
| **分发** | npm install | Flatpak / AppImage / DEB / RPM + OS镜像 |
| **多语言** | 英文CLI | 14种语言GUI |
| **频道** | 服务器机器人（多频道） | Naia专用Discord DM机器人 |

**从OpenClaw继承的：** 守护进程架构、工具执行引擎、频道系统、技能生态系统（兼容5,700+ Clawhub技能）

**Naia全新构建的：** Tauri Shell、VRM虚拟形象系统、多LLM代理、情感引擎、TTS/STT集成、引导向导、费用追踪、Nextain账户集成、记忆系统（STM/LTM）、安全层

## 架构

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

**3个项目的融合：**
- **OpenClaw** → 守护进程 + 工具执行 + 频道 + 技能生态系统
- **Careti** → 多LLM + 工具协议 + stdio通信
- **OpenCode** → 客户端/服务器分离模式

## 项目结构

```
naia-os/
├── shell/              # Tauri 2桌面应用（React + Rust）
│   ├── src/            #   React组件 + 状态管理
│   ├── src-tauri/      #   Rust后端（进程管理、SQLite、认证）
│   └── e2e-tauri/      #   WebDriver E2E测试
├── agent/              # Node.js AI代理核心
│   ├── src/providers/  #   LLM提供商（Gemini、Claude、GPT等）
│   ├── src/tts/        #   TTS提供商（Edge、Google、OpenAI等）
│   ├── src/skills/     #   内置技能（13个Naia专用TypeScript）
│   └── assets/         #   捆绑技能（64个skill.json）
├── gateway/            # OpenClaw Gateway桥接
├── flatpak/            # Flatpak打包（io.nextain.naia）
├── recipes/            # BlueBuild OS镜像配方
├── config/             # OS配置（systemd、包装脚本）
├── .agents/            # AI上下文（英文、JSON/YAML）
└── .users/             # 人类文档（韩文、Markdown）
```

## 上下文文档（Dual-directory Architecture）

为AI代理和人类开发者设计的双重文档结构。`.agents/`包含AI高效读取的JSON/YAML，`.users/`包含人类阅读的韩文Markdown。

| AI上下文（`.agents/`） | 人类文档（`.users/`） | 说明 |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | 项目规则（SoT） |
| `context/project-index.yaml` | — | 上下文索引 + 镜像规则 |
| `context/vision.yaml` | `context/vision.md` | 项目愿景、核心概念 |
| `context/plan.yaml` | `context/plan.md` | 实施计划、各阶段进展 |
| `context/architecture.yaml` | `context/architecture.md` | 混合架构、安全层 |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | OpenClaw Gateway同步 |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Discord集成架构 |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | 开发周期（PLAN->BUILD->VERIFY） |

**镜像规则：** 修改一侧时，必须同步另一侧。

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| OS | Bazzite (Fedora Atomic) | 不可变Linux、GPU驱动 |
| OS构建 | BlueBuild | 基于容器的OS镜像 |
| 桌面应用 | Tauri 2 (Rust) | 原生Shell |
| 前端 | React 18 + TypeScript + Vite | UI |
| 虚拟形象 | Three.js + @pixiv/three-vrm | 3D VRM渲染 |
| 状态管理 | Zustand | 客户端状态 |
| LLM引擎 | Node.js + 多SDK | 代理核心 |
| 协议 | stdio JSON lines | Shell ↔ Agent通信 |
| 网关 | OpenClaw | 守护进程 + RPC服务器 |
| 数据库 | SQLite (rusqlite) | 内存、审计日志 |
| 格式化 | Biome | 代码检查 + 格式化 |
| 测试 | Vitest + tauri-driver | 单元 + E2E |
| 包管理 | pnpm | 依赖管理 |

## 快速开始

### 前置条件

- Linux（Bazzite、Ubuntu、Fedora等）
- Node.js 22+、pnpm 9+
- Rust stable（Tauri构建用）
- 系统包：`webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel`（Fedora）

### 开发运行

```bash
# 安装依赖
cd shell && pnpm install
cd ../agent && pnpm install

# 运行Tauri应用（Gateway + Agent自动启动）
cd ../shell && pnpm run tauri dev
```

应用启动时自动：
1. OpenClaw Gateway健康检查 → 运行中则复用，否则自动启动
2. Agent Core启动（Node.js，stdio连接）
3. 应用退出时，仅终止自动启动的Gateway

### 测试

```bash
cd shell && pnpm test                # Shell单元测试
cd agent && pnpm test                # Agent单元测试
cd agent && pnpm exec tsc --noEmit   # 类型检查
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust测试

# E2E（需要Gateway + API密钥）
cd shell && pnpm run test:e2e:tauri
```

### Flatpak构建

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## 安全模型

Naia采用**纵深防御（Defense in Depth）**安全模型：

| 层级 | 保护措施 |
|------|---------|
| OS | Bazzite不可变rootfs + SELinux |
| Gateway | OpenClaw设备认证 + 令牌范围 |
| Agent | 4级权限（T0~T3）+ 按工具阻止 |
| Shell | 用户审批弹窗 + 工具ON/OFF切换 |
| 审计 | SQLite审计日志（记录所有工具执行） |

## 记忆系统

- **短期记忆（STM）：** 当前会话对话（Zustand + SQLite）
- **长期记忆（LTM）：** 会话摘要（LLM生成）+ 自动提取用户事实/偏好
- **备忘技能：** 通过`skill_memo`明确保存/检索备忘录

## 当前状态

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | 部署流水线（BlueBuild → ISO） | ✅ 完成 |
| 1 | 虚拟形象集成（VRM 3D渲染） | ✅ 完成 |
| 2 | 对话（文本/语音 + 口型同步 + 情感） | ✅ 完成 |
| 3 | 工具执行（8个工具 + 权限 + 审计） | ✅ 完成 |
| 4 | 常驻守护进程（Gateway + Skills + 记忆 + Discord） | ✅ 完成 |
| 5 | Nextain账户集成（OAuth + 积分 + LLM代理） | ✅ 完成 |
| 6 | Tauri应用分发（Flatpak/DEB/RPM/AppImage） | 🟡 进行中 |
| 7 | OS ISO镜像（USB启动 → AI OS） | ⏳ 计划中 |

## 开发流程

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — 先写测试（RED）→ 最小实现（GREEN）→ 重构
- **VERIFY** — 实际运行应用确认（仅类型检查不够）
- **提交** — 英文，`<type>(<scope>): <description>`
- **格式化** — Biome（tab、双引号、分号）

## 参考项目

| 项目 | 借鉴内容 |
|------|---------|
| [Bazzite](https://github.com/ublue-os/bazzite) | 不可变Linux OS、GPU、游戏优化 |
| [OpenClaw](https://github.com/steipete/openclaw) | Gateway守护进程、频道集成、Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar、插件协议 |
| [OpenCode](https://github.com/anomalyco/opencode) | 客户端/服务器分离、Provider抽象 |
| Careti | LLM连接、工具集、子代理、上下文管理 |

## 许可证

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## 链接

- **官方网站：** [naia.nextain.io](https://naia.nextain.io)
- **手册：** [naia.nextain.io/zh/manual](https://naia.nextain.io/zh/manual)
- **仪表板：** [naia.nextain.io/zh/dashboard](https://naia.nextain.io/zh/dashboard)
