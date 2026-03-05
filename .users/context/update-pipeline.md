# OS Update Pipeline

## How Updates Work

Naia OS is built on [Bazzite](https://github.com/ublue-os/bazzite) (Fedora Atomic). Your system receives updates through **atomic container image deployments**, not traditional package upgrades.

### Update Flow

```
Bazzite publishes new base image
  ↓ (every Wednesday, automatic rebuild)
Naia container rebuilt on top of Bazzite (BlueBuild)
  ↓
Container smoke test (verify packages, branding, Naia Shell)
  ↓ pass
Push to GHCR (ghcr.io/nextain/naia-os:latest)
  ↓                              ↓
ISO rebuilt + uploaded to R2     Installed systems: bootc update
```

### What We Customize (Our Overlay)

| Category | What | Risk to Boot |
|----------|------|-------------|
| Packages | fcitx5 (Korean input), fonts, jq, sqlite, podman | None — standard Fedora packages |
| Naia Shell | Flatpak app (sandboxed, independent update) | None — runs in Flatpak sandbox |
| Branding | os-release, wallpaper, login screen, Plymouth theme | None — cosmetic only |
| KDE Config | Taskbar pins, kickoff icon, wallpaper setting | None — user-session scope |
| Autostart | Naia Shell XDG autostart entry | None — app launch only |

**We never touch:** kernel, initrd, bootloader, systemd core, SELinux policy, ostree/bootc internals.

## Safety Guarantees

### Atomic Updates
New images deploy alongside the current one. The switch happens at reboot. If deployment fails, the old image remains untouched.

### Automatic Rollback
Every update keeps the previous deployment. If the new image fails to boot:
1. Reboot the machine
2. In GRUB menu, select the previous entry
3. System boots with the last known-good image

### Container Smoke Test
Every build runs automated checks before deployment:
- Required packages installed (fcitx5, fonts)
- Branding applied (os-release says "Naia")
- Naia Shell bundle present
- KDE Plasma scripts in place
- Autostart entry exists

If any check fails, the build is marked as failed and no ISO is generated.

### ISO Rollback
Before uploading a new ISO to the download server (R2), the previous version is backed up to `previous/`. If a bad ISO is published, it can be rolled back immediately.

## Testing Tiers

| Tier | What | Automated | When |
|------|------|-----------|------|
| 1. Container Smoke | Package/branding/file verification | Yes (CI) | Every build |
| 2. ISO Boot | QEMU boot test | Semi-auto | Major changes |
| 3. Manual Verify | VNC install + feature check | Manual | Fedora version bumps |
| 4. Update Path | bootc upgrade + reboot on real VM | Manual | Before enabling auto-update |

## Known Risks

### Bazzite Breaking Change (Medium)
If Bazzite pushes a broken base image, our weekly rebuild will pick it up. Container smoke test catches package/config issues, but subtle runtime breakages may pass through. ostree rollback provides recovery.

### .origin File Format Change (High, ISO-only)
The ISO installer uses `sed` to set the container image reference in ostree's `.origin` file. If bootc changes the format, installation may fail. This only affects new installations, not updates to existing systems.

### KDE Config Conflict (Low)
If Bazzite changes KDE defaults, our Plasma update scripts may conflict. Our scripts use `naia-*` prefix and run in user-session scope, minimizing collision risk.

### Plymouth Theme Revert (Low)
Plymouth boot theme may revert to Bazzite after updates (requires initrd regeneration). Visual-only issue — does not affect boot functionality.

## For Users

### How to Update
On an installed Naia OS system:
```bash
# Check for updates
sudo bootc upgrade --check

# Apply update (takes effect on next reboot)
sudo bootc upgrade
```

### How to Rollback
If an update causes issues:
1. Reboot your machine
2. In the GRUB boot menu, select the previous deployment
3. Your system will boot with the previous working version

### Checking Current Version
```bash
# See OS version
cat /etc/os-release | grep PRETTY_NAME

# See container image info
cat /usr/share/ublue-os/image-info.json
```
