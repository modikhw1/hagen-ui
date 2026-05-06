# Orchestrator Live Follow-Up: Hagen UI Core Flows

Date: 2026-05-06.

This note reconciles `docs/audits/hagen-letrend-ingestion-audit.md` with live Supabase verification and the first patch package applied in `hagen-ui`.

## Live Corrections

The static audit's C-4 finding says `customer_concepts.status` is free text. That is not true for the live database connected through Supabase MCP.

Live DB has:

```text
customer_concepts_status_check:
status in ('draft', 'sent', 'produced', 'archived', 'history_import')
```

Therefore the Express create path must not write `status='assigned'`.

The static audit's C-5 finding says repo migration and write-site for `cron_run_log.thumbnails_refreshed` are aligned. That is true in code, but the column was missing in live DB. The idempotent migration has now been applied live and verified.

`shift_feed_order(p_customer_id uuid, p_advance_count integer default 1)` exists live, but it shifts every `customer_concepts` row where `feed_order is not null`. Do not use it blindly until row-kind/timeline ownership is tightened, or until the function is narrowed to planned assignment rows.

## First Patch Package

Applied in `hagen-ui`:

1. Added api-server proxy for `POST /api/studio/concepts/humor-enrich`.
2. Made `POST /api/admin/concepts` persist caller-provided `id`, falling back to a generated `concept-*` id.
3. Changed `POST /api/studio-v2/customers/:customerId/concepts` to insert `status='draft'` instead of live-invalid `assigned`.
4. Applied live DB migration for `public.cron_run_log.thumbnails_refreshed`.

## Verification

Passed:

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Blocked by local optional dependency install state, not by these code changes:

```powershell
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
```

Both commands fail before executing project code because Windows optional binaries are missing from local `node_modules`:

- `@rollup/rollup-win32-x64-msvc`
- `@esbuild/win32-x64`

`pnpm install --frozen-lockfile` is blocked in this Windows shell by the repo's Unix `sh` preinstall script. `pnpm install --frozen-lockfile --ignore-scripts` completes but does not repair those optional binaries.

## Next Patch Candidates

1. Express customer create: replace the current create stub with invite email + initial TikTok sync trigger.
2. Feed plan engine: replace `mark-produced` JS loop with a safer server-side operation, but do not call the broad `shift_feed_order` blindly until the target row set is narrowed.
3. Canonical row contract: introduce explicit `row_kind` or equivalent read model for assignment/collaboration/history_import.
4. Remove or quarantine dead Next.js server-only studio files under `artifacts/letrend/src/lib/studio` after confirming no runtime imports.
