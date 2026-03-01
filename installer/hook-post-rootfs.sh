#!/usr/bin/env bash
# hook-post-rootfs.sh — Titanoboa ISO post-rootfs hook
# Runs inside podman --rootfs (the extracted container image IS /)
# /app is titanoboa's own repo, NOT ours — clone naia-os to get assets.
set -euo pipefail

REPO_URL="https://github.com/nextain/naia-os.git"
SRC="/tmp/naia-os-repo"

# ==============================================================================
# 1. Install Anaconda + branding
# ==============================================================================

# Bazzite versionlocks NetworkManager (COPR build) and sets repo-level excludes
# via dnf5 config-manager (repos.override.d). Clear both so anaconda-live can install.
dnf -qy versionlock clear 2>/dev/null || true
rm -f /etc/dnf/repos.override.d/99-config_manager.repo 2>/dev/null || true

dnf install -y --allowerasing \
    git anaconda-live libblockdev-btrfs libblockdev-lvm libblockdev-dm \
    libblockdev-mpath firefox

git clone --depth 1 --quiet "${REPO_URL}" "${SRC}"

# Branding assets
cp "${SRC}/assets/installer/sidebar-logo.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/sidebar-bg.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/topbar-bg.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/anaconda_header.png" /usr/share/anaconda/pixmaps/
cp "${SRC}/assets/installer/fedora.css" /usr/share/anaconda/pixmaps/

# "Install to Hard Drive" icon — SVG + PNG sizes (KDE prefers PNG over SVG)
cp "${SRC}/assets/installer/anaconda-installer.svg" \
   /usr/share/icons/hicolor/scalable/apps/org.fedoraproject.AnacondaInstaller.svg
if [ -f "${SRC}/assets/installer/anaconda-installer-symbolic.svg" ]; then
    cp "${SRC}/assets/installer/anaconda-installer-symbolic.svg" \
       /usr/share/icons/hicolor/scalable/apps/org.fedoraproject.AnacondaInstaller-symbolic.svg
fi
# Render PNG from SVG for sizes KDE actually uses
for size in 32 48 64 256; do
    dst="/usr/share/icons/hicolor/${size}x${size}/apps/org.fedoraproject.AnacondaInstaller.png"
    mkdir -p "$(dirname "$dst")"
    if command -v rsvg-convert &>/dev/null; then
        rsvg-convert -w "$size" -h "$size" \
            "${SRC}/assets/installer/anaconda-installer.svg" -o "$dst" 2>/dev/null || true
    fi
done

# ==============================================================================
# 2. Anaconda profile
# ==============================================================================

mkdir -p /etc/anaconda/profile.d
cat > /etc/anaconda/profile.d/naia.conf <<'EOF'
[Profile]
profile_id = naia-os

[Profile Detection]
os_id = naia-os

[Bootloader]
efi_dir = fedora

[Storage]
default_scheme = BTRFS
btrfs_compression = zstd:1

[User Interface]
custom_stylesheet = /usr/share/anaconda/pixmaps/fedora.css
hidden_spokes = NetworkSpoke
EOF

# ==============================================================================
# 3. Anaconda pre-install cleanup wrapper
#    Stop Naia Shell, OpenClaw Gateway, and other runtime processes before
#    Anaconda's rsync copies the live filesystem. Running processes create
#    transient files (sockets, PID files, locks) that vanish during rsync,
#    causing exit code 23 (partial transfer).
# ==============================================================================

cat > /usr/libexec/naia-liveinst-wrapper.sh <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

echo "[naia] Stopping runtime processes before installation..."

# 1. Stop Naia Shell (Flatpak)
flatpak kill io.nextain.naia 2>/dev/null || true

# 2. Stop OpenClaw Gateway (Node.js)
pkill -f "openclaw.*gateway" 2>/dev/null || true

# 3. Stop fcitx5 (input method — creates temp files)
pkill -f fcitx5 2>/dev/null || true

# 4. Clean up transient runtime files that rsync might trip on
LIVEUSER_HOME="/var/home/liveuser"
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.lock 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.pid 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.sock 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.cache/fcitx5" 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.local/share/fcitx5/rime" 2>/dev/null || true

# 5. Wait briefly for processes to fully exit
sleep 1

echo "[naia] Cleanup done. Launching Anaconda installer..."
exec /usr/bin/liveinst "$@"
WRAPPER
chmod +x /usr/libexec/naia-liveinst-wrapper.sh

