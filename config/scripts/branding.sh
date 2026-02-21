#!/usr/bin/env bash
set -euo pipefail

# Override os-release to identify as Cafelua OS
cat > /usr/lib/os-release <<'OSRELEASE'
NAME="Cafelua OS"
PRETTY_NAME="Cafelua OS (Bazzite)"
ID=Naia-OS
ID_LIKE="fedora"
VERSION_ID="0.1.0"
HOME_URL="https://cafelua.com"
DOCUMENTATION_URL="https://cafelua.com"
SUPPORT_URL="https://cafelua.com"
BUG_REPORT_URL="https://github.com/nextain/Naia-OS/issues"
VARIANT="Cafelua"
VARIANT_ID=cafelua
OSRELEASE
