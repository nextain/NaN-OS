#!/usr/bin/env bash
set -euo pipefail

FLATPAK_FILE="Naia-Shell-x86_64.flatpak"
APP_ID="io.nextain.naia"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$SCRIPT_DIR"

# ── Check: must run on host, not inside distrobox/toolbox ─────────────────
if [[ -f /run/.containerenv ]] || [[ -f /.dockerenv ]]; then
    echo ""
    echo "  ERROR: 이 스크립트는 호스트에서 실행해야 합니다."
    echo "  Distrobox/Toolbox 컨테이너 안에서는 flatpak install이 동작하지 않습니다."
    echo ""
    echo "  호스트 터미널(Konsole)에서 실행하세요:"
    echo "    bash $0"
    echo ""
    exit 1
fi

# ── Check build output ──────────────────────────────────────────────────────
if [[ ! -d "flatpak-repo" ]]; then
    echo ""
    echo "  flatpak-repo가 없습니다."
    echo ""
    # Check if build is in progress
    if pgrep -f "flatpak-builder" > /dev/null 2>&1; then
        echo "  ⏳ flatpak-builder가 실행 중입니다. 완료될 때까지 기다려주세요."
        echo ""
        echo "  진행 상황 확인:"
        echo "    ps aux | grep flatpak-builder"
        echo ""
    elif [[ -d "build-dir" ]] || [[ -d ".flatpak-builder" ]]; then
        echo "  ⚠️  빌드 흔적(build-dir)은 있지만 flatpak-repo가 없습니다."
        echo "  이전 빌드가 실패했을 수 있습니다. 다시 빌드하세요:"
        echo ""
        echo "    rm -rf flatpak-repo build-dir .flatpak-builder"
        echo "    flatpak-builder --force-clean --disable-rofiles-fuse --repo=flatpak-repo build-dir flatpak/io.nextain.naia.yml"
        echo ""
    else
        echo "  빌드를 먼저 실행하세요:"
        echo ""
        echo "    rm -rf flatpak-repo build-dir .flatpak-builder"
        echo "    flatpak-builder --force-clean --disable-rofiles-fuse --repo=flatpak-repo build-dir flatpak/io.nextain.naia.yml"
        echo ""
    fi
    exit 1
fi

echo "[1/5] Cleaning old MIME handlers..."
rm -f ~/.local/share/applications/naia-os-handler.desktop \
      ~/.local/share/applications/naia-shell-handler.desktop \
      ~/.local/share/applications/naia-shell.desktop 2>/dev/null || true
sed -i '/naia-shell-handler/d; /naia-os-handler/d; /naia-shell\.desktop/d' \
    ~/.local/share/applications/mimeinfo.cache \
    ~/.local/share/applications/mimeapps.list \
    ~/.config/mimeapps.list 2>/dev/null || true
update-desktop-database ~/.local/share/applications/ 2>/dev/null || true

echo "[2/5] Bundling..."
flatpak build-bundle flatpak-repo "$FLATPAK_FILE" "$APP_ID"

echo "[3/5] Uninstalling old version..."
flatpak uninstall --delete-data "$APP_ID" -y 2>/dev/null || true

echo "[4/5] Installing from local bundle..."
flatpak install --user "./$FLATPAK_FILE" -y

echo "[5/5] Setting Flatpak as default naia:// handler..."
xdg-mime default io.nextain.naia.desktop x-scheme-handler/naia 2>/dev/null || true

echo "Running..."
flatpak run "$APP_ID"
