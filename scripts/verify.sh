#!/usr/bin/env bash
# Verification Patrimoine CRM — pour les agents Cursor (pas l'utilisateur).
# Sans commit / push.
#
# Usage:
#   ./scripts/verify.sh           TypeScript + Vitest + Cargo
#   ./scripts/verify.sh --quick   Sans tests Rust
#   ./scripts/verify.sh --build   + npm run build
#   ./scripts/verify.sh --icons   + check Lucide

set -euo pipefail
cd "$(dirname "$0")/.."

QUICK=0
BUILD=0
ICONS=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --build) BUILD=1 ;;
    --icons) ICONS=1 ;;
    -h|--help)
      echo "Usage: $0 [--quick] [--build] [--icons]"
      exit 0
      ;;
  esac
done

echo "=== Patrimoine CRM - verification ==="

if [[ ! -d node_modules ]]; then
  echo ">> npm install"
  npm install
fi

if [[ "$ICONS" -eq 1 ]]; then
  echo ">> Icones Lucide"
  npm run check:icons
fi

echo ">> TypeScript (tsc --noEmit)"
npx tsc --noEmit

echo ">> Tests frontend (Vitest)"
npm run test

if [[ "$QUICK" -eq 0 ]]; then
  echo ">> Tests backend (Cargo)"
  cargo test --manifest-path src-tauri/Cargo.toml
fi

if [[ "$BUILD" -eq 1 ]]; then
  echo ">> Build frontend"
  npm run build
fi

echo ""
echo "=== Tout est vert ==="