# Override the "Install to Hard Drive" desktop entry to use our wrapper
# Anaconda's liveinst-setup copies it to Desktop; we override the system .desktop
ANACONDA_DESKTOP="/usr/share/applications/org.fedoraproject.AnacondaInstaller.desktop"
if [ -f "$ANACONDA_DESKTOP" ]; then
    sed -i 's|Exec=.*liveinst.*|Exec=/usr/libexec/naia-liveinst-wrapper.sh|' "$ANACONDA_DESKTOP"
fi
# Also check alternative desktop entry location
ANACONDA_DESKTOP2="/usr/share/applications/liveinst.desktop"
if [ -f "$ANACONDA_DESKTOP2" ]; then
    sed -i 's|Exec=.*liveinst.*|Exec=/usr/libexec/naia-liveinst-wrapper.sh|' "$ANACONDA_DESKTOP2"
fi

# ==============================================================================
# 4. Live session — KDE taskbar pins (Plasma update script)
#    Bazzite uses this approach: runs once per user when plasmashell detects it.
# ==============================================================================

mkdir -p /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates
cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-pins.js <<'JSEOF'
var allPanels = panels();
for (var i = 0; i < allPanels.length; ++i) {
    var panel = allPanels[i];
    var widgets = panel.widgets();
    for (var j = 0; j < widgets.length; ++j) {
        var widget = widgets[j];
        if (widget.type === "org.kde.plasma.icontasks") {
            widget.currentConfigGroup = ["General"];
            widget.writeConfig("launchers", [
                "applications:io.nextain.naia.desktop",
                "preferred://browser",
                "preferred://filemanager"
            ]);
            widget.reloadConfig();
        }
        // Replace Bazzite "B" icon on Kickoff (app launcher) with Naia start-here
        if (widget.type === "org.kde.plasma.kickoff") {
            widget.currentConfigGroup = ["General"];
            widget.writeConfig("icon", "start-here");
            widget.reloadConfig();
        }
    }
}
JSEOF

# ==============================================================================
# 5. Live session — Kickoff (start menu) favorites
# ==============================================================================

mkdir -p /etc/xdg
cat > /etc/xdg/kicker-extra-favoritesrc <<'EOF'
[General]
Prepend=io.nextain.naia.desktop;firefox.desktop;com.discordapp.Discord.desktop;
IgnoreDefaults=false
EOF


# ==============================================================================
# 6. Live session — Korean input (fcitx5)
#    Bazzite already ships fcitx5 + fcitx5-hangul + fcitx5-wayland-launcher.
#    Use /etc/xdg/ system-wide defaults instead of /etc/skel/ (more reliable).
# ==============================================================================

# fcitx5 profile (hangul as default IM) — system-wide default
mkdir -p /etc/xdg/fcitx5
cat > /etc/xdg/fcitx5/profile <<'EOF'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=hangul

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=hangul
Layout=

[GroupOrder]
0=Default
EOF

# KDE Wayland virtual keyboard → fcitx5 (system-wide)
cat >> /etc/xdg/kwinrc <<'EOF'

