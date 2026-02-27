#!/usr/bin/env bash
# install-gateway.sh — Install OpenClaw gateway for Naia Shell standalone packages
# Safe to run multiple times (idempotent).
# Usage: bash install-gateway.sh

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
OPENCLAW_DIR="$HOME/.naia/openclaw"
CONFIG_DIR="$HOME/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
WORKSPACE_DIR="$CONFIG_DIR/workspace"
OPENCLAW_BIN="$OPENCLAW_DIR/node_modules/openclaw/openclaw.mjs"
REQUIRED_NODE_MAJOR=22
OPENCLAW_VERSION="2026.2.22-2"
GATEWAY_PORT=18789

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
step()    { echo -e "\n${CYAN}${BOLD}── $* ──${RESET}"; }

die() {
    error "$*"
    exit 1
}

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
step "Step 1/5: Checking Node.js"

NODE_CMD=""

check_node_version() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        return 1
    fi
    local version
    version=$("$cmd" --version 2>/dev/null | sed 's/^v//')
    local major
    major=$(echo "$version" | cut -d. -f1)
    if [[ "$major" -ge "$REQUIRED_NODE_MAJOR" ]]; then
        NODE_CMD="$cmd"
        return 0
    fi
    return 1
}

# Find nvm.sh in common locations
find_nvm() {
    for nvm_path in "$HOME/.nvm/nvm.sh" "$HOME/.config/nvm/nvm.sh" "${NVM_DIR:-}/nvm.sh"; do
        if [[ -s "$nvm_path" ]]; then
            echo "$nvm_path"
            return 0
        fi
    done
    return 1
}

# Try system node first
if check_node_version "node"; then
    success "Found Node.js $(node --version) (system)"
# Try nvm if available
elif NVM_SH=$(find_nvm); then
    info "System Node.js too old ($(node --version 2>/dev/null || echo 'not found')). Trying nvm..."
    # shellcheck source=/dev/null
    source "$NVM_SH"
    if nvm use "$REQUIRED_NODE_MAJOR" &>/dev/null && check_node_version "node"; then
        success "Found Node.js $(node --version) (nvm)"
    else
        info "Installing Node.js $REQUIRED_NODE_MAJOR via nvm..."
        nvm install "$REQUIRED_NODE_MAJOR" || die "Failed to install Node.js $REQUIRED_NODE_MAJOR via nvm"
        nvm use "$REQUIRED_NODE_MAJOR"
        if check_node_version "node"; then
            success "Installed Node.js $(node --version) via nvm"
        else
            die "nvm install succeeded but Node.js $REQUIRED_NODE_MAJOR+ not available"
        fi
    fi
else
    echo ""
    error "Node.js $REQUIRED_NODE_MAJOR+ is required but not found."
    echo ""
    echo -e "  Install Node.js using one of these methods:"
    echo ""
    echo -e "  ${BOLD}Option 1: nvm (recommended)${RESET}"
    echo -e "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    echo -e "    source ~/.bashrc"
    echo -e "    nvm install $REQUIRED_NODE_MAJOR"
    echo -e "    bash $0"
    echo ""
    echo -e "  ${BOLD}Option 2: NodeSource (Debian/Ubuntu)${RESET}"
    echo -e "    curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -"
    echo -e "    sudo apt-get install -y nodejs"
    echo ""
    echo -e "  ${BOLD}Option 3: Fedora/RHEL${RESET}"
    echo -e "    sudo dnf install -y nodejs"
    echo ""
    exit 1
fi

# Verify npm
if ! command -v npm &>/dev/null; then
    die "npm not found. It should come with Node.js. Please reinstall Node.js."
fi
info "npm $(npm --version)"

# ── Step 2: Create installation directory ────────────────────────────────────
step "Step 2/5: Setting up installation directory"

mkdir -p "$OPENCLAW_DIR"
success "Directory: $OPENCLAW_DIR"

# ── Step 3: Create package.json and install ──────────────────────────────────
step "Step 3/5: Installing OpenClaw $OPENCLAW_VERSION"

PACKAGE_JSON="$OPENCLAW_DIR/package.json"

# Always write package.json to ensure correct version
cat > "$PACKAGE_JSON" <<EOF
{
  "name": "naia-openclaw-gateway",
  "version": "1.0.0",
  "private": true,
  "description": "OpenClaw gateway for Naia Shell",
  "dependencies": {
    "openclaw": "$OPENCLAW_VERSION"
  }
}
EOF
info "Created package.json (openclaw@$OPENCLAW_VERSION)"

# Run npm install
info "Running npm install (this may take a minute)..."
(cd "$OPENCLAW_DIR" && npm install --production --no-fund --no-audit 2>&1) | while IFS= read -r line; do
    # Show progress but suppress noise
    if [[ "$line" == *"added"* ]] || [[ "$line" == *"packages"* ]]; then
        info "$line"
    fi
done

# ── Step 4: Verify installation ──────────────────────────────────────────────
step "Step 4/5: Verifying installation"

if [[ ! -f "$OPENCLAW_BIN" ]]; then
    die "OpenClaw not found at $OPENCLAW_BIN. Installation may have failed."
fi

OPENCLAW_VER=$(node "$OPENCLAW_BIN" --version 2>/dev/null || echo "unknown")
success "OpenClaw installed: $OPENCLAW_VER"
success "Binary: $OPENCLAW_BIN"

# ── Step 5: Create config ────────────────────────────────────────────────────
step "Step 5/5: Setting up configuration"

mkdir -p "$CONFIG_DIR"
mkdir -p "$WORKSPACE_DIR"

if [[ -f "$CONFIG_FILE" ]]; then
    warn "Config already exists: $CONFIG_FILE (skipping)"
    info "Delete it and re-run this script to regenerate."
else
    cat > "$CONFIG_FILE" <<'EOF'
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": { "mode": "token" },
    "reload": { "mode": "off" }
  },
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace"
    }
  }
}
EOF
    success "Created config: $CONFIG_FILE"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}============================================${RESET}"
echo -e "${GREEN}${BOLD}  OpenClaw Gateway installed successfully!  ${RESET}"
echo -e "${GREEN}${BOLD}============================================${RESET}"
echo ""
echo -e "  ${BOLD}To start the gateway:${RESET}"
echo ""
echo -e "    ${CYAN}node ~/.naia/openclaw/node_modules/openclaw/openclaw.mjs gateway run --bind loopback --port $GATEWAY_PORT${RESET}"
echo ""
echo -e "  ${BOLD}To verify it's running:${RESET}"
echo ""
echo -e "    ${CYAN}curl -s http://127.0.0.1:$GATEWAY_PORT/__openclaw__/canvas/${RESET}"
echo ""
echo -e "  ${BOLD}Then launch Naia Shell${RESET} — it will connect to the gateway automatically."
echo ""
echo -e "  ${BOLD}Files:${RESET}"
echo -e "    Binary:  $OPENCLAW_BIN"
echo -e "    Config:  $CONFIG_FILE"
echo -e "    Data:    $WORKSPACE_DIR"
echo ""
