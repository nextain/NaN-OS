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
    git anaconda-live libblockdev-btrfs libblockdev-lvm libblockdev-dm

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
# 3. Live session — KDE taskbar pins (Plasma update script)
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
# 4. Live session — Kickoff (start menu) favorites
# ==============================================================================

mkdir -p /etc/xdg
cat > /etc/xdg/kicker-extra-favoritesrc <<'EOF'
[General]
Prepend=io.nextain.naia.desktop;com.google.Chrome.desktop;com.discordapp.Discord.desktop;
IgnoreDefaults=false
EOF

# ==============================================================================
# 5. Live session — Korean input (fcitx5)
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
# 6. Live session — wallpaper (Plasma update script)
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
# 7. Live session — warning notification (data is ephemeral)
# ==============================================================================

mkdir -p /etc/xdg/autostart /usr/libexec
cat > /usr/libexec/naia-live-warning.sh <<'SCRIPT'
#!/usr/bin/env bash
case "${LANG:-en_US.UTF-8}" in
    ko*|ko_KR*)
        TITLE="Naia OS 라이브"
        MSG="라이브 세션입니다.\n재부팅하면 모든 변경사항이 사라집니다.\n바탕화면의 'Install to Hard Drive'로 설치할 수 있습니다.\n\n[ Naia 사용법 ]\n1. Wi-Fi 연결\n2. Chrome 설정\n3. Naia Shell 실행"
        ;;
    ja*|ja_JP*)
        TITLE="Naia OS ライブ"
        MSG="ライブセッションです。\n再起動するとすべての変更が失われます。\nデスクトップの「Install to Hard Drive」からインストールできます。\n\n[ Naiaの使い方 ]\n1. Wi-Fi接続\n2. Chrome設定\n3. Naia Shell起動"
        ;;
    *)
        TITLE="Naia OS Live"
        MSG="This is a live session.\nAll changes will be lost on reboot.\nUse 'Install to Hard Drive' on the desktop to install.\n\n[ Using Naia ]\n1. Connect to Wi-Fi\n2. Set up Chrome\n3. Launch Naia Shell"
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

# ==============================================================================
# 8. Install Naia Shell Flatpak for live session
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
# 9. Live session — DNS fallback
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
# 10. Wi-Fi power save off (Intel iwlwifi bug workaround)
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
# 11. Chrome policy — disable Secure DNS / async DNS (breaks on live session)
# ==============================================================================

mkdir -p /etc/opt/chrome/policies/managed
cat > /etc/opt/chrome/policies/managed/naia-dns.json <<'EOF'
{
  "DnsOverHttpsMode": "off",
  "BuiltInDnsClientEnabled": false
}
EOF

# Flatpak Chrome also reads from /etc/chromium
mkdir -p /etc/chromium/policies/managed
cp /etc/opt/chrome/policies/managed/naia-dns.json /etc/chromium/policies/managed/

# ==============================================================================
# 12. Live session — KWallet disable + Chrome password store fallback
#     KWallet is uninitialized on live session → Chrome hangs waiting for cookie
#     encryption key. Disable KWallet UI and use basic password store.
#     Installed OS is unaffected (PAM auto-initializes KWallet at login).
# ==============================================================================

# Disable KWallet daemon autostart in live session
mkdir -p /etc/xdg/autostart
cat > /etc/xdg/autostart/kwalletd6-disable.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=KWallet Disable (Live Session)
Hidden=true
EOF

# Disable KWallet in KDE settings (live session skel)
mkdir -p /etc/xdg
cat >> /etc/xdg/kwalletrc <<'EOF'
[Wallet]
Enabled=false
First Use=false
EOF

# Chrome: use basic password store (bypass KWallet)
flatpak override --system com.google.Chrome --env=CHROMIUM_FLAGS="--password-store=basic" 2>/dev/null || true

# ==============================================================================
# 13. Live session — fcitx5 input method environment variables
#     System defaults to ibus; override to fcitx5 for Korean input.
# ==============================================================================

mkdir -p /etc/environment.d
# On Wayland, GTK_IM_MODULE and QT_IM_MODULE must NOT be set globally.
# Setting them overrides fcitx5's Wayland-native frontend, breaking Korean
# character composition (moasseugi) in terminals and some apps.
# Only XMODIFIERS is needed (for legacy X11 forwarding compatibility).
# See: https://fcitx-im.org/wiki/Using_Fcitx_5_on_Wayland#KDE_Plasma
cat > /etc/environment.d/input-method.conf <<'EOF'
INPUT_METHOD=fcitx
XMODIFIERS=@im=fcitx
EOF

# Symlink fcitx5.sh into /etc/profile.d/ so login shells source it.
# Bazzite ships it in /usr/etc/profile.d/ which is NOT sourced by /etc/profile.
ln -sf /usr/etc/profile.d/fcitx5.sh /etc/profile.d/fcitx5.sh

# Switch xinputrc alternative from ibus to fcitx5.
# Bazzite defaults to ibus.conf which sets GTK_IM_MODULE=ibus globally.
if [ -f /etc/X11/xinit/xinput.d/fcitx5.conf ]; then
    ln -sf /etc/X11/xinit/xinput.d/fcitx5.conf /etc/alternatives/xinputrc
fi

# Patch kde-ptyxis wrapper: remove hardcoded GTK_IM_MODULE=ibus.
# Bazzite's kde-ptyxis forces `env GTK_IM_MODULE=ibus` which overrides
# fcitx5's Wayland-native frontend and breaks Korean character composition.
if [ -f /usr/bin/kde-ptyxis ] && grep -q 'GTK_IM_MODULE=ibus' /usr/bin/kde-ptyxis; then
    sed -i 's/env GTK_IM_MODULE=ibus //g' /usr/bin/kde-ptyxis
fi

# ==============================================================================
# 14. OpenClaw gateway — ensure gateway.mode=local in config
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
# 15. Cleanup
# ==============================================================================

rm -rf "${SRC}"
systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