[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
EOF

# fcitx5 autostart for live session
mkdir -p /etc/xdg/autostart
cp /usr/etc/xdg/autostart/naia-fcitx5-setup.desktop /etc/xdg/autostart/ 2>/dev/null || true

# ==============================================================================
# 7. Live session — wallpaper (Plasma update script)
# ==============================================================================

cp "${SRC}/assets/installer/live-wallpaper.jpg" /usr/share/wallpapers/naia-live.jpg

cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-wallpaper.js <<'JSEOF'
var allDesktops = desktops();
for (var i = 0; i < allDesktops.length; ++i) {
    var d = allDesktops[i];
    d.wallpaperPlugin = "org.kde.image";
    d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    d.writeConfig("Image", "file:///usr/share/wallpapers/naia-live.jpg");
}
JSEOF

# ==============================================================================
# 8. Live session — warning notification (data is ephemeral)
# ==============================================================================

mkdir -p /etc/xdg/autostart /usr/libexec
cat > /usr/libexec/naia-live-warning.sh <<'SCRIPT'
#!/usr/bin/env bash
case "${LANG:-en_US.UTF-8}" in
    ko*|ko_KR*)
        TITLE="Naia OS 라이브"
        MSG="Naia OS에 오신 것을 환영합니다!\n\n바탕화면의 'Install to Hard Drive'를 실행하면\n데스크톱에 설치할 수 있습니다.\n\n[ 라이브 USB 사용법 ]\n1. Wi-Fi 연결\n2. 브라우저에서 Google 로그인\n3. Naia Shell 실행\n\n[ 입력기 ]\n한국어 입력이 기본 설정되어 있습니다 (Ctrl+Space 전환).\n다른 언어(일본어/중국어 등)로 변경하려면\n설치 시 로케일을 변경하세요. 자동으로 반영됩니다.\n\n※ 라이브 세션은 재부팅 시 초기화됩니다.\n※ 이 안내는 바탕화면에서 다시 볼 수 있습니다."
        ;;
    ja*|ja_JP*)
        TITLE="Naia OS ライブ"
        MSG="Naia OSへようこそ!\n\nデスクトップの「Install to Hard Drive」を実行すると\nデスクトップにインストールできます。\n\n[ ライブUSBの使い方 ]\n1. Wi-Fi接続\n2. ブラウザでGoogleログイン\n3. Naia Shell起動\n\n[ 入力方法 ]\n韓国語入力がデフォルト設定です (Ctrl+Space切替)。\n他の言語に変更するには、インストール時にロケールを\n変更してください。自動的に反映されます。\n\n※ ライブセッションは再起動時にリセットされます。\n※ この案内はデスクトップから再表示できます。"
        ;;
    *)
        TITLE="Naia OS Live"
        MSG="Welcome to Naia OS!\n\nRun 'Install to Hard Drive' on the desktop\nto install to your computer.\n\n[ Live USB Usage ]\n1. Connect to Wi-Fi\n2. Sign in to Google in browser\n3. Launch Naia Shell\n\n[ Input Method ]\nKorean input is configured by default (Ctrl+Space to toggle).\nTo use another language (Japanese, Chinese, etc.),\nchange the locale during installation. It will apply automatically.\n\n* Live session resets on reboot.\n* You can view this guide again from the desktop."
        ;;
esac
kdialog --msgbox "$MSG" --title "$TITLE"
SCRIPT
chmod +x /usr/libexec/naia-live-warning.sh

cat > /etc/xdg/autostart/naia-live-warning.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Naia Live Session Warning
Name[ko]=Naia OS 라이브 세션 경고
Name[ja]=Naia OS ライブセッション警告
Exec=/usr/libexec/naia-live-warning.sh
X-KDE-autostart-phase=2
OnlyShowIn=KDE;
EOF

# Desktop shortcut to re-open the welcome dialog
DESKTOP_DIR="/var/home/liveuser/Desktop"
mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_DIR}/Naia-Guide.desktop" <<'DESKEOF'
[Desktop Entry]
Type=Application
Name=Naia Guide
Name[ko]=Naia 사용 가이드
Name[ja]=Naia ガイド
Icon=help-contents
Exec=/usr/libexec/naia-live-warning.sh
Terminal=false
DESKEOF
chmod +x "${DESKTOP_DIR}/Naia-Guide.desktop"
chown -R liveuser:liveuser "${DESKTOP_DIR}" 2>/dev/null || true

# ==============================================================================
# 9. Install Naia Shell Flatpak for live session
#    The bundle was baked into the image by install-naia-shell.sh (BlueBuild).
#    On installed OS, naia-flatpak-install.service handles this on first boot.
# ==============================================================================

NAIA_BUNDLE="/usr/share/naia/naia-shell.flatpak"

if [ -f "${NAIA_BUNDLE}" ]; then
    echo "[naia] Installing Naia Shell Flatpak for live session..."
    # GNOME Platform runtime (Naia Shell dependency)
    flatpak install --system --noninteractive flathub org.gnome.Platform//49 || true
    # Install from local bundle
    flatpak install --system --noninteractive --bundle "${NAIA_BUNDLE}" || true
    echo "[naia] Naia Shell Flatpak installed."
else
    echo "[naia] WARNING: Naia Shell Flatpak bundle not found at ${NAIA_BUNDLE}"
fi

# ==============================================================================
# 10. Live session — DNS fallback
#    Some networks don't push DNS via DHCP; ensure a fallback is present.
# ==============================================================================

mkdir -p /etc/NetworkManager/conf.d

# Method 1: NetworkManager global DNS override
cat > /etc/NetworkManager/conf.d/99-naia-dns.conf <<'EOF'
[global-dns]
searches=

