#!/usr/bin/env bash
# scripts/assert-railway-packaging.sh
#
# Guard script — verifies that this repo is in a Railway-safe committed state.
# Run this before any `git commit` intended to land on main / trigger a Railway deploy.
#
# Fails with exit code 1 if:
#   • package.json packageManager ≠ "pnpm@9.15.9"
#   • Dockerfile does not contain "corepack prepare pnpm@9.15.9"
#
# Usage:
#   bash scripts/assert-railway-packaging.sh
#
# In CI / Railway pre-deploy hook:
#   bash scripts/assert-railway-packaging.sh || exit 1

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO_ROOT/package.json"
DOCKERFILE="$REPO_ROOT/Dockerfile"

RAILWAY_PNPM="pnpm@9.15.9"
PASS=true

echo "=== assert-railway-packaging ==="

# ── Check 1: package.json packageManager ─────────────────────────────────────
CURRENT_PM="$(node -e "process.stdout.write(require('$PKG').packageManager || '')" 2>/dev/null || echo '')"

if [[ "$CURRENT_PM" == "$RAILWAY_PNPM" ]]; then
  echo "  ✅ package.json packageManager = \"$CURRENT_PM\""
else
  echo "  ❌ package.json packageManager = \"$CURRENT_PM\" (expected \"$RAILWAY_PNPM\")"
  echo "     Fix: git checkout -- package.json"
  echo "     Or:  node -e \"const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.packageManager='$RAILWAY_PNPM';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n')\""
  PASS=false
fi

# ── Check 2: Dockerfile corepack line ────────────────────────────────────────
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "  ❌ Dockerfile not found at $DOCKERFILE"
  PASS=false
elif grep -q "corepack prepare pnpm@9.15.9" "$DOCKERFILE"; then
  echo "  ✅ Dockerfile prepares pnpm@9.15.9 via corepack"
else
  echo "  ❌ Dockerfile does not contain 'corepack prepare pnpm@9.15.9'"
  echo "     Current corepack line(s) in Dockerfile:"
  grep "corepack\|pnpm" "$DOCKERFILE" | sed 's/^/     /' || echo "     (none found)"
  PASS=false
fi

echo "================================"

if [[ "$PASS" == "true" ]]; then
  echo "✅ All checks passed — safe to commit for Railway."
  exit 0
else
  echo "❌ One or more checks failed — DO NOT commit until fixed."
  echo ""
  echo "This repo may have been patched by scripts/replit-overrides.sh for local"
  echo "Replit preview. Restore the Railway-safe state before committing:"
  echo "  git checkout -- package.json"
  exit 1
fi
