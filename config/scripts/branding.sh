#!/usr/bin/env bash
set -euo pipefail

# Override os-release to identify as Naia OS
cat > /usr/lib/os-release <<'OSRELEASE'
NAME="Naia OS"
PRETTY_NAME="Naia OS (Bazzite)"
ID=Naia-OS
ID_LIKE="fedora"
VERSION_ID="0.1.0"
HOME_URL="https://naia.com"
DOCUMENTATION_URL="https://naia.com"
SUPPORT_URL="https://naia.com"
BUG_REPORT_URL="https://github.com/nextain/Naia-OS/issues"
VARIANT="Naia"
VARIANT_ID=naia
OSRELEASE
