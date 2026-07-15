#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$REPO_ROOT" ]; then
  echo "✗ Run this script from inside the dentaltrip-ai git repository."
  exit 1
fi

cd "$REPO_ROOT"

pnpm prepare

echo "✓ Installed Husky hooks from .husky/"
echo "✓ Protected branches: main, development"
echo ""
echo "Hooks are versioned in .husky/ and are installed automatically by pnpm install."
echo "If hooks stop working, re-run:"
echo "  pnpm prepare"
