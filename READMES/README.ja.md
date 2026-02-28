[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Português](README.pt.md) | [Tiếng Việt](README.vi.md) | [Bahasa Indonesia](README.id.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md) | [বাংলা](README.bn.md)

# Naia

<p align="center">
  <img src="../assets/readme-hero.jpg" alt="Naia OS" width="800" />
</p>

**The Next Generation AI OS** — あなた自身のAIが住むパーソナルAIオペレーティングシステム

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)

> 「オープンソース。あなたのAI、あなたのルール。AIを選び、記憶と性格を形作り、声を与える — すべてあなた自身のマシンで、すべてコードで検証可能。」

> **注:** 表示されているVRMアバターサンプルは[VRoid Hub](https://hub.vroid.com/)からのものです。Naiaの公式マスコットVRMは現在制作中です。

## Naiaに会う

<p align="center">
  <img src="../assets/character/naia-default-character.png" alt="Naia Default" width="180" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="../assets/character/naia-character.png" alt="Naia with Hair" width="180" />
</p>

<p align="center">
  <em>デフォルト（無性） &nbsp;·&nbsp; ヘアスタイル付き（女性型）</em>
</p>

<details>
<summary>その他のキャラクターバリエーション</summary>
<p align="center">
  <img src="../assets/character/naia-varaiations.png" alt="Naia Variations" width="600" />
</p>
</details>

## Naiaとは？

Naiaは、個人がAIに対する完全な主権を持つパーソナルAI OSです。使用するAIを選び（ローカルモデルを含む）、記憶と性格をローカルで設定し、3Dアバターと声をカスタマイズ — すべてがあなたのマシンに保存され、あなたの管理下にあります。

これは単なるAIツールではありません。AIが住み、成長し、あなたと共に働くオペレーティングシステムです。今日は3Dアバターを持つデスクトップOS。明日は — リアルタイムビデオアバター、歌、ゲーム、そしてやがてあなた自身のPhysical AI（アンドロイドOS）。

### コア哲学

- **AI主権** — あなたがAIを選ぶ。クラウドかローカルか。OSは強制しない。
- **完全な制御** — 記憶、性格、設定 — すべてローカルに保存。クラウド依存なし。
- **あなた自身のAI** — アバター、声、名前、性格をカスタマイズ。本当にあなただけのAIに。
- **Always Alive** — AIは24時間365日バックグラウンドで動作し、あなたがいない間もメッセージを受信し仕事をする。
- **オープンソース** — Apache 2.0。AIがあなたのデータをどう扱うかコードで確認。修正、カスタマイズ、貢献が自由に。
- **未来のビジョン** — VRM 3Dアバター → リアルタイムビデオアバター → 一緒に歌い・遊ぶ → Physical AI

### 機能

- **3Dアバター** — VRMキャラクターが感情表現（喜び/悲しみ/驚き/思考）とリップシンクで生き生きと会話
- **AI自由** — 7つのクラウドプロバイダー（Gemini、Claude、GPT、Grok、zAI）+ ローカルAI（Ollama）+ Claude Code CLI
- **ローカルファースト** — 記憶、性格、すべての設定があなたのマシンに保存
- **ツール実行** — 8つのツール：ファイル読み書き、ターミナル、Web検索、ブラウザ、サブエージェント
- **70以上のスキル** — 7つの組み込み + 63のカスタム + 5,700以上のClawHubコミュニティスキル
- **音声** — 5つのTTSプロバイダー + STT + リップシンク。AIにあなたが望む声を。
- **14言語** — 韓国語、英語、日本語、中国語、フランス語、ドイツ語、ロシア語など
- **常時稼働** — OpenClawゲートウェイデーモンがAIをバックグラウンドで常に動かし続ける
- **チャネル連携** — Discord DMでいつでもどこでもAIと会話
- **4段階セキュリティ** — T0（読み取り）〜T3（危険）、ツール別承認、監査ログ
- **パーソナライズ** — 名前、性格、話し方、アバター、テーマ（8種類）

## なぜNaiaなのか？

他のAIツールは単なる「ツール」。Naiaは**「あなた自身のAI」**。

| | 他のAIツール | Naia |
|---|------------|------|
| **哲学** | AIをツールとして使う | AIにOSを与える。共に暮らす。 |
| **対象** | 開発者のみ | 自分だけのAIを望むすべての人 |
| **AI選択** | プラットフォームが決める | 7つのクラウド + ローカルAI — あなたが決める |
| **データ** | クラウドにロック | 記憶、性格、設定すべてローカル |
| **アバター** | なし | VRM 3Dキャラクター + 感情 + リップシンク |
| **音声** | テキストのみまたは基本TTS | 5 TTS + STT + AIの声 |
| **デプロイ** | npm / brew / pip | デスクトップアプリまたは起動可能なUSB OS |
| **プラットフォーム** | macOS / CLI / Web | Linuxネイティブデスクトップ → 将来：Physical AI |
| **コスト** | 別途APIキーが必要 | 無料クレジットで開始、ローカルAIは完全無料 |

## OpenClawとの関係

Naiaは[OpenClaw](https://github.com/openclaw-ai/openclaw)エコシステムの上に構築されていますが、根本的に異なる製品です。

| | OpenClaw | Naia |
|---|---------|---------|
| **形態** | CLIデーモン + ターミナル | デスクトップアプリ + 3Dアバター |
| **対象** | 開発者 | 誰でも |
| **UI** | なし（ターミナル） | Tauri 2ネイティブアプリ（React + Three.js） |
| **アバター** | なし | VRM 3Dキャラクター（感情、リップシンク、視線） |
| **LLM** | 単一プロバイダー | マルチプロバイダー7つ + リアルタイム切替 |
| **音声** | TTS 3つ（Edge、OpenAI、ElevenLabs） | TTS 5つ（+Google、Nextain）+ STT + アバターリップシンク |
| **感情** | なし | 6つの感情 → 表情マッピング |
| **オンボーディング** | CUI | GUI + VRMアバター選択 |
| **コスト追跡** | なし | リアルタイムクレジットダッシュボード |
| **配布** | npm install | Flatpak / AppImage / DEB / RPM + OSイメージ |
| **多言語** | 英語CLI | 14言語GUI |
| **チャネル** | サーバーボット（マルチチャネル） | Naia専用Discord DMボット |

**OpenClawから取り入れたもの：** デーモンアーキテクチャ、ツール実行エンジン、チャネルシステム、スキルエコシステム（5,700+ Clawhubスキル互換）

**Naiaが新たに構築したもの：** Tauri Shell、VRMアバターシステム、マルチLLMエージェント、感情エンジン、TTS/STT統合、オンボーディングウィザード、コスト追跡、Nextainアカウント連携、メモリシステム（STM/LTM）、セキュリティレイヤー

## アーキテクチャ

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

**3つのプロジェクトの融合：**
- **OpenClaw** → デーモン + ツール実行 + チャネル + スキルエコシステム
- **Careti** → マルチLLM + ツールプロトコル + stdio通信
- **OpenCode** → クライアント/サーバー分離パターン

## プロジェクト構造

```
naia-os/
├── shell/              # Tauri 2デスクトップアプリ（React + Rust）
│   ├── src/            #   Reactコンポーネント + 状態管理
│   ├── src-tauri/      #   Rustバックエンド（プロセス管理、SQLite、認証）
│   └── e2e-tauri/      #   WebDriver E2Eテスト
├── agent/              # Node.js AIエージェントコア
│   ├── src/providers/  #   LLMプロバイダー（Gemini、Claude、GPTなど）
│   ├── src/tts/        #   TTSプロバイダー（Edge、Google、OpenAIなど）
│   ├── src/skills/     #   組み込みスキル（13個Naia専用TypeScript）
│   └── assets/         #   バンドルスキル（64個skill.json）
├── gateway/            # OpenClaw Gatewayブリッジ
├── flatpak/            # Flatpakパッケージング（io.nextain.naia）
├── recipes/            # BlueBuild OSイメージレシピ
├── config/             # OS設定（systemd、ラッパースクリプト）
├── .agents/            # AIコンテキスト（英語、JSON/YAML）
└── .users/             # 人間向けドキュメント（韓国語、Markdown）
```

## コンテキストドキュメント（Dual-directory Architecture）

AIエージェントと人間の開発者のための二重ドキュメント構造です。`.agents/`はAIがトークン効率的に読むJSON/YAML、`.users/`は人間が読む韓国語Markdownです。

| AIコンテキスト（`.agents/`） | 人間ドキュメント（`.users/`） | 説明 |
|---|---|---|
| [`context/agents-rules.json`](../.agents/context/agents-rules.json) | [`context/agents-rules.md`](../.users/context/agents-rules.md) | プロジェクトルール（SoT） |
| [`context/project-index.yaml`](../.agents/context/project-index.yaml) | — | コンテキストインデックス + ミラーリングルール |
| [`context/vision.yaml`](../.agents/context/vision.yaml) | [`context/vision.md`](../.users/context/vision.md) | プロジェクトビジョン、コアコンセプト |
| [`context/plan.yaml`](../.agents/context/plan.yaml) | [`context/plan.md`](../.users/context/plan.md) | 実装計画、フェーズ別進捗状況 |
| [`context/architecture.yaml`](../.agents/context/architecture.yaml) | [`context/architecture.md`](../.users/context/architecture.md) | ハイブリッドアーキテクチャ、セキュリティレイヤー |
| [`context/openclaw-sync.yaml`](../.agents/context/openclaw-sync.yaml) | [`context/openclaw-sync.md`](../.users/context/openclaw-sync.md) | OpenClaw Gateway同期 |
| [`context/channels-discord.yaml`](../.agents/context/channels-discord.yaml) | [`context/channels-discord.md`](../.users/context/channels-discord.md) | Discord統合アーキテクチャ |
| [`context/philosophy.yaml`](../.agents/context/philosophy.yaml) | [`context/philosophy.md`](../.users/context/philosophy.md) | Core philosophy (AI sovereignty, privacy) |
| [`context/contributing.yaml`](../.agents/context/contributing.yaml) | [`context/contributing.md`](../.users/context/contributing.md) | Contribution guide for AI agents and humans |
| [`context/brand.yaml`](../.agents/context/brand.yaml) | [`context/brand.md`](../.users/context/brand.md) | Brand identity, character design, color system |
| [`context/donation.yaml`](../.agents/context/donation.yaml) | [`context/donation.md`](../.users/context/donation.md) | Donation policy and open source sustainability |
| [`workflows/development-cycle.yaml`](../.agents/workflows/development-cycle.yaml) | [`workflows/development-cycle.md`](../.users/workflows/development-cycle.md) | 開発サイクル（PLAN->BUILD->VERIFY） |

**ミラーリングルール：** 一方を修正したら、必ずもう一方も同期します。

## 技術スタック

| レイヤー | 技術 | 用途 |
|---------|------|------|
| OS | Bazzite (Fedora Atomic) | 不変Linux、GPUドライバー |
| OSビルド | BlueBuild | コンテナベースOSイメージ |
| デスクトップアプリ | Tauri 2 (Rust) | ネイティブシェル |
| フロントエンド | React 18 + TypeScript + Vite | UI |
| アバター | Three.js + @pixiv/three-vrm | 3D VRMレンダリング |
| 状態管理 | Zustand | クライアント状態 |
| LLMエンジン | Node.js + マルチSDK | エージェントコア |
| プロトコル | stdio JSON lines | Shell ↔ Agent通信 |
| ゲートウェイ | OpenClaw | デーモン + RPCサーバー |
| DB | SQLite (rusqlite) | メモリ、監査ログ |
| フォーマッター | Biome | リンティング + フォーマッティング |
| テスト | Vitest + tauri-driver | ユニット + E2E |
| パッケージ | pnpm | 依存性管理 |

## クイックスタート

### 前提条件

- Linux（Bazzite、Ubuntu、Fedoraなど）
- Node.js 22+、pnpm 9+
- Rust stable（Tauriビルド用）
- システムパッケージ：`webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel`（Fedora）

### 開発実行

```bash
# 依存性インストール
cd shell && pnpm install
cd ../agent && pnpm install

# Tauriアプリ実行（Gateway + Agent自動spawn）
cd ../shell && pnpm run tauri dev
```

アプリ起動時に自動的に：
1. OpenClaw Gatewayヘルスチェック → 実行中なら再利用、そうでなければ自動spawn
2. Agent Core spawn（Node.js、stdio接続）
3. アプリ終了時、自動spawnしたGatewayのみ終了

### テスト

```bash
cd shell && pnpm test                # Shellユニットテスト
cd agent && pnpm test                # Agentユニットテスト
cd agent && pnpm exec tsc --noEmit   # 型チェック
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rustテスト

# E2E（Gateway + APIキーが必要）
cd shell && pnpm run test:e2e:tauri
```

### Flatpakビルド

```bash
flatpak install --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-dir flatpak/io.nextain.naia.yml
flatpak run io.nextain.naia
```

## セキュリティモデル

Naiaは**多層防御（Defense in Depth）**セキュリティモデルを適用しています：

| レイヤー | 保護手段 |
|---------|---------|
| OS | Bazzite不変rootfs + SELinux |
| Gateway | OpenClawデバイス認証 + トークンスコープ |
| Agent | 4段階権限（T0〜T3）+ ツール別ブロック |
| Shell | ユーザー承認モーダル + ツールON/OFFトグル |
| 監査 | SQLite監査ログ（すべてのツール実行を記録） |

## メモリシステム

- **短期記憶（STM）：** 現在のセッション会話（Zustand + SQLite）
- **長期記憶（LTM）：** セッション要約（LLM生成）+ ユーザー事実/好みの自動抽出
- **メモスキル：** `skill_memo`による明示的メモ保存/取得

## 現在の状態

| Phase | 内容 | 状態 |
|-------|------|------|
| 0 | デプロイパイプライン（BlueBuild → ISO） | ✅ 完了 |
| 1 | アバター搭載（VRM 3Dレンダリング） | ✅ 完了 |
| 2 | 会話（テキスト/音声 + リップシンク + 感情） | ✅ 完了 |
| 3 | ツール実行（8つのツール + 権限 + 監査） | ✅ 完了 |
| 4 | 常時デーモン（Gateway + Skills + メモリ + Discord） | ✅ 完了 |
| 5 | Nextainアカウント連携（OAuth + クレジット + LLMプロキシ） | ✅ 完了 |
| 6 | Tauriアプリ配布（Flatpak/DEB/RPM/AppImage） | 🟡 進行中 |
| 7 | OS ISOイメージ（USB起動 → AI OS） | ⏳ 予定 |

## 開発プロセス

```
PLAN → CHECK → BUILD (TDD) → VERIFY → CLEAN → COMMIT
```

- **BUILD = TDD** — テスト先行（RED）→ 最小実装（GREEN）→ リファクタ
- **VERIFY** — 実際にアプリを実行して確認（型チェックだけでは不十分）
- **コミット** — 英語、`<type>(<scope>): <description>`
- **フォーマッター** — Biome（tab、ダブルクォート、セミコロン）

## 参照プロジェクト

| プロジェクト | 取り入れるもの |
|-------------|--------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | 不変Linux OS、GPU、ゲーミング最適化 |
| [OpenClaw](https://github.com/steipete/openclaw) | Gatewayデーモン、チャネル統合、Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar、プラグインプロトコル (Neuro-samaにインスパイア) |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server分離、Provider抽象化 |
| [Careti](https://github.com/caretive-ai/careti) | LLM接続、ツールセット、サブエージェント、コンテキスト管理 |
| [Neuro-sama](https://vedal.ai/) | AI VTuberのインスピレーション — 個性を持つAIキャラクター、ストリーミング、視聴者インタラクション |

Naiaはこれらのプロジェクトがあるからこそ存在します。基盤を築いてくださったすべてのオープンソースメンテナーとコミュニティに深く感謝します。

## ライセンス

- **ソースコード**: [Apache License 2.0](../LICENSE) — Copyright 2026 Nextain
- **AIコンテキスト** (`.agents/`, `.users/`, `AGENTS.md`): [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## リンク

- **公式サイト：** [naia.nextain.io](https://naia.nextain.io)
- **マニュアル：** [naia.nextain.io/ja/manual](https://naia.nextain.io/ja/manual)
- **ダッシュボード：** [naia.nextain.io/ja/dashboard](https://naia.nextain.io/ja/dashboard)
