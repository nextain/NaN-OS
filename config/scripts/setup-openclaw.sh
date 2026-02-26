#!/usr/bin/env bash
set -euo pipefail

# Install OpenClaw system-wide during BlueBuild container image build.
# Installs to /usr/share/naia/openclaw/ so all users can access it.
# The gateway-wrapper script references this path.

OPENCLAW_DIR="/usr/share/naia/openclaw"
OPENCLAW_VERSION="2026.2.22-2"

echo "[naia] Installing OpenClaw Gateway system-wide..."

# Create directory
mkdir -p "${OPENCLAW_DIR}"

# Initialize package.json
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

# Install
cd "${OPENCLAW_DIR}"
npm install --production

# Verify
if [ -f "${OPENCLAW_DIR}/node_modules/openclaw/openclaw.mjs" ]; then
    VERSION=$(node "${OPENCLAW_DIR}/node_modules/openclaw/openclaw.mjs" --version 2>/dev/null || echo "${OPENCLAW_VERSION}")
    echo "[naia] OpenClaw ${VERSION} installed at ${OPENCLAW_DIR}"
else
    echo "ERROR: OpenClaw installation failed" >&2
    exit 1
fi

echo "[naia] OpenClaw setup complete."
