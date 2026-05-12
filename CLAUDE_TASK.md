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

## Current Status

The live smoke pass has exposed deployment blockers rather than a passing smoke.

Phase 63 added the smoke harness:

```text
scripts/smoke-hagen-sync.mjs
```

Documented results:

- Replit dev URL returned `401 {"error":"Du maste logga in"}` before the
  Phase 62 `HAGEN_SYNC_SECRET` contract could be reached.
- Railway URL `https://hagen-production.up.railway.app` returned `404` HTML for
  `/api/studio-v2/customers/smoke-test/hagen-clips?handle=...`, which means the
  deployed Railway service likely does not include the latest Phase 59-62 Hagen
  route.

No active code implementation task is queued.

## Next Required External Step

Deploy latest `hagen` main to Railway and ensure these env vars exist in the
Railway service:

```text
NODE_ENV=production
HAGEN_SYNC_SECRET=<same-secret-as-hagen-ui>
```

Ensure hagen-ui/Replit has:

```text
HAGEN_BASE_URL=https://hagen-production.up.railway.app
HAGEN_SYNC_SECRET=<same-secret-as-hagen>
```

Do not commit real secrets.

## If Asked To Continue After Deployment

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

`HAGEN_SYNC_SECRET` must be a single-line shared token, for example the output
of `openssl rand -hex 32`. Do not use SSH private keys, PEM files, or any
multiline key file as `HAGEN_SYNC_SECRET`.

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
