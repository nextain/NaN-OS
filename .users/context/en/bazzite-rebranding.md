# Bazzite OS Rebranding Guide

Complete guide for replacing all Bazzite/Fedora branding when building a custom OS on top of Bazzite via BlueBuild.

## Layers to Replace

### 1. GRUB Bootloader
- **When**: Power on → GRUB menu
- **File**: `/usr/share/backgrounds/naia-os/grub-background.jpg`
- **Config**: `/usr/etc/default/grub` → `GRUB_BACKGROUND`
- **Script**: `config/scripts/branding.sh`

### 2. Plymouth Boot Splash ⚠️ Critical
- **When**: After GRUB, before login screen
- **Files**: `naia.plymouth`, `naia.script`, `naia-splash.png` (300×300 RGBA)
- **Path**: `/usr/share/plymouth/themes/naia/`
- **⚠️ Must** run `dracut -f --regenerate-all` after setting theme. Without initrd rebuild, Bazzite "B" logo persists.

### 3. SDDM Login Screen
- **When**: Login prompt
- **File**: `/usr/share/backgrounds/naia-os/login-background.jpg`
- **Config**: `theme.conf.user` in active SDDM theme dir

### 4. KDE Kickoff (Start Menu) ⚠️ Critical
- **When**: Bottom-left taskbar button
- **Bazzite default**: `icon=bazzite` (set by look-and-feel)
- **Override**: Plasma update script — simply providing `start-here.png` is NOT enough
- **Path**: `/usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/`

### 5. App Launcher Icon (start-here)
- **Files**: `start-here.png` (16–256px) + `start-here.svg`
- **Path**: `/usr/share/icons/hicolor/{size}/places/`

### 6. System Pixmaps ⚠️ Critical
- **Files**: `naia-os-logo.png` (256×256), `naia-os-logo-small.png` (48×48)
- **Must symlink**: `bazzite.png` → `naia-os-logo.png` (KDE Kickoff references this directly)

### 7. Bazzite Icon Files (hicolor)
- KDE looks up `/apps/bazzite.png` before `/places/start-here.png`
- Fix: Symlink `bazzite.png` → `start-here.png` in each hicolor size

### 8. Anaconda Installer
- SVG only is NOT enough — KDE prefers PNG. Render via `rsvg-convert`

### 9. os-release
- **File**: `/usr/lib/os-release`
- **Fields**: NAME, PRETTY_NAME, ID, VARIANT, HOME_URL, BUG_REPORT_URL

### 10. Desktop Wallpapers
- Path: `/usr/share/wallpapers/NaiaOS/` with `metadata.json`

## Not Customizable

| Item | Reason |
|------|--------|
| UEFI/BIOS manufacturer logo | Hardware firmware |
| Secure Boot shim logo | Requires Fedora/Red Hat signing |

## Checklist

- [ ] os-release updated
- [ ] System pixmaps + bazzite.png symlinked
- [ ] start-here icons (all sizes)
- [ ] hicolor/apps/bazzite.png → start-here symlinked
- [ ] Kickoff icon overridden via Plasma script
- [ ] Plymouth theme + dracut rebuild
- [ ] SDDM background
- [ ] GRUB background
- [ ] Anaconda assets (SVG+PNG)
- [ ] Wallpapers + metadata.json
- [ ] gtk-update-icon-cache
- [ ] sidebar-logo.png synced
