#!/usr/bin/env bash
# scripts/replit-overrides.sh
#
# Applies Replit-specific settings that differ from the Railway/production branch.
# Called automatically by:
#   1. scripts/post-merge.sh   — after Replit task-agent merges ([postMerge] in .replit)
#   2. .git/hooks/post-merge   — after any `git pull` / `git merge` in this workspace
#
# Safe to run multiple times (idempotent).
# NOT meant to be pushed anywhere — it lives in the repo as documentation of
# what Replit needs, but the actual enforcement happens via the hooks above.
#
# ── What Railway changes vs what Replit needs ────────────────────────────────
# Railway sets  packageManager = "pnpm@9.15.9"  (matches their build container)
# Replit ships  pnpm 10.x in its Nix store — 9.x triggers a self-install loop
# that crashes with SIGABRT (uv_thread_create failure), breaking all workflows.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO_ROOT/package.json"

# ── 1. Fix packageManager to match the pnpm actually installed in this env ──

INSTALLED_PNPM="$(pnpm --version 2>/dev/null || echo '')"

if [[ -z "$INSTALLED_PNPM" ]]; then
  echo "[replit-overrides] WARNING: pnpm not found in PATH — skipping packageManager patch"
else
  REQUIRED="pnpm@${INSTALLED_PNPM}"
  CURRENT="$(node -e "process.stdout.write(require('$PKG').packageManager || '')" 2>/dev/null || echo '')"

  if [[ "$CURRENT" != "$REQUIRED" ]]; then
    echo "[replit-overrides] Patching packageManager: '$CURRENT' → '$REQUIRED'"
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
      pkg.packageManager = '$REQUIRED';
      fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
    "
  else
    echo "[replit-overrides] packageManager already correct ($REQUIRED) — no patch needed"
  fi
fi

# ── 2. Placeholder for future Railway→Replit divergences ─────────────────────
# Add additional patches here as new differences are discovered.
# Pattern: check current value, only write if it differs (idempotent).
#
# Example (if PORT handling ever diverges):
#   if grep -q 'PORT=3000' some-config.env 2>/dev/null; then
#     sed -i 's/PORT=3000/PORT=25280/' some-config.env
#     echo "[replit-overrides] Patched PORT in some-config.env"
#   fi

echo "[replit-overrides] Done."
