#!/usr/bin/env bash
# Upload Naia Shell to itch.io using butler
# Usage: bash scripts/itch-upload.sh [--from-release]
#
# Options:
#   --from-release  Download latest assets from GitHub Release first
#   (default)       Use local files in project root

set -euo pipefail

ITCH_USER="nextain"
ITCH_PROJECT="naia"
APPIMAGE="Naia-Shell-x86_64.AppImage"
FLATPAK="Naia-Shell-x86_64.flatpak"

cd "$(dirname "$0")/.."

# Download from GitHub Release if requested
if [[ "${1:-}" == "--from-release" ]]; then
    # Find latest app release (including pre-releases, exclude ISO releases)
    TAG=$(gh release list --limit 20 --json tagName,isDraft --jq '[.[] | select(.tagName | startswith("v")) | select(.isDraft | not)] | .[0].tagName')
    if [[ -z "$TAG" ]]; then
        echo "No app release found"
        exit 1
    fi
    echo "Downloading from release: $TAG"
    gh release download "$TAG" --pattern "$APPIMAGE" --pattern "$FLATPAK" --clobber
fi

# Check butler is installed
if ! command -v butler &>/dev/null; then
    echo "butler not found. Install it:"
    echo "  curl -L -o butler.zip https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default"
    echo "  unzip butler.zip -d ~/.local/bin/"
    echo "  chmod +x ~/.local/bin/butler"
    exit 1
fi

# Upload AppImage (itch.io app auto-install)
if [[ -f "$APPIMAGE" ]]; then
    echo "Uploading $APPIMAGE..."
    butler push "$APPIMAGE" "$ITCH_USER/$ITCH_PROJECT:linux"
else
    echo "Warning: $APPIMAGE not found, skipping"
fi

# Upload Flatpak (manual download)
if [[ -f "$FLATPAK" ]]; then
    echo "Uploading $FLATPAK..."
    butler push "$FLATPAK" "$ITCH_USER/$ITCH_PROJECT:linux-flatpak"
else
    echo "Warning: $FLATPAK not found, skipping"
fi

echo ""
echo "Done! Check: https://$ITCH_USER.itch.io/$ITCH_PROJECT"
butler status "$ITCH_USER/$ITCH_PROJECT"
