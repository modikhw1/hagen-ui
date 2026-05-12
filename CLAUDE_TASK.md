# Claude Code Task Handoff

This file is the handoff contract for Claude Code. Read this file from the
`hagen-ui` repo root before doing any work. Do not rely on pasted prompts.

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

## Current Status

No active implementation task is queued.

Phase 63 added the Hagen sync smoke harness:

- `hagen-ui/scripts/smoke-hagen-sync.mjs`
- `hagen-ui/docs/agent-plans/63-hagen-sync-deployment-smoke-harness.md`
- `hagen/.env.example` now documents `HAGEN_SYNC_SECRET`

The next meaningful step is a live/deployed smoke run, but that requires real
environment values:

- `HAGEN_BASE_URL`
- matching `HAGEN_SYNC_SECRET` in both services
- optional `API_SERVER_BASE_URL`
- optional authenticated `HAGEN_UI_AUTH_COOKIE`
- optional real `HAGEN_SYNC_TEST_CUSTOMER_ID` and `HAGEN_SYNC_TEST_HANDLE`

## If Asked To Continue

Do not repeat Phase 63. Ask for, or use already configured, live smoke env vars.
Then run the smoke harness:

```text
node scripts/smoke-hagen-sync.mjs
```

Only update docs with actual smoke results if a real smoke run is performed.
Never call the import endpoint from the smoke script or during this handoff
unless the orchestrator explicitly requests a controlled import test.
