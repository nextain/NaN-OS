#!/usr/bin/env bash
set -euo pipefail

# Setup OpenClaw for Naia OS
# Installs openclaw as a local npm package in ~/.naia/openclaw/

OPENCLAW_DIR="${HOME}/.naia/openclaw"
OPENCLAW_VERSION="2026.2.15"

echo "[naia] Setting up OpenClaw Gateway..."

# Require Node.js 22+
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ "${NODE_VERSION:-0}" -lt 22 ]; then
    echo "ERROR: Node.js 22+ required (found: $(node -v 2>/dev/null || echo 'none'))" >&2
    exit 1
fi

# Create directory
mkdir -p "${OPENCLAW_DIR}"

# Initialize package.json if missing
if [ ! -f "${OPENCLAW_DIR}/package.json" ]; then
    cat > "${OPENCLAW_DIR}/package.json" <<CONF
{
  "name": "naia-openclaw",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "openclaw": "${OPENCLAW_VERSION}"
  }
}
CONF
fi

# Install
cd "${OPENCLAW_DIR}"
npm install --production

# Verify
if [ -x "${OPENCLAW_DIR}/node_modules/.bin/openclaw" ]; then
    VERSION=$("${OPENCLAW_DIR}/node_modules/.bin/openclaw" --version 2>/dev/null)
    echo "[naia] OpenClaw ${VERSION} installed at ${OPENCLAW_DIR}"
else
    echo "ERROR: OpenClaw installation failed" >&2
    exit 1
fi

# Enable systemd service
if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload
    systemctl --user enable naia-gateway.service
    echo "[naia] Gateway service enabled (start with: systemctl --user start naia-gateway)"
fi

echo "[naia] Setup complete."
