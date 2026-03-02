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

# 3. Clean up transient runtime files
LIVEUSER_HOME="/var/home/liveuser"
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.lock 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.pid 2>/dev/null || true
rm -rf "${LIVEUSER_HOME}/.openclaw/"*.sock 2>/dev/null || true

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
# 3b. Patch Anaconda's InstallFromImageTask to handle ostree symlink conflicts
#     Problem: The source image uses ostree-style symlinks (e.g. /home -> var/home)
#     but Anaconda creates BTRFS subvolumes and mounts /home as a real directory.
#     rsync cannot replace a mounted directory with a symlink, causing exit code 23
#     ("Device or resource busy").
#     Fix: After rsync, unmount conflicting paths, replace dirs with symlinks,
#     then remount. This is done by patching installation.py in-place.
# ==============================================================================

INSTALL_PY="$(python3 -c 'import pyanaconda.modules.payloads.payload.live_image.installation as m; print(m.__file__)')"

if [ -f "$INSTALL_PY" ]; then
    cp "$INSTALL_PY" "${INSTALL_PY}.orig"

    cat > /tmp/naia-patch-installation.py <<'PATCHEOF'
import sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

# ---------------------------------------------------------------------------
# Patch 1: Replace the rsync invocation block to tolerate exit code 23.
#
# execReadlines() defaults to raise_on_nozero=True, so rsync exit 23
# ("some files/attrs were not transferred") raises OSError before
# _fixup_ostree_symlinks() can run.
#
# Fix: call execReadlines with raise_on_nozero=False, then inspect the
# return code ourselves. Exit 23 is expected on ostree images (mounted
# subvolume prevents symlink replacement) — we handle it in fixup.
# Any other non-zero exit code still raises PayloadInstallationError.
# ---------------------------------------------------------------------------

old_rsync_block = '''        try:
            self.report_progress(_("Installing software..."))
            for line in execReadlines(cmd, args):
                self._parse_rsync_update(line)

        except (OSError, RuntimeError) as e:
            msg = "Failed to install image: {}".format(e)
            raise PayloadInstallationError(msg) from None

        if os.path.exists(os.path.join(self._mount_point, "boot/efi")):'''

new_rsync_block = '''        try:
            self.report_progress(_("Installing software..."))
            reader = execReadlines(cmd, args, raise_on_nozero=False)
            for line in reader:
                self._parse_rsync_update(line)

            rc = reader.rc
            if rc not in (0, 23):
                # Any exit code other than 0 (success) or 23 (partial
                # transfer — expected for ostree symlink conflicts) is fatal.
                msg = "Failed to install image: process %s exited with status %s" % (args, rc)
                raise PayloadInstallationError(msg)

            if rc == 23:
                log.warning(
                    "rsync exited with code 23 (partial transfer). "
                    "This is expected on ostree images where mounted "
                    "subvolumes prevent symlink replacement."
                )

        except (OSError, RuntimeError) as e:
            msg = "Failed to install image: {}".format(e)
            raise PayloadInstallationError(msg) from None

        # Fix ostree-style root symlinks that conflict with mounted subvolumes.
        # The source image may have /home -> var/home (symlink), but the target
        # has /home as a mounted BTRFS subvolume. rsync cannot replace a mounted
        # directory with a symlink, so we fix them up after rsync completes.
        self._fixup_ostree_symlinks()

        if os.path.exists(os.path.join(self._mount_point, "boot/efi")):'''

if old_rsync_block in content:
    content = content.replace(old_rsync_block, new_rsync_block)
