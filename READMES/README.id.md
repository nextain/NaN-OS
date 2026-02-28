[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

**The Next Generation AI OS** — Sistem operasi AI pribadi tempat AI Anda sendiri tinggal

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> "AI Anda, aturan Anda. Pilih AI Anda, bentuk memori dan kepribadiannya, berikan suara Anda — semuanya di mesin Anda sendiri."

## Apa itu Naia?

Naia adalah OS AI pribadi yang memberikan kedaulatan penuh atas AI kepada individu. Pilih AI mana yang akan digunakan (termasuk model lokal), konfigurasikan memori dan kepribadiannya secara lokal, kustomisasi avatar 3D dan suaranya — semuanya tetap di mesin Anda, di bawah kendali Anda.

Ini bukan sekadar alat AI biasa. Ini adalah sistem operasi tempat AI Anda tinggal, tumbuh, dan bekerja bersama Anda. Hari ini berupa OS desktop dengan avatar 3D. Besok — avatar video real-time, bernyanyi, bermain game, dan pada akhirnya Physical AI (OS android) Anda sendiri.

### Filosofi Inti

- **Kedaulatan AI** — Anda yang memilih AI. Cloud atau lokal. OS tidak memaksakan.
- **Kendali Penuh** — Memori, kepribadian, pengaturan — semuanya disimpan lokal. Tanpa ketergantungan cloud.
- **AI Milik Anda** — Kustomisasi avatar, suara, nama, kepribadian. Jadikan benar-benar milik Anda.
- **Selalu Hidup** — AI berjalan 24/7 di latar belakang, menerima pesan dan mengerjakan tugas bahkan saat Anda pergi.
- **Visi Masa Depan** — Avatar 3D VRM → avatar video real-time → bernyanyi & bermain game bersama → Physical AI

### Fitur

- **Avatar 3D** — Karakter VRM dengan ekspresi emosi (senang/sedih/terkejut/berpikir) dan sinkronisasi bibir
- **Kebebasan AI** — 7 penyedia cloud (Gemini, Claude, GPT, Grok, zAI) + AI lokal (Ollama) + Claude Code CLI
- **Lokal-First** — Memori, kepribadian, semua pengaturan disimpan di mesin Anda
- **Eksekusi Alat** — 8 alat: baca/tulis file, terminal, pencarian web, browser, sub-agen
- **70+ Keterampilan** — 7 bawaan + 63 kustom + 5.700+ keterampilan komunitas ClawHub
- **Suara** — 5 penyedia TTS + STT + sinkronisasi bibir. Berikan AI Anda suara yang Anda inginkan.
- **14 Bahasa** — Korea, Inggris, Jepang, Cina, Prancis, Jerman, Rusia, dan lainnya
- **Selalu Aktif** — Daemon gateway OpenClaw menjaga AI Anda tetap berjalan di latar belakang
- **Integrasi Kanal** — Berbicara dengan AI melalui Discord DM, kapan saja, di mana saja
- **Keamanan 4 Tingkat** — T0 (baca) hingga T3 (berbahaya), persetujuan per alat, log audit
- **Personalisasi** — Nama, kepribadian, gaya bicara, avatar, tema (8 jenis)

## Mengapa Naia?

Alat AI lain hanyalah "alat". Naia adalah **"AI milik Anda sendiri"**.

| | Alat AI Lain | Naia |
|---|----------------|------|
| **Filosofi** | Menggunakan AI sebagai alat | Berikan AI OS-nya. Hidup bersama. |
| **Target** | Hanya pengembang | Semua orang yang ingin memiliki AI sendiri |
| **Pilihan AI** | Platform yang menentukan | 7 cloud + AI lokal — Anda yang memutuskan |
| **Data** | Terkunci di cloud | Memori, kepribadian, pengaturan semuanya lokal |
| **Avatar** | Tidak ada | Karakter 3D VRM + emosi + sinkronisasi bibir |
| **Suara** | Hanya teks atau TTS dasar | 5 TTS + STT + suara AI Anda sendiri |
| **Deployment** | npm / brew / pip | Aplikasi desktop atau USB OS bootable |
| **Platform** | macOS / CLI / Web | Desktop native Linux → masa depan: Physical AI |
| **Biaya** | Perlu kunci API terpisah | Kredit gratis untuk memulai, AI lokal sepenuhnya gratis |

## Hubungan dengan OpenClaw

Naia dibangun di atas ekosistem [OpenClaw](https://github.com/openclaw-ai/openclaw), tetapi merupakan produk yang secara fundamental berbeda.

| | OpenClaw | Naia |
|---|---------|---------|
| **Bentuk** | Daemon CLI + terminal | Aplikasi desktop + avatar 3D |
| **Target** | Pengembang | Semua orang |
| **UI** | Tidak ada (terminal) | Aplikasi native Tauri 2 (React + Three.js) |
| **Avatar** | Tidak ada | Karakter VRM 3D (emosi, sinkronisasi bibir, tatapan) |
| **LLM** | Penyedia tunggal | Multi-penyedia 7 + pergantian waktu nyata |
| **Suara** | TTS 3 (Edge, OpenAI, ElevenLabs) | TTS 5 (+Google, Nextain) + STT + sinkronisasi bibir avatar |
| **Emosi** | Tidak ada | 6 emosi dipetakan ke ekspresi wajah |
| **Onboarding** | CUI | GUI + pemilihan avatar VRM |
| **Pelacakan Biaya** | Tidak ada | Dasbor kredit waktu nyata |
| **Distribusi** | npm install | Flatpak / AppImage / DEB / RPM + image OS |
| **Multibahasa** | CLI Inggris | GUI 14 bahasa |
| **Kanal** | Bot server (multikanal) | Bot Discord DM khusus Naia |

**Apa yang kami ambil dari OpenClaw:** Arsitektur daemon, mesin eksekusi alat, sistem kanal, ekosistem keterampilan (kompatibel dengan 5.700+ keterampilan Clawhub)

**Apa yang Naia bangun baru:** Tauri Shell, sistem avatar VRM, agen multi-LLM, mesin emosi, integrasi TTS/STT, wizard onboarding, pelacakan biaya, integrasi akun Nextain, sistem memori (STM/LTM), lapisan keamanan

## Arsitektur

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

**Perpaduan dari 3 proyek:**
- **OpenClaw** — Daemon + eksekusi alat + kanal + ekosistem keterampilan
- **Careti** — Multi-LLM + protokol alat + komunikasi stdio
- **OpenCode** — Pola pemisahan client/server

## Struktur Proyek

```
naia-os/
├── shell/              # Aplikasi desktop Tauri 2 (React + Rust)
│   ├── src/            #   Komponen React + manajemen state
│   ├── src-tauri/      #   Backend Rust (manajemen proses, SQLite, autentikasi)
│   └── e2e-tauri/      #   Tes E2E WebDriver
├── agent/              # Inti agen AI Node.js
│   ├── src/providers/  #   Penyedia LLM (Gemini, Claude, GPT, dll.)
│   ├── src/tts/        #   Penyedia TTS (Edge, Google, OpenAI, dll.)
│   ├── src/skills/     #   Keterampilan bawaan (13 TypeScript khusus Naia)
│   └── assets/         #   Keterampilan yang dibundel (64 skill.json)
├── gateway/            # Jembatan OpenClaw Gateway
├── flatpak/            # Pengemasan Flatpak (io.nextain.naia)
├── recipes/            # Resep image OS BlueBuild
├── config/             # Konfigurasi OS (systemd, skrip wrapper)
├── .agents/            # Konteks AI (Inggris, JSON/YAML)
└── .users/             # Dokumentasi manusia (Korea, Markdown)
```

## Dokumen Konteks (Dual-directory Architecture)

Struktur dokumentasi ganda untuk agen AI dan pengembang manusia. `.agents/` berisi JSON/YAML yang efisien token untuk AI, `.users/` berisi Markdown Korea untuk manusia.

| Konteks AI (`.agents/`) | Dokumen Manusia (`.users/`) | Deskripsi |
|---|---|---|
| [`context/agents-rules.json`](../.agents/context/agents-rules.json) | [`context/agents-rules.md`](../.users/context/en/agents-rules.md) | Aturan proyek (SoT) |
| [`context/project-index.yaml`](../.agents/context/project-index.yaml) | — | Indeks konteks + aturan pencerminan |
| [`context/vision.yaml`](../.agents/context/vision.yaml) | [`context/vision.md`](../.users/context/en/vision.md) | Visi proyek, konsep inti |
| [`context/plan.yaml`](../.agents/context/plan.yaml) | [`context/plan.md`](../.users/context/en/plan.md) | Rencana implementasi, status per fase |
| [`context/architecture.yaml`](../.agents/context/architecture.yaml) | [`context/architecture.md`](../.users/context/en/architecture.md) | Arsitektur hibrida, lapisan keamanan |
| [`context/openclaw-sync.yaml`](../.agents/context/openclaw-sync.yaml) | [`context/openclaw-sync.md`](../.users/context/en/openclaw-sync.md) | Sinkronisasi OpenClaw Gateway |
| [`context/channels-discord.yaml`](../.agents/context/channels-discord.yaml) | [`context/channels-discord.md`](../.users/context/en/channels-discord.md) | Arsitektur integrasi Discord |
| [`context/philosophy.yaml`](../.agents/context/philosophy.yaml) | [`context/philosophy.md`](../.users/context/en/philosophy.md) | Core philosophy (AI sovereignty, privacy) |
| [`context/contributing.yaml`](../.agents/context/contributing.yaml) | [`context/contributing.md`](../.users/context/en/contributing.md) | Contribution guide for AI agents and humans |
| [`context/brand.yaml`](../.agents/context/brand.yaml) | [`context/brand.md`](../.users/context/en/brand.md) | Brand identity, character design, color system |
| [`context/donation.yaml`](../.agents/context/donation.yaml) | [`context/donation.md`](../.users/context/en/donation.md) | Donation policy and open source sustainability |
| [`workflows/development-cycle.yaml`](../.agents/workflows/development-cycle.yaml) | [`workflows/development-cycle.md`](../.users/workflows/development-cycle.md) | Siklus pengembangan (PLAN->BUILD->VERIFY) |

**Aturan pencerminan:** Ketika satu sisi dimodifikasi, sisi lainnya harus selalu disinkronkan.

## Stack Teknologi

| Lapisan | Teknologi | Tujuan |
|---------|-----------|--------|
| OS | Bazzite (Fedora Atomic) | Linux immutable, driver GPU |
| Build OS | BlueBuild | Image OS berbasis kontainer |
| Aplikasi Desktop | Tauri 2 (Rust) | Shell native |
| Frontend | React 18 + TypeScript + Vite | UI |
| Avatar | Three.js + @pixiv/three-vrm | Rendering VRM 3D |
| Manajemen State | Zustand | State klien |
| Mesin LLM | Node.js + multi SDK | Inti agen |
| Protokol | stdio JSON lines | Komunikasi Shell <-> Agent |
| Gateway | OpenClaw | Daemon + server RPC |
| DB | SQLite (rusqlite) | Memori, log audit |
| Formatter | Biome | Linting + formatting |
| Tes | Vitest + tauri-driver | Unit + E2E |
| Paket | pnpm | Manajemen dependensi |

## Mulai Cepat

### Prasyarat

- Linux (Bazzite, Ubuntu, Fedora, dll.)
- Node.js 22+, pnpm 9+
- Rust stable (untuk build Tauri)
- Paket sistem: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (Fedora)

### Menjalankan Pengembangan

```bash
# Instal dependensi
cd shell && pnpm install
cd ../agent && pnpm install

# Jalankan aplikasi Tauri (Gateway + Agent auto-spawn)
cd ../shell && pnpm run tauri dev
```

Saat aplikasi diluncurkan, secara otomatis:
1. Health check OpenClaw Gateway → gunakan ulang jika berjalan, jika tidak auto-spawn
2. Spawn Agent Core (Node.js, koneksi stdio)
3. Saat keluar aplikasi, hanya Gateway yang di-auto-spawn yang dihentikan

### Tes

```bash
cd shell && pnpm test                # Tes unit Shell
cd agent && pnpm test                # Tes unit Agent
cd agent && pnpm exec tsc --noEmit   # Pemeriksaan tipe
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Tes Rust

# E2E (diperlukan Gateway + kunci API)
cd shell && pnpm run test:e2e:tauri
```

### Build Flatpak

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## Model Keamanan

Naia menerapkan model keamanan **Pertahanan Berlapis (Defense in Depth)**:

| Lapisan | Perlindungan |
|---------|-------------|
| OS | Bazzite rootfs immutable + SELinux |
| Gateway | Autentikasi perangkat OpenClaw + cakupan token |
| Agen | Izin 4 tingkat (T0~T3) + pemblokiran per alat |
| Shell | Modal persetujuan pengguna + toggle ON/OFF alat |
| Audit | Log audit SQLite (semua eksekusi alat dicatat) |

## Sistem Memori

- **Memori Jangka Pendek (STM):** Percakapan sesi saat ini (Zustand + SQLite)
- **Memori Jangka Panjang (LTM):** Ringkasan sesi (dihasilkan LLM) + ekstraksi otomatis fakta/preferensi pengguna
- **Keterampilan Memo:** Simpan/ambil memo secara eksplisit melalui `skill_memo`

## Status Saat Ini

| Fase | Deskripsi | Status |
|------|-----------|--------|
| 0 | Pipeline deployment (BlueBuild -> ISO) | ✅ Selesai |
| 1 | Integrasi avatar (rendering VRM 3D) | ✅ Selesai |
| 2 | Percakapan (teks/suara + sinkronisasi bibir + emosi) | ✅ Selesai |
| 3 | Eksekusi alat (8 alat + izin + audit) | ✅ Selesai |
| 4 | Daemon selalu aktif (Gateway + Skills + Memori + Discord) | ✅ Selesai |
| 5 | Integrasi akun Nextain (OAuth + kredit + proxy LLM) | ✅ Selesai |
| 6 | Distribusi aplikasi Tauri (Flatpak/DEB/RPM/AppImage) | 🟡 Sedang Berlangsung |
| 7 | Image ISO OS (boot USB -> AI OS) | ⏳ Direncanakan |

## Proses Pengembangan

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — Tes dulu (RED) -> implementasi minimal (GREEN) -> refaktor
- **VERIFY** — Konfirmasi dengan benar-benar menjalankan aplikasi (pemeriksaan tipe saja tidak cukup)
- **Commit** — Inggris, `<type>(<scope>): <description>`
- **Formatter** — Biome (tab, tanda kutip ganda, titik koma)

## Proyek Referensi

| Proyek | Apa yang Kami Ambil |
|--------|-------------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | OS Linux immutable, GPU, optimasi gaming |
| [OpenClaw](https://github.com/steipete/openclaw) | Daemon Gateway, integrasi kanal, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | Avatar VRM, protokol plugin |
| [OpenCode](https://github.com/anomalyco/opencode) | Pemisahan client/server, abstraksi penyedia |
| Careti | Koneksi LLM, set alat, sub-agen, manajemen konteks |

## Lisensi

[Apache License 2.0](../LICENSE) — Copyright 2026 Nextain

## Tautan

- **Situs Resmi:** [naia.nextain.io](https://naia.nextain.io)
- **Manual:** [naia.nextain.io/id/manual](https://naia.nextain.io/id/manual)
- **Dasbor:** [naia.nextain.io/id/dashboard](https://naia.nextain.io/id/dashboard)
