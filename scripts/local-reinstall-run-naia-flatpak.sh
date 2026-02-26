#!/usr/bin/env bash
set -euo pipefail

FLATPAK_FILE="Naia-Shell-x86_64.flatpak"
APP_ID="io.nextain.naia"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$SCRIPT_DIR"

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

echo "[1/4] Bundling..."
flatpak build-bundle flatpak-repo "$FLATPAK_FILE" "$APP_ID"

echo "[2/4] Uninstalling old version..."
flatpak uninstall --delete-data "$APP_ID" -y 2>/dev/null || true

echo "[3/4] Installing from local bundle..."
flatpak install --user "./$FLATPAK_FILE" -y

echo "[4/4] Running..."
flatpak run "$APP_ID"
