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
4. Do not call import mode unless the orchestrator explicitly asks for a
   controlled import test.
5. Do not write secrets to files or docs.

## Current Task: Positive hagen-ui Preview Smoke

The zero-match preview smoke has passed. The next step is a positive
preview-only smoke using a temporary Supabase customer created by the
orchestrator.

This is the only hagen-ui endpoint you may call:

```text
POST /api/studio-v2/customers/:customerId/sync-history?preview=true
```

Do not call import mode:

```text
POST /api/studio-v2/customers/:customerId/sync-history
```

## Positive Test Customer

The orchestrator created this production Supabase smoke customer:

```text
HAGEN_SYNC_TEST_CUSTOMER_ID=3e4173ee-2ff2-454f-9bac-7a77b1163af8
HAGEN_SYNC_TEST_HANDLE=icacitylivs
Business name=Hagen Sync Smoke - icacitylivs - 2026-05-12
```

The orchestrator verified before this task:

```text
Direct Hagen filter returned clips=1 for handle icacitylivs.
customer_concepts rows for the smoke customer = 0.
```

This means a correct authenticated hagen-ui preview should report a positive
match without writing rows:

```text
handle=icacitylivs
totalMatched=1
wouldImport=1
wouldSkip=0
hagenDiagnostics present
samples contains at least one TikTok URL
```

## Required Local Inputs

Use the shared secret from the local file if present:

```text
C:\Users\praiseworthy\Desktop\nyckel3.txt
```

The file must contain a single-line `HAGEN_SYNC_SECRET`. The smoke script
rejects private keys and multiline values.

You also need these env vars for full hagen-ui preview:

```text
API_SERVER_BASE_URL=<hagen-ui api base url, usually https://app.letrend.se>
HAGEN_UI_AUTH_COOKIE=<browser auth cookie for logged-in admin/CM>
```

If either `API_SERVER_BASE_URL` or `HAGEN_UI_AUTH_COOKIE` is missing, stop and
report that the positive preview smoke cannot run yet.

## PowerShell Setup

Use this shape. Do not print the secret or cookie.

```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
$env:HAGEN_SYNC_SECRET = (Get-Content -LiteralPath "C:\Users\praiseworthy\Desktop\nyckel3.txt" -Raw).Trim()
$env:HAGEN_SYNC_TEST_CUSTOMER_ID = "3e4173ee-2ff2-454f-9bac-7a77b1163af8"
$env:HAGEN_SYNC_TEST_HANDLE = "icacitylivs"
$env:API_SERVER_BASE_URL = "https://app.letrend.se"

# Required, must already be available in your session or copied from browser:
# $env:HAGEN_UI_AUTH_COOKIE = "<browser auth cookie>"

node scripts\smoke-hagen-sync.mjs
```

## Expected Result

The smoke script should:

- pass direct Hagen secret test
- pass direct Hagen missing-secret `401` test
- pass hagen-ui no-auth preview `401/403` test
- pass authenticated hagen-ui preview
- show `handle="icacitylivs"`
- show `totalMatched=1`
- show `wouldImport=1`
- show `wouldSkip=0`
- show `hagenDiagnostics` present
- not perform any import

If the script passes but the authenticated preview counts are not positive,
mark the task as failed and document the mismatch.

## Documentation Update

If the positive hagen-ui preview smoke is actually run, update:

```text
docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md
```

Add a section:

```text
## Live Smoke Result - Positive hagen-ui Preview
```

Include:

- timestamp
- command shape with secrets/cookies redacted
- `API_SERVER_BASE_URL` used
- customer id and handle used
- direct Hagen status and clip count
- hagen-ui no-auth status
- authenticated preview status
- preview counts (`totalMatched`, `wouldImport`, `wouldSkip`)
- whether `samples` contained at least one TikTok URL
- whether `hagenDiagnostics` was present
- any blocker/error body

Do not update the doc if the preview smoke did not run.
