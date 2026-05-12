# Claude Code Task Handoff

This file is the handoff contract for Claude Code. Read this file from the
`hagen-ui` repo root before doing any work. Do not rely on pasted prompts.

## Working Repos

- `C:\Users\praiseworthy\Desktop\hagen-ui`
- `C:\Users\praiseworthy\Desktop\hagen`

Both repos may have local changes. Never reset, checkout, or revert unrelated
work. Only edit files needed for the current task.

## Operating Protocol

1. Start in `hagen-ui`.
2. Pull latest `main` if the worktree allows it.
3. Do not push to git. The orchestrator reviews, rebases if needed, and pushes.
4. Do not write secrets, cookies, tokens, or production credentials to files or docs.
5. Do not run live import/sync endpoints in this task.

## Current Task: Phase 65 - Hagen Import Sync Run Logging

Phase 64 made the Studio customer workspace read sync status from `sync_runs`.
The remaining gap is that Hagen-library import (`POST /sync-history`) currently
creates `customer_concepts` history rows but does not write `sync_runs`, so CM
status remains empty after a successful Hagen import.

Add sync-run logging for the Hagen-library import route.

## Supabase Contract

The orchestrator verified the production `sync_runs` constraints:

```text
mode must be one of: cron, manual, mark_produced
status must be one of: running, ok, error
```

Do not add a migration in this task. Use `mode='manual'` for Hagen-library
imports and document that source-specific mode (for example `hagen_library`)
requires a later schema migration.

`sync_runs` columns available:

```text
id uuid
customer_id uuid
mode text
started_at timestamptz
finished_at timestamptz
status text
fetched_count int
imported_count int
stats_updated_count int
reconciled boolean
error text
calls_used int
```

## Scope

Backend:

- Update `artifacts/api-server/src/routes/studio-v2.ts`.
- Only touch the Hagen-library route:
  - `POST /api/studio-v2/customers/:customerId/sync-history`
  - `POST /api/studio-v2/customers/:customerId/sync-history?preview=true`
- Preview mode must remain read-only and must not write `sync_runs`.
- Import mode must write one `sync_runs` row per request attempt after:
  - auth/access has passed
  - customer exists
  - customer has a TikTok handle
- Start the run with:
  - `customer_id`
  - `mode='manual'`
  - `started_at`
  - `status='running'`
- On successful import/no-op, update the run with:
  - `finished_at`
  - `status='ok'`
  - `fetched_count = matchedClips.length`
  - `imported_count = imported`
  - `stats_updated_count = 0`
  - `calls_used = 0`
  - `error = null`
- If no new clips exist, still log `status='ok'`, `imported_count=0`, and
  `fetched_count=matchedClips.length`.
- On Hagen upstream failure or insert failure, update the run with:
  - `finished_at`
  - `status='error'`
  - best-known counts
  - `calls_used=0`
  - `error=<message returned/logged by route>`
- Do not let sync-run logging failure break the import. If inserting/updating
  `sync_runs` fails, log the observability error and continue route behavior.
- If needed, move the `getHagenBase()` check so import-mode config failures can
  be logged after the customer/handle is known. Preserve response behavior.

Frontend:

- No UI redesign in this task.
- If Phase 64 already refreshes sync status after import, no frontend change is
  needed.
- If not, add only the minimal refresh needed.

Documentation:

- Add `docs/agent-plans/65-hagen-import-sync-run-logging.md`.
- Document:
  - why this phase exists after Phase 64
  - why `mode='manual'` is used
  - what counts are written
  - how errors are logged
  - verification results
  - remaining gap: source-specific Hagen mode needs schema migration if desired

## Constraints

- Do not call live import endpoints.
- Do not create, update, or delete Supabase rows manually.
- Do not touch the smoke customer.
- Do not broaden into cron scheduling, reconciliation scoring, or demo flow.
- Keep edits scoped to the Hagen import route, minimal frontend refresh if
  required, and the new doc.

## Verification

Run:

```powershell
pnpm --filter "./artifacts/api-server" run typecheck
pnpm --filter "./artifacts/letrend" run typecheck
```

If LeTrend typecheck still fails due to known React 19 dependency/type issues,
document that and verify no new errors are introduced by this task.
