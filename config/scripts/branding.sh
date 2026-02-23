#!/usr/bin/env bash
set -euo pipefail

# Preserve base OS VERSION_ID for rpm-ostree/dnf compatibility
# (GPG key paths use $releasever which comes from VERSION_ID)
BASE_VERSION_ID=$(grep -oP '(?<=^VERSION_ID=).*' /usr/lib/os-release | tr -d '"')

# Override os-release to identify as Naia OS
cat > /usr/lib/os-release <<OSRELEASE
NAME="Naia OS"
PRETTY_NAME="Naia OS 0.1.0 (Bazzite)"
ID=naia-os
ID_LIKE="fedora"
VERSION_ID="${BASE_VERSION_ID}"
NAIA_VERSION="0.1.0"
HOME_URL="https://naia.nextain.io"
DOCUMENTATION_URL="https://naia.nextain.io"
SUPPORT_URL="https://naia.nextain.io"
BUG_REPORT_URL="https://github.com/nextain/naia-os/issues"
VARIANT="Naia"
VARIANT_ID=naia
OSRELEASE

# Set fcitx5 as default virtual keyboard for Korean input
# KDE Plasma (Bazzite base) virtual keyboard config
mkdir -p /usr/etc/skel/.config
cat > /usr/etc/skel/.config/fcitx5-profile <<'FCITX'
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
FCITX

# Set fcitx5 as the virtual keyboard in KDE Plasma Wayland
mkdir -p /usr/etc/skel/.config
cat > /usr/etc/skel/.config/kwinrc-naia-ime <<'KWIN'
[Wayland]
InputMethod=/usr/share/applications/org.fcitx.Fcitx5.wayland.desktop
KWIN

# Ensure fcitx5-wayland .desktop file is available for virtual keyboard selection
if [ -f /usr/share/applications/org.fcitx.Fcitx5.wayland.desktop ]; then
    echo "fcitx5-wayland desktop entry found"
else
    # Create desktop entry if package didn't provide one
    cat > /usr/share/applications/org.fcitx.Fcitx5.wayland.desktop <<'DESKTOP'
[Desktop Entry]
Name=Fcitx 5 (Wayland)
Comment=Input Method
Exec=/usr/bin/fcitx5
Icon=org.fcitx.Fcitx5
Type=Application
Categories=System;Utility;
X-KDE-Wayland-VirtualKeyboard=true
DESKTOP
fi

# ============================================================
# Branding: Replace Fedora/Bazzite logos with Naia OS
# ============================================================

# System pixmaps — symlink Fedora logos to Naia OS
ln -sf naia-os-logo.png /usr/share/pixmaps/fedora-logo.png
ln -sf naia-os-logo.png /usr/share/pixmaps/fedora-logo-sprite.png
ln -sf naia-os-logo.png /usr/share/pixmaps/system-logo-white.png
ln -sf naia-os-logo-small.png /usr/share/pixmaps/fedora-logo-small.png

# ============================================================
# KDE Plasma: Replace app launcher (start-here) icon with Naia
# ============================================================
# config/files/ copies start-here.png (all sizes) + start-here.svg
# Refresh icon cache so KDE picks up the new start-here icon
gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true

# ============================================================
# KDE Plasma: Set NaiaOS as default wallpaper
# ============================================================
mkdir -p /usr/etc/skel/.config
cat > /usr/etc/skel/.config/plasma-org.kde.plasma.desktop-appletsrc.naia <<'PLASMA'
[Containments][1][Wallpaper][org.kde.image][General]
Image=/usr/share/wallpapers/NaiaOS/
PLASMA

# ============================================================
# Plymouth: Set Naia as default boot theme
# ============================================================
if [ -d /usr/share/plymouth/themes/naia ]; then
    plymouth-set-default-theme naia 2>/dev/null || \
        ln -sf /usr/share/plymouth/themes/naia/naia.plymouth /usr/share/plymouth/default.plymouth
fi

# ============================================================
# SDDM: Set Naia login background
# ============================================================
SDDM_THEME_DIR=""
# Find active SDDM theme (Bazzite uses breeze or a custom theme)
for d in /usr/share/sddm/themes/01-breeze-fedora /usr/share/sddm/themes/breeze /usr/share/sddm/themes/breezelight; do
    if [ -d "$d" ]; then
        SDDM_THEME_DIR="$d"
        break
    fi
done
if [ -n "$SDDM_THEME_DIR" ] && [ -f /usr/share/backgrounds/naia-os/login-background.jpg ]; then
    # Create theme.conf.user to override background
    cat > "${SDDM_THEME_DIR}/theme.conf.user" <<'SDDMCONF'
[General]
background=/usr/share/backgrounds/naia-os/login-background.jpg
SDDMCONF
fi

# ============================================================
# GRUB: Set Naia boot background
# ============================================================
if [ -f /usr/share/backgrounds/naia-os/grub-background.jpg ]; then
    mkdir -p /usr/etc/default
    # Append GRUB background if not already set
    if [ -f /usr/etc/default/grub ]; then
        if ! grep -q 'GRUB_BACKGROUND' /usr/etc/default/grub; then
            echo 'GRUB_BACKGROUND="/usr/share/backgrounds/naia-os/grub-background.jpg"' >> /usr/etc/default/grub
        fi
    else
        echo 'GRUB_BACKGROUND="/usr/share/backgrounds/naia-os/grub-background.jpg"' > /usr/etc/default/grub
    fi
fi
