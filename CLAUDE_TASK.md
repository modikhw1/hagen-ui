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
4. Do not write secrets or cookies to files or docs.
5. Do not touch any customer except the exact smoke customer listed below.

## Current Task: Controlled hagen-ui Import Smoke

The user explicitly approved a controlled import test. This is the only import
mode allowed, and only for the smoke customer below.

You may call these endpoints only for customer
`3e4173ee-2ff2-454f-9bac-7a77b1163af8`:

```text
POST /api/studio-v2/customers/3e4173ee-2ff2-454f-9bac-7a77b1163af8/sync-history?preview=true
POST /api/studio-v2/customers/3e4173ee-2ff2-454f-9bac-7a77b1163af8/sync-history
```

Do not call import mode for any other customer.

## Smoke Customer

Production Supabase smoke customer:

```text
HAGEN_SYNC_TEST_CUSTOMER_ID=3e4173ee-2ff2-454f-9bac-7a77b1163af8
HAGEN_SYNC_TEST_HANDLE=icacitylivs
Business name=Hagen Sync Smoke - icacitylivs - 2026-05-12
```

Orchestrator preconditions verified before this task:

```text
Direct Hagen filter returned clips=1 for handle icacitylivs.
customer_concepts rows for the smoke customer = 0.
```

Expected import behavior:

```text
Preview before import: totalMatched=1, wouldImport=1, wouldSkip=0
First import: imported=1, skipped=0
Second import: imported=0, skipped=1
Preview after import: totalMatched=1, wouldImport=0, wouldSkip=1
```

## Required Local Inputs

You need:

```text
API_SERVER_BASE_URL=https://app.letrend.se
HAGEN_UI_AUTH_COOKIE=<browser auth cookie for logged-in admin/CM>
```

If `HAGEN_UI_AUTH_COOKIE` is missing, stop and report that the import smoke
cannot run yet. Do not attempt to bypass auth.

## PowerShell Runbook

Use this shape. Do not print the cookie.

```powershell
$env:API_SERVER_BASE_URL = "https://app.letrend.se"
$customerId = "3e4173ee-2ff2-454f-9bac-7a77b1163af8"

if (-not $env:HAGEN_UI_AUTH_COOKIE) {
  throw "HAGEN_UI_AUTH_COOKIE is not set"
}

$headers = @{
  Accept = "application/json"
  Cookie = $env:HAGEN_UI_AUTH_COOKIE
}

$previewUrl = "$env:API_SERVER_BASE_URL/api/studio-v2/customers/$customerId/sync-history?preview=true"
$importUrl = "$env:API_SERVER_BASE_URL/api/studio-v2/customers/$customerId/sync-history"

$previewBefore = Invoke-RestMethod -Method Post -Uri $previewUrl -Headers $headers
$previewBefore | ConvertTo-Json -Depth 8

$firstImport = Invoke-RestMethod -Method Post -Uri $importUrl -Headers $headers
$firstImport | ConvertTo-Json -Depth 8

$secondImport = Invoke-RestMethod -Method Post -Uri $importUrl -Headers $headers
$secondImport | ConvertTo-Json -Depth 8

$previewAfter = Invoke-RestMethod -Method Post -Uri $previewUrl -Headers $headers
$previewAfter | ConvertTo-Json -Depth 8
```

## Assertions

Treat the task as failed if any assertion is false:

- `previewBefore.handle` is `icacitylivs`
- `previewBefore.totalMatched` is `1`
- `previewBefore.wouldImport` is `1`
- `previewBefore.wouldSkip` is `0`
- `firstImport.imported` is `1`
- `firstImport.skipped` is `0`
- `secondImport.imported` is `0`
- `secondImport.skipped` is `1`
- `previewAfter.totalMatched` is `1`
- `previewAfter.wouldImport` is `0`
- `previewAfter.wouldSkip` is `1`

If `firstImport` returns `imported=0, skipped=1`, stop and document that the
row already existed before this run. Do not retry with another customer.

## Documentation Update

If the import smoke is actually run, update:

```text
docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md
```

Add a section:

```text
## Live Smoke Result - Controlled hagen-ui Import
```

Include:

- timestamp
- command shape with cookie redacted
- `API_SERVER_BASE_URL` used
- customer id and handle used
- preview-before counts
- first import response
- second import response
- preview-after counts
- any error body or blocker

Do not update the doc if the import smoke did not run.
