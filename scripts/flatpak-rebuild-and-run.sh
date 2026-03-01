#!/usr/bin/env bash
set -euo pipefail

# rebuild-flatpak.sh — Flatpak 풀 빌드 + 재설치 + 실행 (원스톱)
#
# 호스트에서 실행: distrobox로 빌드 위임 → 번들 → 재설치 → 실행
# distrobox에서 실행: 빌드 → 호스트에서 설치하라고 안내

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="io.nextain.naia"
FLATPAK_FILE="Naia-Shell-x86_64.flatpak"
DISTROBOX_NAME="${NAIA_DISTROBOX:-dev}"

cd "$SCRIPT_DIR"

echo ""
echo "  === Naia OS Flatpak 재빌드 ==="
echo ""

# ── Detect environment ───────────────────────────────────────────────────
IN_CONTAINER=false
if [[ -f /run/.containerenv ]] || [[ -f /.dockerenv ]]; then
    IN_CONTAINER=true
fi

# ── Step 1: Build ────────────────────────────────────────────────────────
echo "[1/4] Cleaning previous build..."
rm -rf flatpak-repo build-dir .flatpak-builder

BUILD_CMD="cd '$SCRIPT_DIR' && flatpak-builder --force-clean --disable-rofiles-fuse --repo=flatpak-repo build-dir flatpak/io.nextain.naia.yml"

if command -v flatpak-builder &>/dev/null; then
    # flatpak-builder가 현재 환경에 있음 (distrobox 또는 호스트)
    echo "[2/4] Building Flatpak (this takes ~15 minutes)..."
    echo ""
    flatpak-builder --force-clean --disable-rofiles-fuse \
        --repo=flatpak-repo build-dir flatpak/io.nextain.naia.yml
elif ! $IN_CONTAINER && command -v distrobox-enter &>/dev/null; then
    # 호스트에서 실행 중 + flatpak-builder 없음 → distrobox로 위임
    echo "[2/4] Building via distrobox ($DISTROBOX_NAME)..."
    echo ""
    distrobox-enter "$DISTROBOX_NAME" -- bash -c "$BUILD_CMD"
else
    echo ""
    echo "  ERROR: flatpak-builder를 찾을 수 없습니다."
    echo ""
    echo "  distrobox에서 실행하세요:"
    echo "    distrobox enter $DISTROBOX_NAME"
    echo "    cd $SCRIPT_DIR && bash scripts/rebuild-flatpak.sh"
    echo ""
    exit 1
fi

echo ""
echo "[3/4] Build complete."

# ── Step 2: Install + Run (host only) ────────────────────────────────────
if $IN_CONTAINER; then
    echo ""
    echo "  Distrobox 안에서는 flatpak install이 불가합니다."
    echo "  호스트 Konsole에서 아래를 실행하세요:"
    echo ""
    echo "    cd $SCRIPT_DIR && bash scripts/reinstall-and-flatpak-run.sh"
    echo ""
    exit 0
fi

echo "[4/4] Installing and running..."

# Clean MIME handlers
rm -f ~/.local/share/applications/naia-os-handler.desktop \
      ~/.local/share/applications/naia-shell-handler.desktop \
      ~/.local/share/applications/naia-shell.desktop 2>/dev/null || true
sed -i '/naia-shell-handler/d; /naia-os-handler/d; /naia-shell\.desktop/d' \
    ~/.local/share/applications/mimeinfo.cache \
    ~/.local/share/applications/mimeapps.list \
    ~/.config/mimeapps.list 2>/dev/null || true
update-desktop-database ~/.local/share/applications/ 2>/dev/null || true

# Bundle
flatpak build-bundle flatpak-repo "$FLATPAK_FILE" "$APP_ID"

# Reinstall
flatpak uninstall --delete-data "$APP_ID" -y 2>/dev/null || true
flatpak install --user "./$FLATPAK_FILE" -y

# Set handler
xdg-mime default io.nextain.naia.desktop x-scheme-handler/naia 2>/dev/null || true

echo ""
echo "  === Build + Install complete ==="
echo ""
exec bash "$(dirname "$0")/flatpak-run.sh"
