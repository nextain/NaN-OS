#!/usr/bin/env bash
set -euo pipefail

# Download Cafelua Shell AppImage from GitHub Releases and install it.
# This runs during the BlueBuild container image build.

REPO="caretiveai/cafelua-os"
INSTALL_DIR="/usr/bin"
BINARY_NAME="cafelua-shell"

echo "[cafelua] Fetching latest Cafelua Shell release..."

# Get the latest release AppImage download URL (use jq for portability)
DOWNLOAD_URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" \
  | jq -r '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url' \
  | head -1)

if [[ -z "${DOWNLOAD_URL}" ]]; then
  echo "[cafelua] WARNING: No AppImage found in latest release. Skipping install."
  echo "[cafelua] Build the app first: gh workflow run release-app.yml"
  exit 0
fi

echo "[cafelua] Downloading: ${DOWNLOAD_URL}"
curl -L -o "${INSTALL_DIR}/${BINARY_NAME}" "${DOWNLOAD_URL}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

echo "[cafelua] Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
