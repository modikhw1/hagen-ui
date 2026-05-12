#!/bin/bash
set -e

# Apply Replit-specific overrides FIRST — before pnpm install —
# so the correct packageManager version is in place before pnpm reads it.
bash "$(dirname "$0")/replit-overrides.sh"

pnpm install --frozen-lockfile
pnpm --filter db push
