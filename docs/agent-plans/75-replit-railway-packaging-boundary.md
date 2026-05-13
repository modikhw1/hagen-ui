# Phase 75 — Replit/Railway Packaging Boundary

**Date:** 2026-05-13  
**Status:** Complete

---

## Problem

The repository is deployed two ways simultaneously:

| Environment | Tool | pnpm source |
|---|---|---|
| **Railway** | Dockerfile → `corepack prepare pnpm@9.15.9 --activate` | pinned by corepack |
| **Replit** | Nix store | ships pnpm **10.x** (currently 10.26.1) |

When `package.json` says `"packageManager": "pnpm@9.15.9"` but Replit's installed pnpm is 10.x, corepack detects the mismatch and tries to self-install 9.15.9 via a background thread. That thread creation fails inside Replit's sandbox:

```
SIGABRT — uv_thread_create failure
```

This kills any `pnpm` command, breaking all Replit workflows (preview, typecheck, build).

Conversely, when `package.json` says `"packageManager": "pnpm@10.26.1"`, the Railway Dockerfile's `corepack prepare pnpm@9.15.9 --activate` line no longer matches, and Railway builds may fail or behave unexpectedly.

---

## Solution: Explicit Boundary

### Canonical committed state → `pnpm@9.15.9`

`package.json` on `main` always has:
```json
"packageManager": "pnpm@9.15.9"
```

This matches the Dockerfile and is what Railway expects. Every commit to main must satisfy this.

### Replit-local patch → applied after every pull, never committed

`scripts/replit-overrides.sh` detects the Nix-installed pnpm and patches `package.json` locally to match. The patched file must **never** be committed back to main.

The script is called automatically by:
- `scripts/post-merge.sh` — after Replit task-agent merges (via `[postMerge]` in `.replit`)
- `.git/hooks/post-merge` — after any `git pull` / `git merge` in this workspace

---

## Guard Script

`scripts/assert-railway-packaging.sh` verifies Railway-safe state. It **fails** (exit 1) if:

- `package.json` → `packageManager` ≠ `"pnpm@9.15.9"`
- `Dockerfile` does not contain `corepack prepare pnpm@9.15.9`

Run before any commit intended for main:

```bash
bash scripts/assert-railway-packaging.sh
```

Expected output when clean:
```
=== assert-railway-packaging ===
  ✅ package.json packageManager = "pnpm@9.15.9"
  ✅ Dockerfile prepares pnpm@9.15.9 via corepack
================================
✅ All checks passed — safe to commit for Railway.
```

---

## Why `pnpm --version` Must Not Be Called via Corepack

When `package.json` says `pnpm@9.15.9` and corepack is active, **any** `pnpm` command re-triggers the self-install loop, including `pnpm --version`. For this reason, `scripts/replit-overrides.sh` detects the installed version by calling the pnpm binary **directly from the Nix store path** (`/nix/store/*/bin/pnpm`), bypassing corepack entirely. A fallback uses `COREPACK_ENABLE_STRICT=0 pnpm --version`.

---

## Workflow for Replit Agents (Phase 75+)

When running typechecks or builds in this Replit workspace, the Replit override must be applied first:

```bash
# 1. Patch locally (bypass corepack, use node directly)
node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.packageManager='pnpm@10.26.1';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"

# 2. Run verifications
pnpm --filter "./artifacts/api-server" run typecheck
PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build
pnpm --filter "./artifacts/letrend" exec tsc --noEmit

# 3. Restore for commit
node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.packageManager='pnpm@9.15.9';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"

# 4. Assert clean
bash scripts/assert-railway-packaging.sh
```

---

## Verification (Phase 75)

All verifications run with `packageManager = "pnpm@10.26.1"` applied locally (Replit Nix store). Final committed state restored to `"pnpm@9.15.9"`.

| Check | Result |
|---|---|
| `pnpm --filter "./artifacts/api-server" run typecheck` | **0 errors** |
| `PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build` | **✅ success** (chunk size warnings only) |
| `pnpm --filter "./artifacts/letrend" exec tsc --noEmit` | **0 errors** |
| `bash scripts/assert-railway-packaging.sh` | **✅ all checks passed** |

---

## Files

| File | Purpose |
|---|---|
| `package.json` | Canonical: `"packageManager": "pnpm@9.15.9"` |
| `Dockerfile` | `corepack prepare pnpm@9.15.9 --activate` |
| `scripts/replit-overrides.sh` | Local patch — Nix store detection, must not be committed patched |
| `scripts/assert-railway-packaging.sh` | Guard script — fails if state is not Railway-safe |
| `scripts/post-merge.sh` | Calls `replit-overrides.sh` after every merge |
| `.git/hooks/post-merge` | Local git hook — calls `replit-overrides.sh` after every `git pull` |