[global-dns-domain-*]
servers=8.8.8.8,1.1.1.1
EOF

# Method 2: Direct resolv.conf fallback (in case NM doesn't apply global-dns)
cat > /etc/NetworkManager/dispatcher.d/99-naia-dns-fallback <<'DISPATCH'
#!/usr/bin/env bash
# If resolv.conf has no working nameserver, inject Google/Cloudflare DNS
if ! grep -q '^nameserver' /etc/resolv.conf 2>/dev/null || \
   ! timeout 2 getent hosts google.com &>/dev/null; then
    echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" >> /etc/resolv.conf
fi
DISPATCH
chmod +x /etc/NetworkManager/dispatcher.d/99-naia-dns-fallback

# Method 3: Replace resolv.conf (may be a systemd-resolved symlink that breaks DNS)
rm -f /etc/resolv.conf
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > /etc/resolv.conf

# ==============================================================================
# 11. Wi-Fi power save off (Intel iwlwifi bug workaround)
#     Intel 8265 etc. connect but drop all packets with power_save on.
# ==============================================================================

# NM dispatcher: disable power save on every Wi-Fi connect
cat > /etc/NetworkManager/dispatcher.d/99-naia-wifi-powersave <<'DISPATCH'
#!/usr/bin/env bash
if [ "$2" = "up" ] && [ "$(nmcli -t -f DEVICE,TYPE dev | grep "^${DEVICE_IFACE}:wifi$")" ]; then
    iw dev "$DEVICE_IFACE" set power_save off 2>/dev/null || true
fi
DISPATCH
chmod +x /etc/NetworkManager/dispatcher.d/99-naia-wifi-powersave

# Also set via iwlwifi module param (persistent)
mkdir -p /etc/modprobe.d
echo "options iwlwifi power_save=0" > /etc/modprobe.d/naia-iwlwifi.conf

# ==============================================================================
# 12. fcitx5 input method environment variables
#     System defaults to ibus; override to fcitx5 for Korean input.
# ==============================================================================

mkdir -p /etc/environment.d
# Set fcitx5 as default input method — match host Bazzite settings.
# GTK_IM_MODULE and QT_IM_MODULE are set unconditionally (including Wayland)
# because terminals (Konsole, Ptyxis) require them for Korean composition.
cat > /etc/environment.d/input-method.conf <<'EOF'
INPUT_METHOD=fcitx
XMODIFIERS=@im=fcitx
GTK_IM_MODULE=fcitx
QT_IM_MODULE=fcitx
SDL_IM_MODULE=fcitx
GLFW_IM_MODULE=fcitx
EOF


# ==============================================================================
# 13. OpenClaw gateway — ensure gateway.mode=local in config
#     Without this field, the gateway refuses to start (requires explicit mode
#     or --allow-unconfigured flag). Naia's ensure_openclaw_config() handles
#     this at runtime, but for the systemd user service and first-boot, the
#     config must be pre-seeded.
# ==============================================================================

OPENCLAW_DIR="/var/home/liveuser/.openclaw"
OPENCLAW_CFG="${OPENCLAW_DIR}/openclaw.json"
mkdir -p "${OPENCLAW_DIR}"
if [ -f "${OPENCLAW_CFG}" ]; then
    # Patch existing config: add gateway.mode if missing
    python3 -c "
import json, sys
with open('${OPENCLAW_CFG}') as f:
    cfg = json.load(f)
gw = cfg.setdefault('gateway', {})
if 'mode' not in gw:
    gw['mode'] = 'local'
    gw.setdefault('port', 18789)
    gw.setdefault('bind', 'loopback')
    with open('${OPENCLAW_CFG}', 'w') as f:
        json.dump(cfg, f, indent=2)
    print('[naia] Patched gateway.mode=local into openclaw.json')
else:
    print('[naia] gateway.mode already set: ' + gw['mode'])
" 2>/dev/null || true
else
    cat > "${OPENCLAW_CFG}" <<'GWEOF'
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "reload": {
      "mode": "off"
    }
  }
}
GWEOF
    echo "[naia] Created bootstrap openclaw.json with gateway.mode=local"
fi
chown -R liveuser:liveuser "${OPENCLAW_DIR}" 2>/dev/null || true

# ==============================================================================
# 14. Cleanup
# ==============================================================================

rm -rf "${SRC}"
systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
