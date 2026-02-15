#!/usr/bin/env bash
set -euo pipefail

# Install pnpm globally via corepack (bundled with Node.js)
corepack enable
corepack prepare pnpm@latest --activate