else:
    print("WARNING: Could not find rsync block to patch", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Patch 2: Add _fixup_ostree_symlinks method before _parse_rsync_update.
# ---------------------------------------------------------------------------

old_parse = '''    def _parse_rsync_update(self, line):'''

new_method = '''    def _fixup_ostree_symlinks(self):
        """Fix ostree-style symlinks that rsync could not create.

        On ostree/bootc-based images, several top-level directories are symlinks
        into /var (e.g. /home -> var/home). When Anaconda sets up BTRFS with a
        /home subvolume, that path becomes a mounted directory. rsync with -l
        copies symlinks as symlinks, but cannot replace a mounted directory with
        a symlink (EBUSY). This method detects such conflicts and resolves them
        by unmounting, removing the directory, and creating the correct symlink.
        """
        import subprocess

        fixed = 0
        for entry in os.listdir(self._mount_point):
            src_path = os.path.join(self._mount_point, entry)
            dst_path = os.path.join(self._sysroot, entry)

            if not os.path.islink(src_path):
                continue

            link_target = os.readlink(src_path)

            # Only fix if destination is a directory (not already a symlink)
            if os.path.islink(dst_path):
                continue
            if not os.path.isdir(dst_path):
                continue

            log.info("Fixing ostree symlink conflict: %s -> %s", entry, link_target)

            # Unmount if it is a mount point
            ret = subprocess.run(["mountpoint", "-q", dst_path], capture_output=True)
            if ret.returncode == 0:
                log.info("Unmounting %s before replacing with symlink", dst_path)
                subprocess.run(["umount", "-l", dst_path], check=False, capture_output=True)

            # Remove the directory (should be empty after unmount)
            try:
                os.rmdir(dst_path)
            except OSError:
                import shutil
                shutil.rmtree(dst_path, ignore_errors=True)

            # Create the symlink
            os.symlink(link_target, dst_path)
            log.info("Created symlink: %s -> %s", dst_path, link_target)
            fixed += 1

        if fixed:
            log.info("Fixed %d ostree symlink conflict(s)", fixed)

    def _parse_rsync_update(self, line):'''

if old_parse in content:
    content = content.replace(old_parse, new_method, 1)
else:
    print("WARNING: Could not find _parse_rsync_update to insert method", file=sys.stderr)
    sys.exit(1)

with open(filepath, 'w') as f:
    f.write(content)

print("Successfully patched", filepath)
PATCHEOF

    python3 /tmp/naia-patch-installation.py "$INSTALL_PY"
    rm -f /tmp/naia-patch-installation.py
fi

# ==============================================================================
# 3c. Patch gen_grub_cfgstub to handle ostree/bootc live image installs
#     Problem: On ostree-based images (Bazzite, Silverblue), /boot/grub2 and
#     /boot/efi/EFI/{dir} don't exist after rsync because these directories
#     live on separate partitions not part of the rootfs. gen_grub_cfgstub
#     expects them to exist for grub2-probe and grub2-mkrelpath.
#     Additionally, EFI binaries (shimx64.efi, grubx64.efi) are not copied
#     to the EFI System Partition — they only exist under /usr/lib/efi/.
#     Fix: Patch the script to create directories and copy EFI binaries.
#     See also: docs/2026-03-03-gen-grub-cfgstub-bootloader-fix.md
# ==============================================================================

GEN_GRUB="/usr/bin/gen_grub_cfgstub"
if [ -f "$GEN_GRUB" ]; then
    cp "$GEN_GRUB" "${GEN_GRUB}.orig"
    cat > "$GEN_GRUB" <<'GRUBSTUB'
#!/usr/bin/sh
set -eu

if [ $# -ne 2 ]
  then
    echo "Missing argument"
    echo "Usage: script.sh GRUB_HOME EFI_HOME"
    exit 1
fi

GRUB_HOME=$1
EFI_HOME=$2

# --- [naia] Ensure directories exist (ostree/bootc images lack /boot/grub2) ---
mkdir -p "${GRUB_HOME}"
mkdir -p "${EFI_HOME}"

# --- [naia] Copy EFI binaries from ostree locations if missing ---
# On ostree/bootc images, EFI binaries are stored under /usr/lib/efi/
# but never installed to the EFI System Partition by the live image installer.
if [ ! -f "${EFI_HOME}/shimx64.efi" ]; then
    shim=$(find /usr/lib/efi/shim -name "shimx64.efi" 2>/dev/null | head -1)
    if [ -n "$shim" ]; then
        cp "$shim" "${EFI_HOME}/shimx64.efi"
        echo "[naia] Copied shimx64.efi to ${EFI_HOME}"
    fi
fi
if [ ! -f "${EFI_HOME}/grubx64.efi" ]; then
    grub=$(find /usr/lib/efi/grub2 -name "grubx64.efi" 2>/dev/null | head -1)
    if [ -n "$grub" ]; then
        cp "$grub" "${EFI_HOME}/grubx64.efi"
        echo "[naia] Copied grubx64.efi to ${EFI_HOME}"
    fi
fi
# EFI fallback boot entry (UEFI spec: \EFI\BOOT\BOOTX64.EFI)
BOOT_DIR="$(dirname "${EFI_HOME}")/BOOT"
if [ ! -f "${BOOT_DIR}/BOOTX64.EFI" ]; then
    mkdir -p "${BOOT_DIR}"
    fallback=$(find /usr/lib/efi/shim -name "BOOTX64.EFI" 2>/dev/null | head -1)
    if [ -n "$fallback" ]; then
        cp "$fallback" "${BOOT_DIR}/BOOTX64.EFI"
        echo "[naia] Copied BOOTX64.EFI to ${BOOT_DIR}"
    fi
fi

# --- Original gen_grub_cfgstub logic ---
# create a stub grub2 config in EFI
BOOT_UUID=$(grub2-probe --target=fs_uuid "${GRUB_HOME}")
GRUB_DIR=$(grub2-mkrelpath "${GRUB_HOME}")

echo "Generating grub stub config for drive " "${BOOT_UUID}"
echo "GRUB_DIR=" "${GRUB_DIR}"
echo "EFI_HOME=" "${EFI_HOME}"

cat << EOF > "${EFI_HOME}"/grub.cfg.stb
search --no-floppy --root-dev-only --fs-uuid --set=dev ${BOOT_UUID}
set prefix=(\$dev)${GRUB_DIR}
export \$prefix
configfile \$prefix/grub.cfg
EOF

mv ${EFI_HOME}/grub.cfg.stb ${EFI_HOME}/grub.cfg
GRUBSTUB
    chmod +x "$GEN_GRUB"
    echo "[naia] Patched gen_grub_cfgstub with directory creation and EFI binary copy"
fi

# ==============================================================================
# 3d. Patch efi.py to handle grub2-mkconfig failure on ostree live installs
#     Problem: After gen_grub_cfgstub succeeds, GRUB2.write_config() runs
#     grub2-mkconfig which fails because grub2-probe cannot find /sysroot
#     (ostree systems expect /sysroot as real root mount point).
#     Fix 1: Create /sysroot -> / symlink in target before grub2-mkconfig
#     Fix 2: Wrap super().write_config() in try/except as safety net
#     See also: docs/2026-03-03-gen-grub-cfgstub-bootloader-fix.md
# ==============================================================================

EFI_PY=$(python3 -c "import pyanaconda.modules.storage.bootloader.efi as m; print(m.__file__)" 2>/dev/null || true)
if [ -n "$EFI_PY" ] && [ -f "$EFI_PY" ]; then
    python3 << 'EFIPATCH'
import os, sys

efi_py = os.environ.get("EFI_PY_PATH") or sys.argv[1] if len(sys.argv) > 1 else None
if not efi_py:
    import pyanaconda.modules.storage.bootloader.efi as m
    efi_py = m.__file__

with open(efi_py, "r") as f:
    content = f.read()

old = """    def write_config(self):
        rc = util.execWithRedirect(
            "gen_grub_cfgstub",
            [self.config_dir, self.efi_config_dir],
            root=conf.target.system_root,
        )

        if rc != 0:
            raise BootLoaderError("gen_grub_cfgstub script failed")

        super().write_config()"""

new = """    def write_config(self):
        # [naia] Create boot dirs and copy EFI binaries for ostree live installs
        import glob as _glob
        import shutil as _shutil
        _sysroot = conf.target.system_root
        for _d in [self.config_dir, self.efi_config_dir]:
            _fp = os.path.join(_sysroot, _d.lstrip("/"))
            os.makedirs(_fp, exist_ok=True)
            log.info("[naia] Created directory: %s", _fp)
        _efi_dir = os.path.join(_sysroot, self.efi_config_dir.lstrip("/"))
        for _pat, _name in [
            ("usr/lib/efi/shim/*/EFI/fedora/shimx64.efi", "shimx64.efi"),
            ("usr/lib/efi/grub2/*/EFI/fedora/grubx64.efi", "grubx64.efi"),
        ]:
            _dst = os.path.join(_efi_dir, _name)
            if not os.path.exists(_dst):
                for _src in _glob.glob(os.path.join(_sysroot, _pat)):
                    _shutil.copy2(_src, _dst)
                    log.info("[naia] Copied EFI binary: %s -> %s", _src, _dst)
                    break
        _boot_dir = os.path.join(os.path.dirname(_efi_dir), "BOOT")
        os.makedirs(_boot_dir, exist_ok=True)
        _bootx64 = os.path.join(_boot_dir, "BOOTX64.EFI")
        if not os.path.exists(_bootx64):
            for _src in _glob.glob(os.path.join(_sysroot, "usr/lib/efi/shim/*/EFI/BOOT/BOOTX64.EFI")):
                _shutil.copy2(_src, _bootx64)
                log.info("[naia] Copied EFI fallback: %s -> %s", _src, _bootx64)
                break
        # [naia] Create /sysroot symlink for grub2-probe compatibility
        _sysroot_link = os.path.join(_sysroot, "sysroot")
        if not os.path.exists(_sysroot_link):
            try:
                os.symlink("/", _sysroot_link)
                log.info("[naia] Created /sysroot -> / symlink for grub2-probe")
            except OSError as e:
                log.warning("[naia] Could not create /sysroot symlink: %s", e)
        rc = util.execWithRedirect(
            "gen_grub_cfgstub",
            [self.config_dir, self.efi_config_dir],
            root=conf.target.system_root,
        )
        if rc != 0:
            raise BootLoaderError("gen_grub_cfgstub script failed")
        # [naia] Wrap grub2-mkconfig — may fail on ostree due to /sysroot probe
        try:
            super().write_config()
        except BootLoaderError as _e:
            log.warning("[naia] grub2-mkconfig failed (expected on ostree): %s", _e)
            log.warning("[naia] Continuing — kickstart %%post will regenerate grub config")"""

if old in content:
    content = content.replace(old, new)
    with open(efi_py, "w") as f:
        f.write(content)
    import py_compile
    py_compile.compile(efi_py, doraise=True)
    print("[naia] Successfully patched efi.py for ostree bootloader compatibility")
else:
    print("[naia] WARNING: Could not find write_config pattern in efi.py")
    print("[naia]   efi.py may already be patched or have different formatting")
EFIPATCH
else
    echo "[naia] WARNING: efi.py not found (anaconda-live not installed?)"
fi

# ==============================================================================
# 3e. Add kernel-install to Anaconda kickstart %post hook
#     Problem: ostree live image rsync doesn't populate /boot/ with kernel,
#     initramfs, or BLS entries. Anaconda's CreateBLSEntriesTask finds no
#     kernels and skips. After installation, /boot/ is empty → no OS to boot.
#     Fix: Add a script that runs kernel-install during %post.
#     This is embedded in the squashfs and sourced by our kickstart template.
# ==============================================================================

mkdir -p /usr/share/naia-os/installer
cat > /usr/share/naia-os/installer/post-install-kernel.sh <<'KERNELFIX'
#!/bin/bash
# Install kernel + initramfs + BLS entry into /boot/
# Called from kickstart %post (runs in chroot of installed system)
set -euo pipefail

# Find kernel version with vmlinuz (not all module dirs have it)
KVER=""
for k in $(ls /usr/lib/modules/ | sort -rV); do
    if [ -f "/usr/lib/modules/${k}/vmlinuz" ]; then
        KVER="$k"
        break
    fi
done
if [ -z "$KVER" ]; then
    echo "[naia] WARNING: No kernel with vmlinuz found in /usr/lib/modules/"
    ls -la /usr/lib/modules/*/vmlinuz 2>/dev/null || echo "  (no vmlinuz files)"
    exit 0
fi

echo "[naia] Installing kernel ${KVER} into /boot..."

# Try kernel-install first (standard BLS workflow)
if kernel-install add "$KVER" "/usr/lib/modules/${KVER}/vmlinuz" 2>&1; then
    echo "[naia] kernel-install succeeded"
else
    echo "[naia] kernel-install failed, falling back to manual copy..."
    cp "/usr/lib/modules/${KVER}/vmlinuz" "/boot/vmlinuz-${KVER}"
    dracut --force "/boot/initramfs-${KVER}.img" "$KVER" 2>&1

    mkdir -p /boot/loader/entries
    MACHINE_ID=$(cat /etc/machine-id)
    ROOT_UUID=$(findmnt -n -o UUID /)
    cat > "/boot/loader/entries/${MACHINE_ID}-${KVER}.conf" <<BLSEOF
title Naia OS (${KVER})
version ${KVER}
linux /vmlinuz-${KVER}
initrd /initramfs-${KVER}.img
options root=UUID=${ROOT_UUID} rootflags=subvol=root ro
BLSEOF
fi

# Regenerate grub config with new kernel entries
grub2-mkconfig -o /boot/grub2/grub.cfg 2>&1 || true

echo "[naia] Kernel installation complete"
ls -la /boot/vmlinuz-* /boot/initramfs-* 2>/dev/null || true
ls -la /boot/loader/entries/ 2>/dev/null || true
KERNELFIX
chmod +x /usr/share/naia-os/installer/post-install-kernel.sh
echo "[naia] Created post-install kernel script"

# ==============================================================================
# 3f. Disable ostree-only services in the squashfs rootfs
#     Problem: After rsync installs rootfs to disk, greenboot and other ostree
#     services fail on non-ostree systems, causing "degraded" systemd state or
#     even reboot loops (greenboot triggers auto-rollback on failure).
#     Fix: Disable/mask these services in the squashfs so they're disabled after
#     rsync. This is safe: ostree deployments re-enable them via deployment config.
# ==============================================================================

for svc in greenboot-healthcheck greenboot-task-runner greenboot-set-rollback-trigger \
           greenboot-grub2-set-counter greenboot-grub2-set-success \
           greenboot-rpm-ostree-grub2-check-fallback bootloader-update; do
    systemctl disable "${svc}.service" 2>/dev/null || true
    systemctl mask "${svc}.service" 2>/dev/null || true
done
echo "[naia] Disabled ostree-only services (greenboot, bootloader-update)"

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
# Only show in live session (liveuser account)
[ "$(whoami)" = "liveuser" ] || exit 0

kdialog --msgbox "Welcome to Naia OS!\n\nRun 'Install to Hard Drive' on the desktop\nto install to your computer.\n\n[ Live USB Usage ]\n1. Connect to Wi-Fi\n2. Sign in to Google in browser\n3. Launch Naia Shell\n\n[ Input Method ]\nKorean input is configured by default (Ctrl+Space to toggle).\nTo use another language (Japanese, Chinese, etc.),\nchange the locale during installation. It will apply automatically.\n\n* Live session resets on reboot." \
    --title "Naia OS Live"
SCRIPT
chmod +x /usr/libexec/naia-live-warning.sh

# Autostart via system-wide /etc/xdg/autostart/ (script checks for liveuser)
cat > /etc/xdg/autostart/naia-live-warning.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Naia Live Session Warning
Exec=/usr/libexec/naia-live-warning.sh
X-KDE-autostart-phase=2
OnlyShowIn=KDE;
EOF

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
# 13. Cleanup
# ==============================================================================

rm -rf "${SRC}"
systemctl disable rpm-ostree-countme.timer 2>/dev/null || true
dnf clean all
