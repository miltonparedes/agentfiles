#!/usr/bin/env bash
set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH"
  exit 1
fi

if [ -f "bun.lock" ]; then
  bun install
fi
