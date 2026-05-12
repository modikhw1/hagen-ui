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
7. Commit and push only when the implemented change is coherent. If both repos
   changed, commit/push each repo separately with clear messages.

## Current Task: Phase 62 - Secure Hagen Sync Endpoint And Preserve Diagnostics

### Context

Phase 59 created:

```text
GET /api/studio-v2/customers/:customerId/hagen-clips
```

Phase 60 made hagen-ui require a positive handle match before importing.
Phase 61 added `?handle=username` filtering in Hagen and made hagen-ui pass the
customer handle to reduce payload size.

Two gaps remain:

1. The Hagen endpoint is described as internal but currently has no auth. If the
   deployed Hagen app is reachable publicly, the endpoint can expose TikTok
   library data, especially when `handle` is omitted.
2. Because Phase 61 filters server-side by handle, hagen-ui no longer receives
   all usernames on a zero-match preview. The old "available accounts in hagen"
   debug text can become empty even when Hagen has clips for other usernames.

### Read First

In `hagen-ui`:

- `docs/agent-plans/59-hagen-library-sync-contract-alignment.md`
- `docs/agent-plans/60-safe-hagen-clip-handle-matching.md`
- `docs/agent-plans/61-hagen-library-sync-live-preview-readiness.md`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

In `hagen`:

- `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`

### Goal

Make the Hagen hagen-clips endpoint safe for deployment and keep preview
diagnostics useful after server-side handle filtering.

### Required Behavior

#### 1. Internal Secret Between hagen-ui And Hagen

Use this shared contract unless the codebase clearly has an existing equivalent:

- Env var in both services: `HAGEN_SYNC_SECRET`
- Request header from hagen-ui to Hagen: `x-hagen-sync-secret`

In `hagen-ui`:

- Update `fetchHagenJson()` in `artifacts/api-server/src/lib/upstream-proxy.ts`
  so it sends `x-hagen-sync-secret` when `process.env.HAGEN_SYNC_SECRET` is set.
- Do not log the secret.
- Keep existing headers and request id behavior.
- Do not require the secret for unrelated local development if env is missing.

In `hagen`:

- Protect only `GET /api/studio-v2/customers/:customerId/hagen-clips`.
- If `HAGEN_SYNC_SECRET` is set, require the exact `x-hagen-sync-secret` header.
- If the header is missing or wrong, return JSON 401:

```json
{ "error": "unauthorized", "message": "Missing or invalid Hagen sync secret" }
```

- If `NODE_ENV === "production"` and `HAGEN_SYNC_SECRET` is missing, return JSON
  500:

```json
{ "error": "hagen-sync-secret-not-configured", "message": "HAGEN_SYNC_SECRET is required in production" }
```

- If not production and the secret is missing, allow the request for local dev.
- Always return JSON, never HTML, for auth/config failures.

#### 2. Preserve Useful Diagnostics With Server-Side Filtering

Update the Hagen endpoint diagnostics so they remain useful even when `?handle=`
filters the returned clips.

Diagnostics should include, at minimum:

```json
{
  "totalTikTokClips": 100,
  "returnedClips": 5,
  "unresolvedUsernameCount": 3,
  "handleFilter": "restaurangx",
  "availableUsernames": ["bar1", "cafe2", "restaurangx"],
  "availableUsernameCount": 3
}
```

Rules:

- `availableUsernames` should be resolved from the full TikTok library before
  handle filtering, not just returned clips.
- Normalize, dedupe, and sort usernames.
- Limit the array if needed to avoid huge responses, for example first 50.
- If you limit it, include enough count metadata to know the list was truncated.

#### 3. Pass Diagnostics Through hagen-ui Preview

In `artifacts/api-server/src/routes/studio-v2.ts`:

- Read `hagenResult.data.diagnostics` if present.
- Preview response should include a safe diagnostics object, for example
  `hagenDiagnostics`.
- When `matchedClips.length === 0`, prefer diagnostics usernames from Hagen for
  `availableUsernames`, falling back to locally resolved usernames.
- Do not change import behavior.
- Preview must remain read-only.

#### 4. Surface Diagnostics In The Studio UI

In `CustomerWorkspaceContent.tsx`:

- Extend the `syncPreviewResult` state type for optional `hagenDiagnostics`.
- Store the diagnostics from preview response.
- Render a compact, non-intrusive diagnostics line in the existing preview
  result box.
- For zero-match previews, show a useful Swedish message such as:

```text
Hagen hittade 0 klipp for @handle. Biblioteket har X TikTok-klipp, Y upplosta konton och Z klipp utan upplost konto.
```

- Keep existing design language. Do not redesign the section.
- Avoid showing raw JSON in the UI.

Use ASCII text in code/docs unless the existing file clearly already uses
Swedish characters in user-facing UI strings. It is okay to use Swedish
characters in React UI text if that file already uses them.

#### 5. Verification

Run in `hagen-ui`:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/letrend run typecheck
```

If `hagen` changes, run its relevant typecheck/build command as well.

If practical, add or document smoke checks:

- Direct Hagen endpoint without secret when secret is configured returns 401.
- Direct Hagen endpoint with correct secret returns JSON `{ clips, diagnostics }`.
- Direct Hagen endpoint in local dev without secret still works.
- hagen-ui preview response includes `hagenDiagnostics`.
- Preview writes zero rows.

If these cannot be run locally, document the exact blocker and commands.

### Output

Create:

```text
hagen-ui/docs/agent-plans/62-secure-hagen-sync-endpoint-and-diagnostics.md
```

Include:

- root cause
- secret/header contract
- production/local behavior
- diagnostics contract
- UI behavior
- files changed in each repo
- verification results
- remaining risks or blockers

When finished, commit and push coherent changes. If both repos changed, commit
and push each repo separately with clear messages.
