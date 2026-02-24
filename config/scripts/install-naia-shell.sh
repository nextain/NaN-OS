#!/usr/bin/env bash
set -euo pipefail

# Download Naia Shell AppImage from GitHub Releases and install it.
# This runs during the BlueBuild container image build.

REPO="nextain/naia-os"
INSTALL_DIR="/usr/bin"
BINARY_NAME="naia-shell"

echo "[naia] Fetching latest Naia Shell release..."

# Get the latest release AppImage download URL (use jq for portability)
# Use -f to fail on HTTP errors; pass GITHUB_TOKEN if available for rate limits
CURL_AUTH=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  CURL_AUTH=(-H "Authorization: token ${GITHUB_TOKEN}")
fi

DOWNLOAD_URL=$(curl -sfL "${CURL_AUTH[@]+"${CURL_AUTH[@]}"}" \
  "https://api.github.com/repos/${REPO}/releases/latest" \
  | jq -r '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url' \
  | head -1)

if [[ -z "${DOWNLOAD_URL}" ]]; then
  echo "[naia] ERROR: No AppImage found in latest release."
  echo "[naia] Build the app first: gh workflow run release-app.yml"
  exit 1
fi

echo "[naia] Downloading: ${DOWNLOAD_URL}"
TMP_FILE=$(mktemp)
curl -fL -o "${TMP_FILE}" "${CURL_AUTH[@]+"${CURL_AUTH[@]}"}" "${DOWNLOAD_URL}"
mv "${TMP_FILE}" "${INSTALL_DIR}/${BINARY_NAME}-bin"
chmod 755 "${INSTALL_DIR}/${BINARY_NAME}-bin"

# Create wrapper script with EGL/GPU fallback
cat > "${INSTALL_DIR}/${BINARY_NAME}" <<'WRAPPER'
#!/usr/bin/env bash
# Naia Shell launcher with GPU fallback
# WebKitGTK may fail EGL init on some hardware (live USB, VMs, etc.)
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec /usr/bin/naia-shell-bin "$@"
WRAPPER
chmod 755 "${INSTALL_DIR}/${BINARY_NAME}"

echo "[naia] Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
