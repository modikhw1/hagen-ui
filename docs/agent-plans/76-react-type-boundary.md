# Phase 76 — React Type Boundary: hagen vs letrend

**Date:** 2026-05-13  
**Status:** Fix already in place (commit `a79e62d`, Task #27). Phase 76 confirms and documents.

---

## Root Cause

`artifacts/hagen` is a Next.js 14 / React 18 app that is part of the pnpm workspace (`artifacts/*` in `pnpm-workspace.yaml`). Its `package.json` declares:

```json
"@types/react": "^18.2.48"
```

`artifacts/letrend` uses `@types/react@19.2.14` (from the workspace catalog).

When pnpm resolves these two conflicting ranges, it:
1. Installs `@types/react@18.3.28` under `hagen`'s own `node_modules`
2. Hoists a copy to `node_modules/.pnpm/node_modules/@types/react` (the shared pnpm "hoisted" layer)

TypeScript, when typechecking `letrend`, walks module resolution paths and finds **two distinct `@types/react` copies**:
- The 19.x copy (correct) for letrend's own imports
- The 18.x copy (incorrect) from the hoisted pnpm layer

With two different `ReactNode` definitions in scope, TypeScript emits spurious errors:
- `"bigint is not assignable to ReactNode"` (React 19 added `bigint` to `ReactNode`; React 18 didn't)
- `"Suspense cannot be used as a JSX component"` (type signature differences)

These errors were reproducible in a fresh environment where `pnpm install` had pulled in both copies.

---

## Fix Applied (commit `a79e62d`, 2026-05-03)

Added workspace-level `overrides` to `pnpm-workspace.yaml`:

```yaml
overrides:
  "@types/react": "19.2.14"
  "@types/react-dom": "19.2.3"
```

This forces **every package in the workspace** — including `hagen` — to resolve `@types/react` to `19.2.14`. pnpm will no longer install the 18.x copy anywhere in the tree. The hoisted symlink at `node_modules/.pnpm/node_modules/@types/react` now points at the single 19.2.14 copy.

**Why not isolate hagen instead?**  
Removing `artifacts/hagen` from `packages:` in `pnpm-workspace.yaml` would also work but is more disruptive — hagen's shared type utilities are imported by other packages. The workspace override is narrower (only affects type declarations, not runtime) and requires zero changes to tsconfig or imports.

**Impact on hagen itself:**  
hagen's runtime dependency is still React 18 (its `package.json` → `"react": "^18.3.1"` is unchanged). Only the type declarations are upgraded from 18 to 19. The React 19 types are backward-compatible for the React 18 API surface that hagen uses, so no new type errors are introduced in hagen.

---

## Phase 76 Verification

All commands run with Replit local override active (`pnpm@10.26.1` via node patch).  
Final committed state restored to `pnpm@9.15.9`.

| Command | Result |
|---|---|
| `pnpm --filter @workspace/api-server run typecheck` | **0 errors** ✅ |
| `PORT=5173 BASE_PATH=/ pnpm --filter "./artifacts/letrend" run build` | **✅ success** |
| `pnpm --filter @workspace/letrend run typecheck` | **0 errors** ✅ |
| `pnpm --filter "./artifacts/letrend" exec tsc --noEmit` | **0 errors** ✅ |
| `bash scripts/assert-railway-packaging.sh` | **✅ all checks passed** |

### Note on `pnpm --filter "./artifacts/letrend" exec tsc --noEmit`

The `exec` form (vs `run typecheck`) produces identical results — both resolve to the same `tsc -p tsconfig.json --noEmit` invocation. The path-based filter `"./artifacts/letrend"` and the name-based filter `@workspace/letrend` are equivalent for a pnpm workspace package.

---

## Files Changed in Phase 76

None — the fix was already in `pnpm-workspace.yaml` (commit `a79e62d`). Phase 76 adds this documentation only.

## Packaging Boundary (maintained from Phase 75)

- `package.json` on main: `"packageManager": "pnpm@9.15.9"` ✅  
- Dockerfile: `corepack prepare pnpm@9.15.9 --activate` ✅  
- Replit local: patched to `pnpm@10.26.1` via `node` (never committed)  
- Guard: `bash scripts/assert-railway-packaging.sh` must pass before any commit
