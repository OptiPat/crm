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

echo ">> ESLint (regles hooks)"
npx eslint "src/**/*.{ts,tsx}" --quiet

echo ">> Tests frontend (Vitest)"
npm run test

echo ">> Audit npm (CVE advisory, high+)"
# Pas de npm audit fix automatique (risque supply chain).
npm audit --audit-level=high

if [[ "$QUICK" -eq 0 ]]; then
  echo ">> Tests backend (Cargo)"
  cargo test --manifest-path src-tauri/Cargo.toml

  echo ">> Tests portail espace client (Cargo)"
  cargo test --manifest-path espace-portail/Cargo.toml

  echo ">> Audit Rust portail (cargo audit)"
  (cd espace-portail && cargo audit)

  echo ">> Audit Rust CRM (cargo audit)"
  (cd src-tauri && cargo audit)
fi

if [[ "$BUILD" -eq 1 ]]; then
  echo ">> Build frontend"
  npm run build
fi

echo ""
echo "=== Tout est vert ==="
