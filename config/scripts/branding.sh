#!/usr/bin/env bash
set -euo pipefail

# Preserve base OS VERSION_ID for rpm-ostree/dnf compatibility
# (GPG key paths use $releasever which comes from VERSION_ID)
BASE_VERSION_ID=$(grep -oP '(?<=^VERSION_ID=).*' /usr/lib/os-release | tr -d '"')

# Override os-release to identify as Naia OS
cat > /usr/lib/os-release <<OSRELEASE
NAME="Naia OS"
PRETTY_NAME="Naia OS 0.1.1 (Bazzite)"
ID=naia-os
ID_LIKE="fedora"
VERSION_ID="${BASE_VERSION_ID}"
NAIA_VERSION="0.1.1"
HOME_URL="https://naia.nextain.io"
DOCUMENTATION_URL="https://naia.nextain.io"
SUPPORT_URL="https://naia.nextain.io"
BUG_REPORT_URL="https://github.com/nextain/naia-os/issues"
VARIANT="Naia"
VARIANT_ID=naia
OSRELEASE

# Set fcitx5 as default virtual keyboard for Korean input
# KDE Plasma (Bazzite base) virtual keyboard config
mkdir -p /usr/etc/skel/.config/fcitx5
cat > /usr/etc/skel/.config/fcitx5/profile <<'FCITX'
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

# System pixmaps — symlink Fedora/Bazzite logos to Naia OS
ln -sf naia-os-logo.png /usr/share/pixmaps/fedora-logo.png
ln -sf naia-os-logo.png /usr/share/pixmaps/fedora-logo-sprite.png
ln -sf naia-os-logo.png /usr/share/pixmaps/system-logo-white.png
ln -sf naia-os-logo-small.png /usr/share/pixmaps/fedora-logo-small.png
# Replace Bazzite's own icon so KDE Kickoff won't show the "B" logo
ln -sf naia-os-logo.png /usr/share/pixmaps/bazzite.png

# ============================================================
# KDE Plasma: Replace app launcher (start-here) icon with Naia
# ============================================================
# config/files/ copies start-here.png (all sizes) + start-here.svg
# Also symlink bazzite icon entries so KDE Kickoff doesn't show the "B"
for size in 16x16 22x22 24x24 32x32 48x48 64x64 128x128 256x256; do
    src="/usr/share/icons/hicolor/${size}/places/start-here.png"
    dst="/usr/share/icons/hicolor/${size}/apps/bazzite.png"
    if [ -f "$src" ]; then
        mkdir -p "$(dirname "$dst")"
        ln -sf "$src" "$dst"
    fi
done
# Refresh icon cache so KDE picks up the new start-here icon
gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true

# ============================================================
# KDE Plasma: Override Kickoff icon from bazzite → start-here
# ============================================================
# Bazzite's look-and-feel sets Kickoff icon to "bazzite". Override via Plasma
# update script so it runs once per user session (same mechanism as wallpaper).
mkdir -p /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates
cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-kickoff.js <<'JSEOF'
var allPanels = panels();
for (var i = 0; i < allPanels.length; ++i) {
    var panel = allPanels[i];
    var widgets = panel.widgets();
    for (var j = 0; j < widgets.length; ++j) {
        var widget = widgets[j];
        if (widget.type === "org.kde.plasma.kickoff") {
            widget.currentConfigGroup = ["General"];
            widget.writeConfig("icon", "start-here");
            widget.reloadConfig();
        }
    }
}
JSEOF

# ============================================================
# KDE Plasma: Pin Naia Shell to taskbar
# ============================================================
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
    }
}
JSEOF

# ============================================================
# KDE Plasma: Set NaiaOS as default wallpaper
# ============================================================
cat > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/naia-wallpaper.js <<'JSEOF'
var allDesktops = desktops();
for (var i = 0; i < allDesktops.length; ++i) {
    var d = allDesktops[i];
    d.wallpaperPlugin = "org.kde.image";
    d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    d.writeConfig("Image", "/usr/share/wallpapers/NaiaOS/");
}
JSEOF

# ============================================================
# KDE Plasma: Set Naia lock screen wallpaper
# ============================================================
cat > /usr/etc/skel/.config/kscreenlockerrc <<'LOCKSCREEN'
[Greeter][Wallpaper][org.kde.image][General]
Image=file:///usr/share/backgrounds/naia-os/login-background.jpg
PreviewImage=file:///usr/share/backgrounds/naia-os/login-background.jpg
LOCKSCREEN

# ============================================================
# Plymouth: Set Naia as default boot theme
# ============================================================
# NOTE: dracut -f cannot run in a BlueBuild container build (no real kernel).
# The actual initrd rebuild happens in hook-post-rootfs.sh (Titanoboa phase)
# where a real rootfs with kernel is available. Here we only set the config.
if [ -d /usr/share/plymouth/themes/naia ]; then
    # Set via plymouthd.conf (reliable in container builds where
    # plymouth-set-default-theme may not persist correctly)
    mkdir -p /etc/plymouth
    cat > /etc/plymouth/plymouthd.conf <<PLYCFG
[Daemon]
Theme=naia
ShowDelay=0
PLYCFG
    # Also run the official command as fallback
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
# Wi-Fi: Disable iwlwifi power save (Intel bug workaround)
# ============================================================
mkdir -p /usr/lib/modprobe.d
echo "options iwlwifi power_save=0" > /usr/lib/modprobe.d/naia-iwlwifi.conf
