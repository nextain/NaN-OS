#!/usr/bin/env bash
set -euo pipefail

# Cafelua OS smoke test - run inside VM or booted image
PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "PASS: $label"
    ((PASS++))
  else
    echo "FAIL: $label"
    ((FAIL++))
  fi
}

echo "=== Cafelua OS Smoke Test ==="

# OS identity
check "os-release says Cafelua OS" grep -q "Cafelua OS" /usr/lib/os-release

# Node.js 22+
check "Node.js 22+" node --version
node_major=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$node_major" -ge 22 ]; then
  echo "PASS: Node.js version >= 22 (v$node_major)"
  ((PASS++))
else
  echo "FAIL: Node.js version >= 22 (got v$node_major)"
  ((FAIL++))
fi

# pnpm
check "pnpm installed" which pnpm

# Podman
check "Podman installed" which podman

# Tauri build deps
check "pkg-config installed" which pkg-config
check "gcc installed" which gcc

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
