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
3. Inspect `hagen` only if needed.
4. Make the smallest changes needed to complete the task.
5. Add or update one phase document under `hagen-ui/docs/agent-plans/`.
6. Run the relevant checks and record exact results in the phase doc.
7. Do not push to git. You may create local commits if the change is coherent,
   but the orchestrator will review, rebase if needed, and push to `main`.

## Current Task: Run Live Hagen Sync Smoke Test

Phase 63 added the smoke harness:

```text
scripts/smoke-hagen-sync.mjs
```

Run the live/deployed Hagen smoke test against Railway.

## Required Environment

Use this Hagen URL:

```text
HAGEN_BASE_URL=https://hagen-production.up.railway.app
```

`HAGEN_SYNC_SECRET` is required for the deployed Hagen endpoint. Do not write
the actual secret into this file or any committed doc. Read it from the shell
environment.

If `HAGEN_SYNC_SECRET` is not set, stop and report that it must be set before
the smoke test can run.

Optional env vars for a broader hagen-ui API test:

```text
API_SERVER_BASE_URL=<hagen-ui api base url>
HAGEN_SYNC_TEST_CUSTOMER_ID=<real customer_profile id>
HAGEN_SYNC_TEST_HANDLE=<customer tiktok_handle>
HAGEN_UI_AUTH_COOKIE=<browser auth cookie>
```

Do not require optional values for the first smoke pass. The first target is the
direct Hagen endpoint smoke only.

## Commands

In PowerShell, first verify the secret exists:

```powershell
if (-not $env:HAGEN_SYNC_SECRET) { throw "HAGEN_SYNC_SECRET is not set" }
```

Then run:

```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
node scripts/smoke-hagen-sync.mjs
```

If running from a bash-like shell:

```bash
export HAGEN_BASE_URL=https://hagen-production.up.railway.app
node scripts/smoke-hagen-sync.mjs
```

## Safety Rules

- Do not call import mode.
- Do not modify sync implementation.
- Do not add secrets to files.
- Do not push.
- Only update documentation with actual smoke results from this run.

## Expected Checks

The smoke script should verify:

- Hagen endpoint returns JSON with `{ clips, diagnostics }` when the correct
  `HAGEN_SYNC_SECRET` is sent.
- Hagen endpoint returns `401 unauthorized` when the secret is omitted.
- If no hagen-ui API URL is provided, hagen-ui preview checks are skipped.

## Documentation Update

After running the smoke test, update:

```text
docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md
```

Add a short section named:

```text
## Live Smoke Result - Hagen Railway
```

Include:

- exact timestamp
- command shape, with secret redacted
- pass/fail result
- returned status codes
- whether `{ clips, diagnostics }` was present
- whether missing-secret check returned 401
- any blocker or error body

Do not update the doc if no real smoke test was run.
