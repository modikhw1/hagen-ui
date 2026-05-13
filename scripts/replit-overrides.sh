#!/usr/bin/env bash
# scripts/replit-overrides.sh
#
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  LOCAL REPLIT PATCH — NEVER COMMIT THE STATE THIS SCRIPT PRODUCES          ║
# ║                                                                              ║
# ║  This script temporarily changes package.json → packageManager to match     ║
# ║  the pnpm version installed in Replit's Nix store (currently 10.x).         ║
# ║                                                                              ║
# ║  The canonical value in package.json committed to main is pnpm@9.15.9       ║
# ║  (matches Dockerfile: corepack prepare pnpm@9.15.9 --activate).             ║
# ║                                                                              ║
# ║  Before any `git commit` intended for main/Railway:                         ║
# ║    • Run scripts/assert-railway-packaging.sh to verify the state is clean.  ║
# ║    • If it fails, restore with:  git checkout -- package.json               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# Applies Replit-specific settings that differ from the Railway/production branch.
# Called automatically by:
#   1. scripts/post-merge.sh   — after Replit task-agent merges ([postMerge] in .replit)
#   2. .git/hooks/post-merge   — after any `git pull` / `git merge` in this workspace
#
# Safe to run multiple times (idempotent).
#
# ── Why this exists ──────────────────────────────────────────────────────────
# Railway uses Dockerfile: "corepack prepare pnpm@9.15.9 --activate"
# package.json on main therefore has packageManager = "pnpm@9.15.9".
#
# Replit ships pnpm 10.x in its Nix store. When corepack sees the mismatch it
# tries to self-install pnpm@9.15.9 in a background thread, which crashes
# with SIGABRT (uv_thread_create failure), breaking all Replit workflows.
#
# This script detects the Nix-installed pnpm version and patches package.json
# locally so Replit can preview without crashing. The change must NOT be
# committed back to main.
#
# ── IMPORTANT: pnpm --version must NOT be called via corepack ────────────────
# When package.json says pnpm@9.15.9 and corepack is active, any `pnpm` call
# re-triggers the self-install loop. We therefore detect the version via the
# Nix store path directly, bypassing corepack entirely.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO_ROOT/package.json"

# ── 1. Detect installed pnpm version via Nix store (bypass corepack) ─────────

# Find the pnpm binary in the Nix store — avoids calling corepack-wrapped pnpm.
NIX_PNPM="$(ls /nix/store/*/bin/pnpm 2>/dev/null | head -1 || echo '')"

INSTALLED_PNPM=""
if [[ -n "$NIX_PNPM" && -x "$NIX_PNPM" ]]; then
  # Call the Nix binary directly — no corepack wrapper, no self-install loop.
  INSTALLED_PNPM="$("$NIX_PNPM" --version 2>/dev/null || echo '')"
fi

if [[ -z "$INSTALLED_PNPM" ]]; then
  # Fallback: try COREPACK_ENABLE_STRICT=0 to suppress self-install attempts.
  INSTALLED_PNPM="$(COREPACK_ENABLE_STRICT=0 pnpm --version 2>/dev/null || echo '')"
fi

if [[ -z "$INSTALLED_PNPM" ]]; then
  echo "[replit-overrides] WARNING: could not detect installed pnpm version — skipping packageManager patch"
else
  REQUIRED="pnpm@${INSTALLED_PNPM}"
  CURRENT="$(node -e "process.stdout.write(require('$PKG').packageManager || '')" 2>/dev/null || echo '')"

  if [[ "$CURRENT" != "$REQUIRED" ]]; then
    echo "[replit-overrides] Patching packageManager: '$CURRENT' → '$REQUIRED'"
    echo "[replit-overrides] ⚠  This change is LOCAL ONLY — do not commit package.json after this patch."
    echo "[replit-overrides]    Run 'bash scripts/assert-railway-packaging.sh' before any commit to main."
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
# Document each patch with: what Railway expects vs what Replit needs, and why.

echo "[replit-overrides] Done."
echo "[replit-overrides] ⚠  Remember: 'git checkout -- package.json' before committing to main."
