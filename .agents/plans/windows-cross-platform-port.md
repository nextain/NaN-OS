# Naia Shell Cross-Platform Port Analysis

Target: Windows (Store/Steam) + macOS + SteamOS + Linux (current)
Date: 2026-03-06

## Architecture Overview

```
                    ┌─ Linux (current) ─── Flatpak / AppImage / DEB / RPM
                    │
Naia Shell ─────────┼─ Windows ─────────── Store (MSIX) / Steam / NSIS
(Tauri 2 + React)   │                      └── WSL2 "NaiaEnv" (optional Tier 2)
                    │
                    ├─ macOS ────────────── App Store (DMG) / Steam / Homebrew Cask
                    │                       └── Native Unix (Tier 2 native, no WSL)
                    │
                    └─ SteamOS ──────────── Flatpak (Steam Deck) / Steam
                                            └── Native Linux (Tier 2 native)
```

### Tier Model (all platforms)

| Tier | Features | Requirements |
|------|----------|-------------|
| Tier 1 (Basic) | Chat, Avatar, TTS (Edge), Voice (Gemini Live), Memory (SQLite facts), Discord webhook, Built-in skills | None (standalone) |
| Tier 2 (Advanced) | + Gateway (OpenClaw), exec.bash, Local LLM (Ollama), Local voice gen, Discord bidirectional bot, 50+ skills, Cron, Sessions | Windows: WSL2 / macOS: Native / Linux+SteamOS: Native |

---

## Platform Matrix: Component Compatibility

### Shell (Tauri 2 Rust + React frontend)

