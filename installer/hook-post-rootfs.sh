#!/usr/bin/env bash
# hook-post-rootfs.sh — Titanoboa ISO post-rootfs hook
# Runs inside podman --rootfs (the extracted container image IS /)
# Our repo is NOT mounted — clone it to get assets
set -euo pipefail

REPO_URL="https://github.com/nextain/naia-os.git"
REPO_DIR="/tmp/naia-os-repo"

# ==============================================================================
# 0. Clone repo to access assets
# ==============================================================================

# Bazzite versionlocks NetworkManager (COPR build) and sets repo-level excludes
# via dnf5 config-manager (repos.override.d). Clear both so anaconda-live can install.
dnf -qy versionlock clear 2>/dev/null || true
rm -f /etc/dnf/repos.override.d/99-config_manager.repo 2>/dev/null || true

dnf install -y --allowerasing \
    git anaconda-live libblockdev-btrfs libblockdev-lvm libblockdev-dm

git clone --depth 1 --quiet "${REPO_URL}" "${REPO_DIR}"

# Branding assets
cp "${REPO_DIR}/assets/installer/sidebar-logo.png" /usr/share/anaconda/pixmaps/
cp "${REPO_DIR}/assets/installer/sidebar-bg.png" /usr/share/anaconda/pixmaps/
cp "${REPO_DIR}/assets/installer/topbar-bg.png" /usr/share/anaconda/pixmaps/
cp "${REPO_DIR}/assets/installer/anaconda_header.png" /usr/share/anaconda/pixmaps/
cp "${REPO_DIR}/assets/installer/fedora.css" /usr/share/anaconda/pixmaps/

# "Install to Hard Drive" icon
cp "${REPO_DIR}/assets/installer/anaconda-installer.svg" \
   /usr/share/icons/hicolor/scalable/apps/org.fedoraproject.AnacondaInstaller.svg

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
# 3. Live session — KDE taskbar pin (Naia app)
# ==============================================================================

mkdir -p /etc/skel/.config
cat > /etc/skel/.config/plasma-org.kde.plasma.desktop-appletsrc <<'EOF'
[Containments][2][Applets][3][Configuration][General]
launchers=applications:naia-shell.desktop,preferred://filemanager,preferred://browser
EOF

# ==============================================================================
# 4. Live session — Korean input (fcitx5) default for ko_KR locale
#    Bazzite already ships fcitx5 + fcitx5-hangul + fcitx5-wayland-launcher.
#    We only need to pre-configure the default profile.
# ==============================================================================

# fcitx5 profile (hangul as default IM)
mkdir -p /etc/skel/.config/fcitx5
cat > /etc/skel/.config/fcitx5/profile <<'EOF'
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

# KDE Wayland virtual keyboard → fcitx5
cat >> /etc/skel/.config/kwinrc <<'EOF'
[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
EOF

# fcitx5 autostart for live session
mkdir -p /etc/skel/.config/autostart
cp /usr/etc/xdg/autostart/naia-fcitx5-setup.desktop /etc/skel/.config/autostart/ 2>/dev/null || true

# ==============================================================================
# 5. Live session — wallpaper
# ==============================================================================

cp "${REPO_DIR}/assets/installer/live-wallpaper.jpg" /usr/share/wallpapers/naia-live.jpg
ln -sf /usr/share/wallpapers/naia-live.jpg /usr/share/backgrounds/default.jpg

# ==============================================================================
# 6. Live session — warning notification (data is ephemeral)
# ==============================================================================

mkdir -p /etc/skel/.config/autostart
cat > /etc/skel/.config/autostart/naia-live-warning.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Naia Live Session Warning
Exec=kdialog --msgbox "라이브 세션입니다.\n재부팅하면 모든 변경사항이 사라집니다.\n바탕화면의 'Install to Hard Drive'로 설치할 수 있습니다." --title "Naia OS 라이브"
X-KDE-autostart-phase=2
OnlyShowIn=KDE;
EOF

# ==============================================================================
# 7. Cleanup
# ==============================================================================

rm -rf "${REPO_DIR}"
systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
