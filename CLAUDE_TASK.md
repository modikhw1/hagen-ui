# Claude Code Task Handoff

This file is the handoff contract for Claude Code. Read this file from the
`hagen-ui` repo root and execute the current task. Do not rely on pasted prompts.

## Working Repos

- `C:\Users\praiseworthy\Desktop\hagen-ui`
- `C:\Users\praiseworthy\Desktop\hagen`

Both repos may have local changes. Never reset, checkout, or revert unrelated
work. Only edit files needed for the current task.

## Operating Protocol

1. Start in `hagen-ui` and pull latest `main` if the worktree allows it.
2. Inspect `hagen` as needed. If `hagen` has unrelated dirty files, preserve them.
3. Make the smallest cross-repo changes needed to complete the task.
4. Add or update one phase document under `hagen-ui/docs/agent-plans/`.
5. Run the relevant typechecks/tests and record exact results in the phase doc.
6. Leave a short completion note in the phase doc with:
   - files changed
   - verification run
   - remaining risks or blockers
7. Do not push to git. You may create local commits if the change is coherent,
   but the orchestrator will review, rebase if needed, and push to `main`.
   If both repos changed, leave each repo in a clear state and document the
   intended commit messages in the phase doc.

## Current Task: Phase 63 - Hagen Sync Deployment Smoke Harness

### Context

Phases 59-62 made the Hagen library history sync path structurally safe:

- Phase 59: created the missing Hagen `hagen-clips` endpoint.
- Phase 60: required positive handle matching before preview/import.
- Phase 61: added `?handle=` server-side filtering.
- Phase 62: protected the Hagen endpoint with `HAGEN_SYNC_SECRET` and passed
  diagnostics through to the Studio UI.

The recurring remaining gap is that live HTTP smoke tests have not actually
been run because Hagen was not running locally during the previous phases.
Before adding more product behavior, make this flow easy to verify repeatedly.

### Read First

In `hagen-ui`:

- `docs/agent-plans/61-hagen-library-sync-live-preview-readiness.md`
- `docs/agent-plans/62-secure-hagen-sync-endpoint-and-diagnostics.md`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- inspect `package.json` files to see existing script conventions

In `hagen`:

- `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`
- inspect env/example files and package scripts

### Goal

Create a practical smoke harness and deployment checklist for Hagen library sync.
The goal is not to add new sync behavior. The goal is to make it hard to deploy
this flow with missing env vars, wrong secret config, or a broken preview route.

### Required Behavior

#### 1. Document Required Env Contract

Add or update docs so both repos clearly define:

- `HAGEN_BASE_URL` in hagen-ui api-server
- `HAGEN_SYNC_SECRET` in both hagen-ui and Hagen
- `NODE_ENV=production` behavior in Hagen
- local dev behavior when `HAGEN_SYNC_SECRET` is omitted

If either repo has `.env.example`, `.env.sample`, deployment docs, or README
sections for env vars, update the appropriate existing location. If there is no
obvious place, document it in the Phase 63 doc only.

Do not commit real secrets.

#### 2. Add A Safe Smoke Script Or Command Set

Preferred: add a small smoke script in `hagen-ui`, for example:

```text
scripts/smoke-hagen-sync.mjs
```

It should be safe by default and should not perform imports.

Suggested env inputs:

- `HAGEN_BASE_URL`
- `HAGEN_SYNC_SECRET`
- `HAGEN_SYNC_TEST_CUSTOMER_ID` optional, default `smoke-test`
- `HAGEN_SYNC_TEST_HANDLE` optional, default `nonexistent-smoke-handle`
- `API_SERVER_BASE_URL` optional, for hagen-ui API checks
- `HAGEN_UI_AUTH_COOKIE` optional, only if an authenticated preview should be tested

Minimum checks:

- Direct Hagen GET with correct secret if secret is set:
  `/api/studio-v2/customers/{id}/hagen-clips?handle={handle}`
- Assert response is JSON.
- Assert response has `{ clips: Array, diagnostics: Object }`.
- Assert `diagnostics.handleFilter` equals normalized handle when handle is provided.
- If `HAGEN_SYNC_SECRET` is set, also check direct Hagen GET without the secret
  returns `401` or document why this cannot be tested in local dev.
- If `API_SERVER_BASE_URL` is set, call hagen-ui preview without auth and assert
  it returns `401`.
- If `HAGEN_UI_AUTH_COOKIE` is set, call authenticated hagen-ui preview and assert:
  - status is 200
  - response includes `hagenDiagnostics`
  - preview shape includes `handle`, `totalMatched`, `wouldImport`, `wouldSkip`
  - no import call is made

The script must not call import mode.

If adding a script is awkward in the repo structure, write the equivalent
commands in the Phase 63 doc with exact curl examples and expected responses.

#### 3. Optional Row-Safety Check

If Supabase service env vars are readily available in hagen-ui and there is an
existing safe helper pattern, the script may optionally count:

```sql
customer_concepts where customer_profile_id = X and history_source = 'hagen_library'
```

before/after authenticated preview and assert the count is unchanged.

Do not add this if it requires messy credential handling.

#### 4. Keep Scope Tight

Do not:

- change import behavior
- add new database migrations
- add new admin UI
- touch unrelated `/admin/demos`
- modify the Sanity docs/framework unless a merge conflict requires it

#### 5. Verification

Run in `hagen-ui`:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/letrend run typecheck
```

If a smoke script is added, run at least its no-auth/direct-Hagen path if env
allows it. If env is missing, run the script enough to verify it prints a clear
missing-env message and exits nonzero.

If `hagen` changes, run its relevant typecheck/build command.

### Output

Create:

```text
hagen-ui/docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md
```

Include:

- what env vars are required and where
- what script or command set was added
- exact smoke commands
- which checks were actually run
- whether authenticated preview was tested
- whether preview row-safety was verified
- files changed in each repo
- verification results
- remaining blockers

When finished, commit and push coherent changes. If both repos changed, commit
and push each repo separately with clear messages.