| Component | Linux | Windows | macOS | SteamOS |
|-----------|:-----:|:-------:|:-----:|:-------:|
| WebView engine | WebKit2GTK | WebView2 (Edge) | WKWebView | WebKit2GTK |
| Window management | Tauri default | Tauri default | Tauri default | Tauri default |
| Deep link (naia://) | .desktop file | Registry | Info.plist | .desktop file |
| Single instance | D-Bus | Named Mutex | NSDistributedLock | D-Bus |
| Secure store (plugin-store) | File-based | File-based | File-based | File-based |
| Dialog (plugin-dialog) | GTK | WinRT | AppKit | GTK |
| SQLite (rusqlite bundled) | OK | OK | OK | OK |
| Three.js / WebGL | OK | OK | OK | OK (Mesa) |

**Frontend (React/TypeScript)**: Zero platform-specific code found. All path handling delegates to Rust backend.

### Agent (Node.js)

| Component | Linux | Windows | macOS | SteamOS |
|-----------|:-----:|:-------:|:-----:|:-------:|
| LLM providers (Gemini/Claude/xAI) | OK | OK | OK | OK |
| Edge TTS (msedge-tts npm) | OK | OK | OK | OK |
| WebSocket client (gateway) | OK | OK | OK | OK |
| stdio protocol (Shell<->Agent) | OK | OK | OK | OK |
| Device identity (Ed25519 crypto) | OK | OK | OK | OK |
| CronStore (JSON file) | OK | OK* | OK | OK |
| Memo skill (fs read/write) | OK | OK* | OK* | OK |

*path resolution issues (see below)

### Gateway (OpenClaw)

| Component | Linux | Windows (WSL) | macOS | SteamOS |
|-----------|:-----:|:-------------:|:-----:|:-------:|
| exec.bash | Native | WSL | Native | Native |
| systemd service | Native | WSL systemd | launchd | Flatpak (no systemd) |
| Channels (Discord/Telegram) | OK | OK (WSL) | OK | OK |
| Skills ecosystem (50+) | OK | OK (WSL) | OK | OK |
| Semantic memory search | OK | OK (WSL) | OK | OK |
| Local LLM (Ollama + CUDA) | OK | OK (WSL+CUDA) | OK (Metal) | OK (Mesa/AMD) |

---

## Modification Inventory

### A. Rust (lib.rs) — 28 items

#### A1. CRITICAL: Process management (3 items)

```
Line 202: is_pid_alive() uses /proc/{pid}
  Linux/macOS/SteamOS: /proc exists (macOS: sysctl alternative but /proc not standard)
  Windows: No /proc
  FIX: Use sysinfo crate (cross-platform) or #[cfg] per OS
       macOS: Use libc::kill(pid, 0) to check (returns 0 if alive)

Line 227: libc::kill(pid, SIGTERM)
Line 237: libc::kill(pid, SIGKILL)
  Linux/macOS/SteamOS: Works (POSIX signals)
  Windows: No POSIX signals
  FIX: #[cfg(unix)] for signal calls, #[cfg(windows)] for TerminateProcess
```

**NOTE**: macOS supports /proc partially but NOT /proc/{pid} — use `libc::kill(pid, 0)` for process-alive check on all Unix platforms (more reliable than /proc even on Linux).

#### A2. CRITICAL: Command execution (2 items)

```
Line 655: Command::new("pkill").arg("-f").arg("openclaw.*gateway")
  Linux/SteamOS: OK
  macOS: OK (pkill available via proctools)
  Windows: No pkill
  FIX: #[cfg(unix)] pkill, #[cfg(windows)] taskkill or wsl -d NaiaEnv -- pkill

Line 660: Command::new("true") (dummy process)
  Linux/macOS/SteamOS: OK
  Windows: No /bin/true
  FIX: #[cfg(unix)] Command::new("true"), #[cfg(windows)] Command::new("cmd").args(["/c", "exit", "0"])
```

#### A3. CRITICAL: Home directory (12 items)

All use `std::env::var("HOME")` with fallback `/tmp`:
```
Lines: 123, 172, 371, 421, 530, 1153, 1301, 1500, 1531, 1681
  Linux/SteamOS: HOME always set
  macOS: HOME always set
  Windows: HOME usually NOT set (USERPROFILE instead)
  FIX: Create helper fn:
    fn home_dir() -> PathBuf {
        dirs::home_dir().unwrap_or_else(|| {
            #[cfg(unix)] { PathBuf::from("/tmp") }
            #[cfg(windows)] { PathBuf::from(std::env::var("TEMP").unwrap_or("C:\\Temp".into())) }
        })
    }
```

Dot-directory mapping:
```
  Linux/macOS/SteamOS: ~/.naia/, ~/.openclaw/ (hidden files OK)
  Windows: %APPDATA%\naia\, %APPDATA%\openclaw\ (or keep dot-dirs, Windows supports them)
  DECISION: Keep ~/.naia/ and ~/.openclaw/ on all platforms.
            Windows supports dot-directories since Win10.
            Simpler than platform-specific paths, and WSL shares the same home.
```

#### A4. CRITICAL: Flatpak-specific paths (5 items)

```
Line 348: "/app/bin/node" (Flatpak Node.js)
Line 425: "/app/lib/naia-os/openclaw/..."
Line 426: "/usr/share/naia/openclaw/..."
Line 456: "/app/lib/naia-os/openclaw-bootstrap.json"
Lines 814, 851: "/app/lib/naia-os/agent/dist/index.js"
  Linux/SteamOS: Relevant (Flatpak distribution)
  macOS: Not relevant (no Flatpak)
  Windows: Not relevant (no Flatpak)
  FIX: Gate Flatpak paths behind #[cfg(target_os = "linux")] or
       runtime check (std::env::var("FLATPAK"))
       Add macOS paths: /Applications/Naia.app/Contents/Resources/
       Add Windows paths: {exe_dir}/resources/ (Tauri default)
```

#### A5. MAJOR: NVM paths (2 items)

```
Lines 372-374: ~/.nvm/versions/node, ~/.config/nvm/versions/node
  Linux/SteamOS: OK
  macOS: OK (same nvm paths)
  Windows: NVM for Windows uses %APPDATA%\nvm\
  FIX: Add Windows nvm path. Also check fnm (cross-platform alternative).
       Better: On Windows, prioritize bundled node.exe over nvm discovery.
```

#### A6. MAJOR: Gateway spawn — WSL bridge (NEW, 3 items)

```
Line 624: Command::new(node_bin).arg(openclaw_mjs).arg("gateway").arg("run")...
Line 711: Command::new(node_bin) for Node Host spawn
  Linux/macOS/SteamOS: Direct spawn (current behavior)
  Windows Tier 1: Skip gateway spawn entirely
  Windows Tier 2: wsl -d NaiaEnv -- node /opt/naia/openclaw/openclaw.mjs gateway run ...
  FIX: Platform + tier conditional:
    #[cfg(unix)] → direct spawn (current)
    #[cfg(windows)] → if tier2_enabled { wsl_spawn_gateway() } else { skip }
```

#### A7. MINOR: WebKit-specific (already handled, 3 items)

```
Lines 12-15: #[cfg(target_os = "linux")] webkit2gtk imports — OK
Line 2438: #[cfg(target_os = "linux")] EGL/permission block — OK
main.rs:9: #[cfg(target_os = "linux")] WEBKIT_DISABLE_DMABUF_RENDERER — OK
  macOS: Uses WKWebView, not WebKit2GTK. Tauri handles this automatically.
  NO CHANGES NEEDED.
```

#### A8. MINOR: Test code (3 items)

```
Lines 2664, 2673, 2674: Command::new("true") in tests
Line 2688: assert!(dir.ends_with(".naia/logs"))
  FIX: #[cfg(unix)] tests, or use platform-agnostic assertions
  LOW PRIORITY — tests can be gated per platform
```

#### A9. NEW: macOS-specific considerations

```
macOS has NO /proc filesystem at all (unlike Linux).
is_pid_alive() (Line 202) MUST NOT use /proc on macOS.
  FIX: Use libc::kill(pid as i32, 0) on all Unix — returns 0 if process exists.
       This is MORE correct than /proc even on Linux.

macOS launchd vs systemd:
  Gateway daemon: launchd plist instead of systemd unit
  FIX: Shell spawns Gateway as child process (current behavior) — works on macOS.
       Optional: generate ~/Library/LaunchAgents/io.nextain.naia.gateway.plist
       for always-on mode.

macOS Gatekeeper / notarization:
  App must be signed + notarized for distribution outside App Store.
  Tauri handles this via apple-signing-identity + notarization credentials in CI.
```

#### A10. NEW: SteamOS-specific considerations

```
SteamOS immutable rootfs:
  Cannot install system packages. Flatpak is the ONLY distribution method.
  Current Flatpak build already works on SteamOS.

SteamOS Gaming Mode:
  No traditional desktop. Apps run in Steam's compositor.
  Naia Shell (Tauri) would run as a Steam Non-Steam Game shortcut.
  OR: Steam native app via Steamworks.

Steam Deck controller input:
  Tauri WebView receives standard keyboard/mouse events.
  Steam Input API translates controller → mouse/keyboard.
  Three.js avatar interaction may need touch-friendly UI adjustments.
  FIX: Add touch/gamepad-friendly UI mode (larger buttons, d-pad navigation).

SteamOS storage:
  Steam Deck has limited storage (64GB-512GB).
  Naia Shell Flatpak: ~200MB (with OpenClaw + Node.js bundled).
  Local LLM (Ollama): Models are 4-70GB each.
  FIX: Clear storage warnings in UI when enabling local LLM.
```

---

### B. Agent (Node.js) — 11 items

#### B1. CRITICAL: process.env.HOME (3 items)

```
gateway/tool-bridge.ts:56  — cronStorePath
gateway/tool-bridge.ts:76  — customSkillsDir
skills/built-in/memo.ts:13 — memoDir
skills/built-in/notify-config.ts:28 — config path

  FIX: Replace all with:
    import { homedir } from "node:os";
    const home = homedir();
  homedir() works correctly on ALL platforms (Linux, macOS, Windows).
```

#### B2. CRITICAL: bash hardcoding (3 items)

```
gateway/tool-bridge.ts:449  — command: ["bash", "-lc", command]
gateway/tool-bridge.ts:469  — flatpak-spawn --host bash -c '...'
skills/loader.ts:65         — command: ["bash", "-lc", command]

  Linux/macOS/SteamOS: bash available
  Windows: bash NOT available (unless WSL)
  FIX: These run via Gateway RPC (exec.bash, node.invoke).
       On Windows, Gateway runs IN WSL → bash is available inside WSL.
       On macOS, bash is available natively (or zsh as default shell).
       NO CODE CHANGE NEEDED — Gateway handles the shell environment.
       The bash commands are executed WHERE the Gateway runs, not where the Agent runs.
```

#### B3. CRITICAL: Unix shell commands in tool-bridge.ts (5 items)

```
Line 593: cat ${path}
Line 606: mkdir -p "$(dirname ...)" && printf '%s' ... > ${path}
Line 630: grep -rl ${pattern} ${searchPath}
Line 631: find ${searchPath} -name ${pattern}
Line 701-718: printf '%s' ... > ${path}

  Same as B2 — these are sent TO Gateway (exec.bash RPC).
  Gateway runs on Linux (native or WSL) → Unix commands work.
  NO CODE CHANGE NEEDED for exec'd commands.

  However: read_file, write_file, search_files COULD use Node.js fs APIs
  as a Gateway-independent fallback for Tier 1 mode.
  FIX (enhancement): Add fs-based fallback when Gateway unavailable.
```

#### B4. MEDIUM: Flatpak detection (1 item)

```
gateway/tool-bridge.ts:467  — fs.existsSync("/.flatpak-info")
providers/claude-code-cli.ts:162 — existsSync("/run/flatpak-info") || process.env.FLATPAK === "1"

  Windows/macOS: Always false (harmless but wasteful)
  FIX: Add process.platform === "linux" guard (optional, low priority)
```

#### B5. MEDIUM: SIGTERM signals (1 item)

```
providers/claude-code-cli.ts:228,325,370 — child.kill("SIGTERM")

  Node.js on Windows: kill("SIGTERM") calls TerminateProcess (force kill).
  Behavior differs but doesn't crash.
  FIX: Optional — use child.kill() without argument for cross-platform default.
```

#### B6. OK: Already cross-platform (no changes needed)

```
index.ts:86-87          — homedir() already used (correct)
gateway/device-identity.ts:12 — homedir() already used (correct)
gateway/client.ts       — WebSocket, platform-agnostic
skills/built-in/naia-discord.ts:184 — homedir() already used (correct)
skills/built-in/system-status.ts — os.platform() (returns correct value per OS)
cron/store.ts           — path.join + fs APIs (cross-platform)
All LLM providers       — HTTP API calls (cross-platform)
All TTS providers       — HTTP/npm (cross-platform)
```

---

### C. Build & Distribution Pipeline

#### C1. CI/CD Matrix

```yaml
# .github/workflows/release-app.yml (expanded)

jobs:
  build-frontend:  # SHARED — runs once
    runs-on: ubuntu-latest
    steps:
      - pnpm install && pnpm build (shell frontend)
      - cd agent && pnpm build
      - upload-artifact: frontend-dist

  build-linux:
    needs: build-frontend
    runs-on: ubuntu-22.04
    outputs: AppImage, DEB, RPM

  build-flatpak:  # Linux + SteamOS
    needs: build-frontend
    runs-on: ubuntu-latest
    outputs: Flatpak

  build-windows:  # NEW
    needs: build-frontend
    runs-on: windows-latest
    steps:
      - Download frontend-dist
      - Download Node.js 22 portable (node.exe ~50MB)
      - cargo tauri build --config src-tauri/tauri.conf.windows.json
      - winapp pack → MSIX
    outputs: NSIS (.exe installer), MSI, MSIX

  build-wsl-distro:  # NEW — WSL rootfs for Windows Tier 2
    needs: []  # independent
    runs-on: ubuntu-latest
    steps:
      - Create minimal rootfs (Alpine or Ubuntu)
      - Install Node.js 22 + OpenClaw + Ollama
      - Configure systemd, wsl.conf
      - podman export → tar.gz
    outputs: naia-wsl-rootfs.tar.gz (~250MB)

  build-macos:  # NEW
    needs: build-frontend
    runs-on: macos-latest  # Apple Silicon (arm64)
    steps:
      - Download frontend-dist
      - cargo tauri build
      - Notarize + staple
    outputs: DMG (universal binary or arm64+x86_64 separate)

  release:
    needs: [build-linux, build-flatpak, build-windows, build-wsl-distro, build-macos]
    steps:
      - Download all artifacts
      - SHA256SUMS
      - GitHub Release
      - Steam depot upload (steamcmd) — Linux + Windows + macOS
      - MS Store submit (winapp) — Windows MSIX
      - Homebrew cask update — macOS
```

#### C2. Tauri Configuration Files

```
shell/src-tauri/
├── tauri.conf.json              # Shared: app name, version, CSP, identifier
├── tauri.conf.linux.json        # Linux: targets=["deb","rpm","appimage"]
├── tauri.conf.windows.json      # Windows: targets=["nsis","msi"], node.exe bundle
├── tauri.conf.macos.json        # macOS: targets=["dmg","updater"], signing identity
├── tauri.conf.flatpak.json      # Flatpak: override beforeBuildCommand (existing)
└── Cargo.toml                   # Conditional deps (webkit2gtk linux-only, existing)
```

#### C3. Platform-Specific Bundle Contents

| Resource | Linux | Windows | macOS | SteamOS (Flatpak) |
|----------|-------|---------|-------|--------------------|
| agent/dist/ | bundle | bundle | bundle | /app/lib/naia-os/agent/ |
| agent/node_modules/ | bundle | bundle | bundle | /app/lib/naia-os/agent/ |
| node binary | system (find_node) | node.exe bundled | system (find_node) | /app/bin/node |
| openclaw/ | system (~/.naia/) | WSL distro | system (~/.naia/) | /app/lib/naia-os/openclaw/ |
| wsl rootfs | N/A | naia-wsl-rootfs.tar.gz | N/A | N/A |

#### C4. macOS Signing & Notarization

```yaml
# CI environment variables needed:
APPLE_CERTIFICATE: base64-encoded .p12
APPLE_CERTIFICATE_PASSWORD: certificate password
APPLE_SIGNING_IDENTITY: "Developer ID Application: Nextain Inc (TEAMID)"
APPLE_ID: developer@nextain.io
APPLE_PASSWORD: app-specific password
APPLE_TEAM_ID: XXXXXXXXXX

# Tauri handles signing + notarization automatically when these are set
# tauri.conf.macos.json:
{
  "bundle": {
    "targets": ["dmg"],
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": null,  # auto from env
      "entitlements": "Entitlements.plist"
    }
  }
}
```

#### C5. Steam Distribution (all platforms)

```
Steamworks:
  - Register app ($100 one-time fee)
  - Create depot per platform:
      Depot 1: Windows (NSIS output dir)
      Depot 2: Linux (AppImage or raw files)
      Depot 3: macOS (app bundle)
  - Upload via steamcmd in CI
  - steamworks-rs crate for Rust integration (achievements, overlay, cloud saves)
  - tauri-plugin-hal-steamworks for Tauri-specific binding

Steam Deck (SteamOS):
  - Listed as "Steam Deck Verified" if it meets criteria:
    - Input: controller-friendly UI
    - Display: 1280x800 default, readable text
    - Seamlessness: no launcher, no anti-cheat issues
    - System: Proton not needed (native Linux)
  - Flatpak option: user installs Flatpak manually in Desktop Mode
    (Discover store on SteamOS supports Flathub)
```

---

### D. Windows WSL Integration Detail

#### D1. Shell Rust — WSL management functions (NEW code)

```rust
// New module: src/wsl.rs

#[cfg(target_os = "windows")]
pub mod wsl {
    use std::process::Command;

    /// Check if WSL2 is available
    pub fn is_wsl_available() -> bool {
        Command::new("wsl").arg("--status")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Check if NaiaEnv distro is registered
    pub fn is_distro_registered(name: &str) -> bool {
        Command::new("wsl").args(["-l", "-q"])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.lines().any(|l| l.trim().trim_matches('\0') == name)
            })
            .unwrap_or(false)
    }

    /// Import custom distro from tar.gz
    pub fn import_distro(name: &str, install_path: &str, tar_path: &str) -> Result<(), String> {
        let output = Command::new("wsl")
            .args(["--import", name, install_path, tar_path, "--version", "2"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() { Ok(()) }
        else { Err(String::from_utf8_lossy(&output.stderr).to_string()) }
    }

    /// Run command inside WSL distro
    pub fn run_in_distro(name: &str, command: &str) -> Result<String, String> {
        let output = Command::new("wsl")
            .args(["-d", name, "--", "bash", "-lc", command])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Spawn Gateway inside WSL (returns Child)
    pub fn spawn_gateway(name: &str, port: u16) -> Result<std::process::Child, String> {
        Command::new("wsl")
            .args(["-d", name, "--", "node",
                   "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
                   "gateway", "run", "--bind", "loopback", "--port", &port.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())
    }

    /// Terminate WSL distro
    pub fn terminate_distro(name: &str) {
        let _ = Command::new("wsl").args(["--terminate", name]).output();
    }
}
```

#### D2. WSL Networking

```
.wslconfig (auto-generated by Shell):
  [wsl2]
  networkingMode=mirrored    # localhost reliable for WebSocket
  localhostForwarding=true
  memory=8GB                 # configurable in Settings UI

Gateway binds to 0.0.0.0:18789 inside WSL.
Shell connects to ws://localhost:18789 from Windows host.
Mirrored networking ensures reliable long-lived WebSocket.

Hyper-V firewall rule (one-time, during setup):
  Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-...}' -DefaultInboundAction Allow
```

#### D3. GPU / Local LLM in WSL

```
NVIDIA CUDA in WSL2:
  - Windows GPU driver automatically exposes libcuda.so stub in WSL
  - No additional installation needed in WSL
  - Performance: 95%+ of native Linux for LLM inference
  - Supported: Pascal (GTX 10xx) and newer

AMD ROCm in WSL2:
  - Beta support (RX 7000 only, Win11 only)
  - Significantly worse than NVIDIA
  - Recommendation: NVIDIA strongly preferred for WSL AI workloads

Ollama setup in WSL distro:
  curl -fsSL https://ollama.com/install.sh | sh
  systemctl enable --now ollama
  # Accessible from Windows at http://localhost:11434
```

---

### E. macOS-Specific Considerations

#### E1. Daemon Management

```
macOS has NO systemd. Options for Gateway:
  1. Shell spawns Gateway as child process (CURRENT behavior — works on macOS as-is)
  2. launchd user agent (~/Library/LaunchAgents/io.nextain.naia.gateway.plist)
     - Survives Shell restart
     - Auto-start on login
     - Similar to systemd user service

Current code already handles this:
  spawn_gateway() spawns Gateway as child → works on macOS.
  For always-on daemon, generate launchd plist as enhancement.
```

#### E2. Node.js Discovery (macOS additions)

```
find_node_binary() needs:
  1. Bundled node (Tauri resources) — all platforms
  2. System PATH: node (works on macOS)
  3. Homebrew: /opt/homebrew/bin/node (Apple Silicon) or /usr/local/bin/node (Intel)
  4. nvm: ~/.nvm/versions/node/ (same as Linux)
  5. fnm: ~/Library/Application Support/fnm/node-versions/

FIX: Add Homebrew paths for macOS.
```

#### E3. App Store Distribution

```
Requirements:
  - Apple Developer Program ($99/year)
  - App Sandbox entitlements (network, files)
  - No private API usage
  - Tauri apps CAN be submitted to Mac App Store
  - Need: Entitlements.plist with com.apple.security.network.client = true

Alternative: Direct DMG download + notarization (simpler, no Store review)
Homebrew Cask: brew install --cask naia (community formula)
```

#### E4. macOS /proc Issue (CONFIRMED BUG)

```
Line 202: is_pid_alive() uses /proc/{pid}
  macOS does NOT have /proc/{pid} filesystem.
  This is a BUG even for current macOS support (if attempted).

FIX (all Unix):
  fn is_pid_alive(pid: u32) -> bool {
      unsafe { libc::kill(pid as i32, 0) == 0 || *libc::__errno_location() == libc::EPERM }
  }
  // kill(pid, 0) returns 0 if process exists (or EPERM if no permission but alive)
  // This works on Linux, macOS, and SteamOS.
```

---

### F. SteamOS / Steam Deck Specific

#### F1. Distribution

```
Primary: Flatpak (current build already works)
  - SteamOS uses Flathub in Desktop Mode (KDE Discover)
  - Existing Flatpak bundle includes Node.js + OpenClaw

Secondary: Steam Non-Steam Game shortcut
  - User adds Flatpak app as Non-Steam Game
  - Runs in Gaming Mode with Steam Overlay

Tertiary: Steam native app
  - Requires Steamworks integration
  - Listed in Steam library alongside games
  - Steam handles updates
```

#### F2. UI Adaptations for Steam Deck

```
Steam Deck screen: 1280x800 (7" LCD) or 1280x800 (OLED)
Naia Shell UI needs:
  - Larger touch targets (48px minimum)
  - Readable text at small screen size
  - Virtual keyboard support (Steam provides this)
  - Gamepad navigation (d-pad to move between UI elements)
  - Panel position "bottom" as default on small screens

FIX: Detect screen size / Steam Deck via:
  - navigator.userAgent or screen resolution
  - Steam Deck env var: SteamDeck=1 (if running via Steam)
  - Adjust panelSize, font sizes, button sizes accordingly
```

#### F3. SteamOS Limitations

```
- Immutable rootfs (read-only /usr, /etc)
  → Cannot install system packages
  → Flatpak or user home directory only

- Flatpak sandbox
  → Network access OK (--share=network)
  → Filesystem access: --filesystem=home (or specific paths)
  → D-Bus: --own-name=com.naia.shell.*

- Steam Overlay
  → Tauri uses system WebView, not Chromium
  → Steam Overlay injection may not work reliably
  → Alternative: Use Steam's built-in screenshot/FPS counter instead

- Power management
  → Steam Deck aggressively suspends background apps
  → Gateway daemon may get killed on suspend
  → FIX: Health monitor auto-restarts Gateway on resume (already implemented)
```

---

## Summary: Changes by Priority

### Must Do (P0) — Build breaks without these

| # | Component | File | Change | Affects |
|---|-----------|------|--------|---------|
| 1 | Rust | lib.rs:202 | is_pid_alive: /proc → libc::kill(pid,0) | macOS, Windows |
| 2 | Rust | lib.rs:227,237 | SIGTERM/SIGKILL: #[cfg(unix)] gate | Windows |
| 3 | Rust | lib.rs:655 | pkill: #[cfg(unix)] gate + Windows alternative | Windows |
| 4 | Rust | lib.rs:660,2664 | Command::new("true"): platform gate | Windows |
| 5 | Rust | lib.rs (12 sites) | HOME → dirs::home_dir() or helper fn | Windows |
| 6 | Rust | lib.rs (5 sites) | Flatpak paths: #[cfg(linux)] gate | macOS, Windows |
| 7 | Rust | Cargo.toml | Add #[cfg(windows)] deps (if needed) | Windows |
| 8 | Agent | tool-bridge.ts:56,76 | process.env.HOME → homedir() | Windows |
| 9 | Agent | memo.ts:13 | process.env.HOME → homedir() | Windows |
| 10 | Agent | notify-config.ts:28 | process.env.HOME → homedir() | Windows |
| 11 | Config | tauri.conf.windows.json | New file: Windows bundle targets | Windows |
| 12 | Config | tauri.conf.macos.json | New file: macOS bundle targets | macOS |
| 13 | CI | release-app.yml | Add windows-latest + macos-latest runners | Windows, macOS |

### Should Do (P1) — Full feature parity

| # | Component | File | Change | Affects |
|---|-----------|------|--------|---------|
| 14 | Rust | NEW wsl.rs | WSL management module | Windows Tier 2 |
| 15 | Rust | lib.rs | Gateway spawn: WSL bridge for Windows | Windows Tier 2 |
| 16 | Rust | lib.rs | Node.js discovery: Windows/macOS paths | Windows, macOS |
| 17 | Rust | lib.rs | macOS: Homebrew node path | macOS |
| 18 | CI | release-app.yml | build-wsl-distro job | Windows Tier 2 |
| 19 | CI | release-app.yml | macOS signing + notarization | macOS |
| 20 | CI | release-app.yml | MSIX packaging (winapp) | Windows Store |
| 21 | CI | release-app.yml | Steam depot upload (steamcmd) | All platforms |
| 22 | Config | .wslconfig template | WSL resource config | Windows |

### Nice to Have (P2) — Enhanced experience

| # | Component | Change | Affects |
|---|-----------|--------|---------|
| 23 | Agent | fs-based fallback for read/write/search (no Gateway) | All (Tier 1) |
| 24 | Shell UI | Steam Deck responsive layout | SteamOS |
| 25 | Shell UI | Gamepad navigation support | SteamOS |
| 26 | Rust | launchd plist generation for macOS daemon | macOS |
| 27 | Rust | Steamworks integration (overlay, achievements) | Steam |
| 28 | Agent | Flatpak detection: add platform guard | All |

### Total: 13 P0 + 9 P1 + 6 P2 = 28 items

---

## Execution Phases

### Phase 1: Cross-platform foundation (P0 items)
- lib.rs platform abstraction (home_dir, process mgmt, command compat)
- Agent homedir() fixes (3 files)
- tauri.conf.{windows,macos}.json
- CI matrix expansion

### Phase 2: Windows distribution
- WSL management module (wsl.rs)
- Gateway WSL bridge
- MSIX packaging → Microsoft Store
- WSL distro rootfs build pipeline

### Phase 3: macOS distribution
- macOS signing + notarization CI
- Homebrew node discovery
- DMG distribution
- Optional: Mac App Store submission

### Phase 4: Steam + SteamOS
- Steamworks SDK integration
- Steam depot CI pipeline
- Steam Deck UI adaptations
- Flatpak verification on SteamOS

### Phase 5: Local AI (all platforms)
- Ollama integration (WSL on Windows, native on Linux/macOS)
- GPU detection + Settings UI
- Local voice generation engine
- Model management UI
