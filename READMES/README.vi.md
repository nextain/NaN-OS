[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — He dieu hanh desktop ca nhan noi avatar AI sinh song

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "Ban than he dieu hanh la cong cu cua AI. AI khong chay tren he dieu hanh — AI dieu khien he dieu hanh."

## Naia la gi?

Naia la mot ung dung desktop Linux noi avatar AI 3D thuong tru. Tro chuyen voi AI qua chat va giong noi, va AI truc tiep thuc hien quan ly tep, lenh terminal, tim kiem web va viet ma. Bat ky ai — khong chi lap trinh vien — deu co the co tro ly AI rieng cua minh.

### Tinh nang cot loi

- **Avatar 3D** — Nhan vat VRM mang den cuoc tro chuyen song dong voi bieu cam cam xuc (vui/buon/ngac nhien/suy nghi, v.v.) va dong bo moi
- **Da LLM** — Ho tro 7 nha cung cap: Gemini, Claude, GPT, Grok, zAI, Ollama, Claude Code CLI
- **Thuc thi cong cu** — 8 cong cu bao gom doc/ghi tep, thuc thi terminal, tim kiem web, trinh duyet, sub-agent
- **70 ky nang** — 7 tich hop san + 63 tuy chinh (thoi tiet, GitHub, Slack, Notion, Spotify, Discord, v.v.)
- **Hoi thoai giong noi** — TTS voi 5 nha cung cap (Nextain Cloud, Edge, Google, OpenAI, ElevenLabs) + STT
- **14 ngon ngu** — Tieng Han, Tieng Anh, Tieng Nhat, Tieng Trung, Tieng Phap, Tieng Duc, Tieng Nga va nhieu hon
- **Tich hop kenh** — Noi chuyen voi AI bat cu luc nao qua Discord DM
- **Bao mat 4 cap** — Phan cap quyen tu T0 (doc) den T3 (nguy hiem), he thong phe duyet theo cong cu, nhat ky kiem toan
- **Tai khoan Nextain** — Bat dau ngay voi su dung dua tren tin dung, khong can khoa API
- **Ca nhan hoa** — Tuy chinh ten, tinh cach, phong cach noi, avatar va chu de (8 loai)

## Tai sao chon Naia?

Cac cong cu AI hien tai theo mo hinh "con nguoi su dung AI nhu cong cu". Naia dao nguoc moi quan he nay — **"Trao cho AI toan bo he dieu hanh."**

| Cach tiep can hien tai | Han che | Naia |
|-----------------------|---------|---------|
| **Mo rong VS Code** (Copilot, Cline) | Phai mo IDE de su dung AI | Khong can IDE. Luon bat |
| **Agent CLI** (Claude Code, Aider) | Chi hoat dong trong terminal | Dieu khien tep, trinh duyet, toan bo he thong |
| **Ung dung chatbot** (ChatGPT, Gemini) | Chi co the chat, khong the thuc thi | Chat + Thuc thi. Noi "tao tep" va no thuc su tao |
| **Daemon macOS** (OpenClaw) | brew install, chi macOS, CLI | Ung dung desktop + avatar 3D. Dua tren Linux |
| **Framework AI** (LangChain) | Chi lap trinh vien su dung duoc | Onboarding 7 buoc de bat ky ai cung bat dau |

## Moi quan he voi OpenClaw

Naia duoc xay dung tren he sinh thai [OpenClaw](https://github.com/openclaw-ai/openclaw), nhung la mot san pham khac biet ve ban chat.

| | OpenClaw | Naia |
|---|---------|---------|
| **Hinh thuc** | Daemon CLI + terminal | Ung dung desktop + avatar 3D |
| **Doi tuong** | Lap trinh vien | Tat ca moi nguoi |
| **UI** | Khong co (terminal) | Ung dung native Tauri 2 (React + Three.js) |
| **Avatar** | Khong co | Nhan vat VRM 3D (cam xuc, dong bo moi, anh mat) |
| **LLM** | Nha cung cap don | Da nha cung cap 7 + chuyen doi thoi gian thuc |
| **Giong noi** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + dong bo moi avatar |
| **Cam xuc** | Khong co | 6 cam xuc anh xa vao bieu cam khuon mat |
| **Onboarding** | CUI | GUI + chon avatar VRM |
| **Theo doi chi phi** | Khong co | Bang dieu khien tin dung thoi gian thuc |
| **Phan phoi** | npm install | Flatpak / AppImage / DEB / RPM + anh he dieu hanh |
| **Da ngon ngu** | CLI tieng Anh | GUI 14 ngon ngu |
| **Kenh** | Bot may chu (da kenh) | Bot Discord DM danh rieng cho Naia |

**Nhung gi chung toi lay tu OpenClaw:** Kien truc daemon, dong co thuc thi cong cu, he thong kenh, he sinh thai ky nang (tuong thich 5.700+ ky nang Clawhub)

**Nhung gi Naia xay dung moi:** Tauri Shell, he thong avatar VRM, agent da LLM, dong co cam xuc, tich hop TTS/STT, tro ly onboarding, theo doi chi phi, tich hop tai khoan Nextain, he thong bo nho (STM/LTM), cac lop bao mat

## Kien truc

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

**Su ket hop cua 3 du an:**
- **OpenClaw** — Daemon + thuc thi cong cu + kenh + he sinh thai ky nang
- **Careti** — Da LLM + giao thuc cong cu + giao tiep stdio
- **OpenCode** — Mo hinh tach biet client/server

## Cau truc du an

```
naia-os/
├── shell/              # Ung dung desktop Tauri 2 (React + Rust)
│   ├── src/            #   Cac component React + quan ly trang thai
│   ├── src-tauri/      #   Backend Rust (quan ly tien trinh, SQLite, xac thuc)
│   └── e2e-tauri/      #   Kiem thu E2E WebDriver
├── agent/              # Loi agent AI Node.js
│   ├── src/providers/  #   Nha cung cap LLM (Gemini, Claude, GPT, v.v.)
│   ├── src/tts/        #   Nha cung cap TTS (Edge, Google, OpenAI, v.v.)
│   ├── src/skills/     #   Ky nang tich hop (13 TypeScript danh rieng cho Naia)
│   └── assets/         #   Ky nang dinh kem (64 skill.json)
├── gateway/            # Cau noi OpenClaw Gateway
├── flatpak/            # Dong goi Flatpak (io.nextain.naia)
├── recipes/            # Cong thuc anh he dieu hanh BlueBuild
├── config/             # Cau hinh he dieu hanh (systemd, script wrapper)
├── .agents/            # Ngu canh AI (tieng Anh, JSON/YAML)
└── .users/             # Tai lieu cho nguoi dung (tieng Han, Markdown)
```

## Tai lieu ngu canh (Dual-directory Architecture)

Cau truc tai lieu kep danh cho cac agent AI va lap trinh vien. `.agents/` chua JSON/YAML toi uu token cho AI, `.users/` chua Markdown tieng Han cho con nguoi.

| Ngu canh AI (`.agents/`) | Tai lieu nguoi dung (`.users/`) | Mo ta |
|---|---|---|
| `context/agents-rules.json` | `context/agents-rules.md` | Quy tac du an (SoT) |
| `context/project-index.yaml` | — | Chi muc ngu canh + quy tac phan chieu |
| `context/vision.yaml` | `context/vision.md` | Tam nhin du an, khai niem cot loi |
| `context/plan.yaml` | `context/plan.md` | Ke hoach trien khai, trang thai theo giai doan |
| `context/architecture.yaml` | `context/architecture.md` | Kien truc lai, cac lop bao mat |
| `context/openclaw-sync.yaml` | `context/openclaw-sync.md` | Dong bo OpenClaw Gateway |
| `context/channels-discord.yaml` | `context/channels-discord.md` | Kien truc tich hop Discord |
| `workflows/development-cycle.yaml` | `workflows/development-cycle.md` | Chu ky phat trien (PLAN->BUILD->VERIFY) |

**Quy tac phan chieu:** Khi mot ben duoc sua doi, ben kia phai luon duoc dong bo.

## Cong nghe su dung

| Lop | Cong nghe | Muc dich |
|-----|-----------|---------|
| He dieu hanh | Bazzite (Fedora Atomic) | Linux bat bien, driver GPU |
| Build he dieu hanh | BlueBuild | Anh he dieu hanh dua tren container |
| Ung dung desktop | Tauri 2 (Rust) | Shell native |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | Render VRM 3D |
| Quan ly trang thai | Zustand | Trang thai client |
| Dong co LLM | Node.js + multi SDK | Loi agent |
| Giao thuc | stdio JSON lines | Giao tiep Shell <-> Agent |
| Gateway | OpenClaw | Daemon + may chu RPC |
| CSDL | SQLite (rusqlite) | Bo nho, nhat ky kiem toan |
| Dinh dang | Biome | Linting + formatting |
| Kiem thu | Vitest + tauri-driver | Don vi + E2E |
| Goi | pnpm | Quan ly phu thuoc |

## Bat dau nhanh

### Yeu cau tien quyet

- Linux (Bazzite, Ubuntu, Fedora, v.v.)
- Node.js 22+, pnpm 9+
- Rust stable (de build Tauri)
- Goi he thong: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Chay phat trien

```bash
# Cai dat phu thuoc
cd shell && pnpm install
cd ../agent && pnpm install

# Chay ung dung Tauri (Gateway + Agent tu dong spawn)
cd ../shell && pnpm run tauri dev
```

Khi ung dung khoi dong, tu dong:
1. Kiem tra suc khoe OpenClaw Gateway → tai su dung neu dang chay, neu khong tu dong spawn
2. Spawn Agent Core (Node.js, ket noi stdio)
3. Khi thoat ung dung, chi ket thuc Gateway da tu dong spawn

### Kiem thu

```bash
cd shell && pnpm test                # Kiem thu don vi Shell
cd agent && pnpm test                # Kiem thu don vi Agent
cd agent && pnpm exec tsc --noEmit   # Kiem tra kieu
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Kiem thu Rust

# E2E (can Gateway + khoa API)
cd shell && pnpm run test:e2e:tauri
```

### Build Flatpak

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Mo hinh bao mat

Naia ap dung mo hinh bao mat **Phong thu theo chieu sau (Defense in Depth)**:

| Lop | Bao ve |
|-----|--------|
| He dieu hanh | Bazzite rootfs bat bien + SELinux |
| Gateway | Xac thuc thiet bi OpenClaw + pham vi token |
| Agent | Quyen 4 cap (T0~T3) + chan theo cong cu |
| Shell | Modal phe duyet nguoi dung + chuyen doi ON/OFF cong cu |
| Kiem toan | Nhat ky kiem toan SQLite (ghi lai tat ca cac lan thuc thi cong cu) |

## He thong bo nho

- **Bo nho ngan han (STM):** Cuoc tro chuyen phien hien tai (Zustand + SQLite)
- **Bo nho dai han (LTM):** Tom tat phien (do LLM tao) + tu dong trich xuat su kien/so thich cua nguoi dung
- **Ky nang ghi chu:** Luu/truy xuat ghi chu ro rang qua `skill_memo`

## Trang thai hien tai

| Giai doan | Mo ta | Trang thai |
|-----------|-------|-----------|
| 0 | Pipeline trien khai (BlueBuild -> ISO) | ✅ Hoan thanh |
| 1 | Tich hop avatar (render VRM 3D) | ✅ Hoan thanh |
| 2 | Hoi thoai (van ban/giong noi + dong bo moi + cam xuc) | ✅ Hoan thanh |
| 3 | Thuc thi cong cu (8 cong cu + quyen + kiem toan) | ✅ Hoan thanh |
| 4 | Daemon luon bat (Gateway + Skills + Bo nho + Discord) | ✅ Hoan thanh |
| 5 | Tich hop tai khoan Nextain (OAuth + tin dung + proxy LLM) | ✅ Hoan thanh |
| 6 | Phan phoi ung dung Tauri (Flatpak/DEB/RPM/AppImage) | 🟡 Dang tien hanh |
| 7 | Anh ISO he dieu hanh (khoi dong USB -> AI OS) | ⏳ Du kien |

## Quy trinh phat trien

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Kiem thu truoc (RED) -> trien khai toi thieu (GREEN) -> tai cau truc
- **VERIFY** — Xac nhan bang cach thuc su chay ung dung (chi kiem tra kieu la khong du)
- **Commit** — Tieng Anh, `<type>(<scope>): <description>`
- **Dinh dang** — Biome (tab, ngoac kep, dau cham phay)

## Du an tham khao

| Du an | Nhung gi chung toi lay |
|-------|----------------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | He dieu hanh Linux bat bien, GPU, toi uu hoa choi game |
| [OpenClaw](https://github.com/steipete/openclaw) | Daemon Gateway, tich hop kenh, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | Avatar VRM, giao thuc plugin |
| [OpenCode](https://github.com/anomalyco/opencode) | Tach biet client/server, truu tuong hoa provider |
| Careti | Ket noi LLM, bo cong cu, sub-agent, quan ly ngu canh |

## Giay phep

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## Lien ket

- **Trang web chinh thuc:** [naia.nextain.io](https://naia.nextain.io)
- **Huong dan:** [naia.nextain.io/vi/manual](https://naia.nextain.io/vi/manual)
- **Bang dieu khien:** [naia.nextain.io/vi/dashboard](https://naia.nextain.io/vi/dashboard)
