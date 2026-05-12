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

## Current Task: Full hagen-ui Preview Smoke

Direct Hagen smoke has passed against Railway:

- `HAGEN_BASE_URL=https://hagen-production.up.railway.app`
- correct shared secret returned JSON `{ clips, diagnostics }`
- missing secret returned JSON `401 unauthorized`

The remaining smoke step is the hagen-ui preview endpoint:

```text
POST /api/studio-v2/customers/:customerId/sync-history?preview=true
```

This must be preview-only. Do not call:

```text
POST /api/studio-v2/customers/:customerId/sync-history
```

## Required Local Inputs

Use the shared secret from the local file if present:

```text
C:\Users\praiseworthy\Desktop\nyckel3.txt
```

The file must contain a single-line `HAGEN_SYNC_SECRET`. The smoke script now
rejects private keys and multiline values.

You also need these env vars for full hagen-ui preview:

```text
API_SERVER_BASE_URL=<hagen-ui api base url>
HAGEN_UI_AUTH_COOKIE=<browser auth cookie for logged-in admin/CM>
```

If either `API_SERVER_BASE_URL` or `HAGEN_UI_AUTH_COOKIE` is missing, stop and
report that the full preview smoke cannot run yet.

## Suggested Zero-Match Customer

The orchestrator found this customer via Supabase:

```text
HAGEN_SYNC_TEST_CUSTOMER_ID=0cd8f4d8-8bb8-4456-ba85-1108b5e69a65
HAGEN_SYNC_TEST_HANDLE=consorconsulting
```

Direct Hagen lookup for `consorconsulting` returned `clips=0`, with library
diagnostics `totalTikTokClips=193`, `availableUsernameCount=98`,
`unresolvedUsernameCount=0`.

This is useful for verifying zero-match preview behavior and diagnostics. It is
not useful for import testing.

Other tested customer handles also returned `clips=0`:

```text
icafolkeslivs
icavast
roligtkonto2
blubnan.liljeholm
```

## PowerShell Setup

Use this shape. Do not print the secret.

```powershell
$env:HAGEN_BASE_URL = "https://hagen-production.up.railway.app"
$env:HAGEN_SYNC_SECRET = (Get-Content -LiteralPath "C:\Users\praiseworthy\Desktop\nyckel3.txt" -Raw).Trim()
$env:HAGEN_SYNC_TEST_CUSTOMER_ID = "0cd8f4d8-8bb8-4456-ba85-1108b5e69a65"
$env:HAGEN_SYNC_TEST_HANDLE = "consorconsulting"

# Required, must be provided by the user/session:
# $env:API_SERVER_BASE_URL = "<hagen-ui api base url>"
# $env:HAGEN_UI_AUTH_COOKIE = "<browser auth cookie>"

node scripts\smoke-hagen-sync.mjs
```

## Expected Result

The smoke script should:

- pass direct Hagen secret test
- pass direct Hagen missing-secret `401` test
- pass hagen-ui no-auth preview `401/403` test
- pass authenticated hagen-ui preview if `HAGEN_UI_AUTH_COOKIE` is valid
- return preview fields:
  - `handle`
  - `totalMatched`
  - `wouldImport`
  - `wouldSkip`
  - `hagenDiagnostics`
- not perform any import

For the suggested customer, a successful preview is expected to be a zero-match
preview unless production data changes:

```text
totalMatched=0
wouldImport=0
wouldSkip=0
hagenDiagnostics present
```

## Documentation Update

If the full hagen-ui preview smoke is actually run, update:

```text
docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md
```

Add a section:

```text
## Live Smoke Result - hagen-ui Preview
```

Include:

- timestamp
- command shape with secrets redacted
- `API_SERVER_BASE_URL` used
- customer id and handle used
- status codes
- whether hagen-ui no-auth returned 401/403
- whether authenticated preview returned 200
- preview counts (`totalMatched`, `wouldImport`, `wouldSkip`)
- whether `hagenDiagnostics` was present
- any blocker/error body

Do not update the doc if the preview smoke did not run.
