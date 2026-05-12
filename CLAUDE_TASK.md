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

## Current Task: Phase 64 - Studio Sync Status Visibility

We just completed the live Hagen import smoke. The next planned step is Phase 5
/ G5 from the TikTok history audit: CM visibility into per-customer sync status.

Important finding from the orchestrator:

```text
GET /api/studio-v2/customers/:customerId/sync-history currently queries
public.tiktok_sync_history, but that view/table does not exist in Supabase.
The route catches the error and returns { history: [] }, hiding the issue.
```

Supabase has `public.sync_runs` with these columns:

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

Fix the read-only status path and surface it in the Studio customer workspace.

Backend:

- Update `artifacts/api-server/src/routes/studio-v2.ts`.
- Change `GET /api/studio-v2/customers/:customerId/sync-history` to read from
  `sync_runs`, not `tiktok_sync_history`.
- Preserve the response envelope `{ history: [...] }`.
- Return normalized rows ordered by `started_at desc`, limit 20.
- Include at least:
  - `id`
  - `mode`
  - `status`
  - `started_at`
  - `finished_at`
  - `fetched_count`
  - `imported_count`
  - `stats_updated_count`
  - `reconciled`
  - `calls_used`
  - `error`
- Do not swallow database errors as an empty successful response. Return `500`
  with a useful Swedish error message and log the underlying error.

Frontend:

- Update `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- Add read-only state/fetching for sync history using the GET route above.
- Fetch sync history when the customer workspace loads and after these actions:
  - `fetch-profile-history`
  - `sync-history` import
  - `sync-history?preview=true` may refresh status only if low-friction; preview
    itself should not create status rows.
- Add a compact sync-status surface near the existing TikTok/Hagen sync controls.
- Keep the current design language. Do not redesign the workspace.
- Show:
  - latest status (`ok`, `error`, `running`, etc.)
  - latest run time
  - mode
  - fetched/imported/stats-updated/calls-used counts when present
  - error text for failed runs
  - a small recent-run list if there is room
- Empty state should say that no sync runs have been logged yet.
- Loading and error states must be visible but quiet.

Documentation:

- Add `docs/agent-plans/64-studio-sync-status-visibility.md`.
- Document:
  - the missing `tiktok_sync_history` view issue
  - the backend route fix
  - the UI surface added
  - test commands and results
  - any remaining gaps

## Constraints

- Do not call live import endpoints.
- Do not create or delete Supabase rows.
- Do not touch the smoke customer.
- Do not broaden this into cron scheduling, reconciliation scoring, or demo flow.
- Keep edits scoped to the read route, the customer workspace UI, and the new doc.

## Verification

Run:

```powershell
pnpm --filter "./artifacts/api-server" run typecheck
pnpm --filter "./artifacts/letrend" run typecheck
```

If a typecheck fails because of unrelated pre-existing errors, document the exact
failure and keep the implementation as narrow as possible.
