#!/usr/bin/env bash
set -euo pipefail

# test-liveinst-wrapper.sh — Verify the Anaconda pre-install wrapper
# Runs inside a live session (or VM) to validate that the wrapper:
#   1. Exists and is executable
#   2. Correctly stops Naia Shell, OpenClaw Gateway, fcitx5
#   3. Cleans up transient runtime files
#   4. Desktop entry points to the wrapper (not raw liveinst)
#
# Usage: sudo bash os/tests/test-liveinst-wrapper.sh

PASS=0
FAIL=0
WARN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check() {
    local label="$1"
    shift
    if "$@" > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}: $label"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC}: $label"
        ((FAIL++))
    fi
}

warn() {
    local label="$1"
    echo -e "${YELLOW}WARN${NC}: $label"
    ((WARN++))
}

echo -e "${CYAN}=== Naia OS Liveinst Wrapper Test ===${NC}"
echo ""

# --------------------------------------------------------------------------
# 1. Wrapper script exists and is executable
# --------------------------------------------------------------------------
echo -e "${CYAN}--- 1. Wrapper script ---${NC}"
WRAPPER="/usr/libexec/naia-liveinst-wrapper.sh"
check "Wrapper script exists" test -f "$WRAPPER"
check "Wrapper script is executable" test -x "$WRAPPER"
check "Wrapper contains flatpak kill" grep -q "flatpak kill io.nextain.naia" "$WRAPPER"
check "Wrapper contains pkill openclaw" grep -q "pkill.*openclaw" "$WRAPPER"
check "Wrapper contains pkill fcitx5" grep -q "pkill.*fcitx5" "$WRAPPER"
check "Wrapper execs liveinst" grep -q "exec /usr/bin/liveinst" "$WRAPPER"

# --------------------------------------------------------------------------
# 2. Desktop entry redirects to wrapper
# --------------------------------------------------------------------------
echo ""
echo -e "${CYAN}--- 2. Desktop entry ---${NC}"
DESKTOP_FOUND=0
for desktop in \
    /usr/share/applications/org.fedoraproject.AnacondaInstaller.desktop \
    /usr/share/applications/liveinst.desktop; do
    if [ -f "$desktop" ]; then
        DESKTOP_FOUND=1
        if grep -q "naia-liveinst-wrapper" "$desktop"; then
            echo -e "${GREEN}PASS${NC}: $desktop points to wrapper"
            ((PASS++))
        else
            echo -e "${RED}FAIL${NC}: $desktop does NOT point to wrapper"
            echo "       Exec line: $(grep '^Exec=' "$desktop")"
            ((FAIL++))
        fi
    fi
done
if [ "$DESKTOP_FOUND" -eq 0 ]; then
    warn "No Anaconda desktop entry found (anaconda-live may not be installed)"
fi

# --------------------------------------------------------------------------
# 3. Process cleanup simulation
#    Start mock processes, run the wrapper in dry-run mode, verify they stop.
# --------------------------------------------------------------------------
echo ""
echo -e "${CYAN}--- 3. Process cleanup (simulation) ---${NC}"

# Create a temporary wrapper that does cleanup but does NOT exec liveinst
TMPWRAPPER=$(mktemp /tmp/naia-test-wrapper-XXXXXX.sh)
# Copy wrapper but replace the final exec line with exit 0
sed 's|^exec /usr/bin/liveinst.*|echo "[test] Would launch liveinst here"; exit 0|' \
    "$WRAPPER" > "$TMPWRAPPER"
chmod +x "$TMPWRAPPER"

# Start mock processes that simulate what the wrapper should kill
# (Using sleep with recognizable names via bash -c)
bash -c 'exec -a "openclaw gateway run" sleep 60' &
MOCK_GW_PID=$!

bash -c 'exec -a "fcitx5" sleep 60' &
MOCK_FCITX_PID=$!

# Create mock transient files
LIVEUSER_HOME="/var/home/liveuser"
if [ -d "$LIVEUSER_HOME" ] || mkdir -p "$LIVEUSER_HOME/.openclaw" 2>/dev/null; then
    touch "$LIVEUSER_HOME/.openclaw/test.lock" 2>/dev/null || true
    touch "$LIVEUSER_HOME/.openclaw/test.pid" 2>/dev/null || true
    touch "$LIVEUSER_HOME/.openclaw/test.sock" 2>/dev/null || true
    MOCK_FILES_CREATED=1
else
    MOCK_FILES_CREATED=0
    warn "Cannot create mock files in $LIVEUSER_HOME (not running as root or in live session)"
fi

# Run the test wrapper
echo "  Running wrapper (dry-run)..."
"$TMPWRAPPER" 2>/dev/null || true

# Give processes time to die
sleep 2

# Check that mock processes were killed
if kill -0 "$MOCK_GW_PID" 2>/dev/null; then
    echo -e "${RED}FAIL${NC}: Mock gateway process still running (PID $MOCK_GW_PID)"
    kill "$MOCK_GW_PID" 2>/dev/null || true
    ((FAIL++))
else
    echo -e "${GREEN}PASS${NC}: Mock gateway process was killed"
    ((PASS++))
fi

if kill -0 "$MOCK_FCITX_PID" 2>/dev/null; then
    echo -e "${RED}FAIL${NC}: Mock fcitx5 process still running (PID $MOCK_FCITX_PID)"
    kill "$MOCK_FCITX_PID" 2>/dev/null || true
    ((FAIL++))
else
    echo -e "${GREEN}PASS${NC}: Mock fcitx5 process was killed"
    ((PASS++))
fi

# Check transient files were cleaned
if [ "$MOCK_FILES_CREATED" -eq 1 ]; then
    if [ ! -f "$LIVEUSER_HOME/.openclaw/test.lock" ]; then
        echo -e "${GREEN}PASS${NC}: Transient .lock file was cleaned"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC}: Transient .lock file still exists"
        ((FAIL++))
    fi
    if [ ! -f "$LIVEUSER_HOME/.openclaw/test.pid" ]; then
        echo -e "${GREEN}PASS${NC}: Transient .pid file was cleaned"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC}: Transient .pid file still exists"
        ((FAIL++))
    fi
    # Cleanup
    rm -f "$LIVEUSER_HOME/.openclaw/test.sock" 2>/dev/null || true
fi

# Cleanup temp wrapper
rm -f "$TMPWRAPPER"

# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------
echo ""
echo -e "${CYAN}=== Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC} ==="
[ "$FAIL" -eq 0 ] || exit 1
