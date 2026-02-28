# Naia OS Issue Diagnosis Report (2026-02-28)

## Issues Investigated

1. **Terminal Korean input composition (moasseugi) not working**
2. **Naia Shell OpenClaw gateway failing to start**

---

## Issue 1: Terminal Korean Input Composition (Hangul Moasseugi)

### Symptoms
- Korean input works in GUI apps (Chrome, etc.) but NOT in terminal (Konsole)
- Characters appear individually instead of composing (e.g., `ㅎ ㅏ ㄴ` instead of `한`)
- Boot warning: "Detect GTK_IM_MODULE and QT_IM_MODULE being set and Wayland Input method frontend is working"

### Root Cause

**`GTK_IM_MODULE` and `QT_IM_MODULE` environment variables were set globally, which overrides fcitx5's Wayland-native input frontend.**

On Wayland (KDE Plasma), fcitx5 uses the **Wayland Input Method v2 protocol** for text input. When `GTK_IM_MODULE=fcitx` or `QT_IM_MODULE=fcitx` is set, it forces applications to use the **legacy X11 IM module** instead, which:

1. Bypasses the Wayland-native input path
2. Breaks Korean character composition in terminal emulators (Konsole uses Qt's Wayland text-input)
3. Triggers the diagnostic warning from fcitx5

Additionally, `GLFW_IM_MODULE` was set to `ibus` (typo, should be `fcitx`).

Reference: https://fcitx-im.org/wiki/Using_Fcitx_5_on_Wayland#KDE_Plasma

### Additional Root Causes (discovered on 2nd live USB test)

The previous fix (commit b2ce199) was **necessary but insufficient**. Three additional
sources of `GTK_IM_MODULE=ibus` persisted:

1. **`/usr/bin/kde-ptyxis` hardcodes `env GTK_IM_MODULE=ibus`** — Bazzite's terminal
   wrapper script forces ibus on every terminal launch, overriding all profile.d
   and environment.d settings. This was the **primary cause** of terminal moasseugi
   failure.

2. **`/etc/alternatives/xinputrc` → `ibus.conf`** — Fedora's xinput alternatives
   system defaults to ibus, which sets `GTK_IM_MODULE=ibus` globally for X11 apps.

3. **`/usr/etc/profile.d/fcitx5.sh` not sourced** — Bazzite/ostree places the file
   in `/usr/etc/profile.d/` but `/etc/profile` only sources `/etc/profile.d/*.sh`.
   A symlink is required.

### Affected Files & Changes

| File | Change |
|------|--------|
| `config/files/usr/etc/profile.d/fcitx5.sh` | Removed global `GTK_IM_MODULE`/`QT_IM_MODULE`. Now only set on `XDG_SESSION_TYPE=x11`. Fixed `GLFW_IM_MODULE=ibus` -> `fcitx` |
| `installer/hook-post-rootfs.sh` (lines 320-325) | Removed `GTK_IM_MODULE`/`QT_IM_MODULE` from `/etc/environment.d/input-method.conf`. Only `XMODIFIERS` and `INPUT_METHOD` remain. |
| `installer/hook-post-rootfs.sh` (new) | Patch `/usr/bin/kde-ptyxis` to remove hardcoded `GTK_IM_MODULE=ibus` |
| `installer/hook-post-rootfs.sh` (new) | Switch `/etc/alternatives/xinputrc` → `fcitx5.conf` |
| `installer/hook-post-rootfs.sh` (new) | Symlink `/etc/profile.d/fcitx5.sh` → `/usr/etc/profile.d/fcitx5.sh` |

### Correct Configuration (Wayland)

```sh
# These should be set:
export INPUT_METHOD=fcitx
export XMODIFIERS=@im=fcitx
export SDL_IM_MODULE=fcitx
export GLFW_IM_MODULE=fcitx

# These should NOT be set on Wayland (only on X11):
# export GTK_IM_MODULE=fcitx   # breaks Wayland text-input
# export QT_IM_MODULE=fcitx    # breaks Wayland text-input
```

### Verification
- fcitx5 is running and has Hangul (Dubeolsik) configured as default IM
- KDE kwinrc has `InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop`
- `naia-fcitx5-setup` autostart script correctly configures per-user fcitx5 profile

---

## Issue 2: OpenClaw Gateway Startup Failure

### Symptoms
- Gateway never becomes healthy (60s timeout)
- Infinite restart loop creating zombie processes
- Agent logs: "Gateway not healthy after 60s -- skipping Node Host spawn"
- Chat works but gateway-dependent features (tools, Discord DM, etc.) are unavailable

### Root Cause

**`gateway.mode` field missing from `~/.openclaw/openclaw.json`, AND the installed Flatpak binary doesn't pass `--allow-unconfigured` to the gateway process.**

The gateway startup logic requires either:
1. `gateway.mode=local` in the config file, OR
2. `--allow-unconfigured` CLI flag

The installed binary (compiled before the latest source fixes) had **neither**:
- `ensure_openclaw_config()` function (which patches `gateway.mode`) was added after the binary was compiled
- `--allow-unconfigured` flag was also added after the binary was compiled
- The config file was created by a `sync_openclaw_config` call that didn't include `gateway.mode`

### Gateway Error Log
```
Gateway start blocked: set gateway.mode=local (current: unset) or pass --allow-unconfigured.
```

### Timeline
1. Naia starts, spawns gateway without `--allow-unconfigured`
2. Gateway reads config, finds no `gateway.mode`
3. Gateway exits immediately with "blocked" error
4. Naia waits 60s for health check, fails
5. After 3 more health check failures (90s), auto-restarts gateway
6. Repeat infinitely, creating zombie processes

### Resolution

**Runtime fix (immediate):**
- Added `gateway.mode: "local"`, `port: 18789`, `bind: "loopback"`, `auth: { mode: "token" }` to `~/.openclaw/openclaw.json`
- Restarted Naia -> Gateway started successfully

**Additional root cause (discovered on 2nd live USB test):**
- `config/files/usr/lib/systemd/user/naia-gateway.service` used `ExecStart=/usr/bin/naia-gateway-wrapper`
  which **does not exist** on the system. This was a different file from `config/systemd/naia-gateway.service`
  (which had the correct ExecStart). The systemd service file must call `node openclaw.mjs` directly.
- `hook-post-rootfs.sh` did not pre-seed `gateway.mode=local` into `openclaw.json`,
  so the Flatpak binary (compiled before the `ensure_openclaw_config` fix) could not start.

**Source fixes (for next build):**
| File | Change |
|------|--------|
| `config/files/usr/lib/systemd/user/naia-gateway.service` | Fixed ExecStart: `/usr/bin/naia-gateway-wrapper` → `node openclaw.mjs gateway run --allow-unconfigured` |
| `config/systemd/naia-gateway.service` | Added `--allow-unconfigured` to ExecStart |
| `installer/hook-post-rootfs.sh` | Pre-seed `gateway.mode=local` in `openclaw.json` during ISO build |
| `shell/src-tauri/src/lib.rs` (already in source) | `ensure_openclaw_config()` function patches missing `gateway.mode` |
| `shell/src-tauri/src/lib.rs` (already in source) | `--allow-unconfigured` flag in `spawn_gateway()` |
| `shell/src-tauri/src/lib.rs` (already in source) | Defense-in-depth in `sync_openclaw_config()` |

### Verification (E2E)
```
PASS: Gateway health check returns HTTP 200
PASS: Port 18789 is listening
PASS: gateway.mode=local present in config
PASS: Naia agent is running
PASS: Gateway recovered successfully
```

---

## E2E Test Results Summary (2nd live USB session)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | kde-ptyxis no longer hardcodes ibus | PASS | `sed` patch removes `env GTK_IM_MODULE=ibus` |
| 2 | xinputrc points to fcitx5.conf | PASS | `ln -sf` to `/etc/alternatives/xinputrc` |
| 3 | profile.d/fcitx5.sh symlink exists | PASS | Symlink to `/usr/etc/profile.d/fcitx5.sh` |
| 4 | Clean login shell: GTK_IM_MODULE empty (Wayland) | PASS | `env -i bash -l` confirms no ibus leak |
| 5 | Clean login shell: INPUT_METHOD=fcitx | PASS | profile.d/fcitx5.sh properly sourced |
| 6 | fcitx5 running with hangul | PASS | PID active, profile has `DefaultIM=hangul` |
| 7 | Wayland session confirmed | PASS | `XDG_SESSION_TYPE=wayland` |
| 8 | openclaw.json has gateway.mode=local | PASS | Patched by hook-post-rootfs.sh |
| 9 | Gateway health check (HTTP 200) | PASS | `ws://127.0.0.1:18789` listening |
| 10 | Gateway port 18789 listening | PASS | `ss -tlnp` confirms |
| 11 | Naia agent running | PASS | `node /app/lib/naia-os/agent/dist/index.js` |
| 12 | Naia flatpak installed | PASS | `io.nextain.naia` 0.1.0 |

---

## Why the previous fix (b2ce199) was insufficient

The previous commit correctly identified that `GTK_IM_MODULE`/`QT_IM_MODULE` must not
be set on Wayland. However, three upstream Bazzite mechanisms **re-inject** ibus:

1. **`kde-ptyxis` wrapper** — Bazzite ships a custom wrapper at `/usr/bin/kde-ptyxis`
   that hardcodes `env GTK_IM_MODULE=ibus` on every terminal invocation. This overrides
   all environment.d and profile.d settings. The previous fix didn't know about this
   wrapper script.

2. **`/etc/alternatives/xinputrc`** — Fedora's xinput alternatives system was still
   pointing to `ibus.conf`. Even though we removed `GTK_IM_MODULE` from
   `environment.d`, the xinput system can re-set it depending on login flow.

3. **Profile.d not sourced** — The fixed `fcitx5.sh` was placed in
   `/usr/etc/profile.d/` (ostree convention), but Fedora's `/etc/profile` only
   sources `/etc/profile.d/`. Without a symlink, the script was never executed.

## Recommendations for next ISO build

1. **Must rebuild Flatpak**: The Naia Flatpak binary must be rebuilt from latest
   source to include `ensure_openclaw_config()` and `--allow-unconfigured` in the
   compiled Rust binary. Until then, `hook-post-rootfs.sh` pre-seeds the config.

2. **Verify kde-ptyxis patch**: After ISO build, verify `/usr/bin/kde-ptyxis` no
   longer contains `GTK_IM_MODULE=ibus`.

3. **Test in fresh terminal**: Open a NEW terminal (not an existing one) to verify
   Korean moasseugi works. Existing terminals inherit the parent session's ibus env.
