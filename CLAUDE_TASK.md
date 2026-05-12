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

## Current Task: Phase 61 - Hagen Library Sync Live Preview Readiness

### Context

Phase 59 created the missing Hagen endpoint:

```text
GET /api/studio-v2/customers/:customerId/hagen-clips
```

Phase 60 fixed unsafe matching in hagen-ui so clips only match a customer when
the username can be positively resolved from `source_username` or TikTok URL.

The remaining gap is operational: the sync path still fetches the full Hagen
TikTok library, then filters in hagen-ui. It also has not been live-smoked as a
preview path with Hagen running and JSON returning from upstream.

This phase should make preview/import readiness concrete before any live import
is trusted.

### Read First

In `hagen-ui`:

- `docs/agent-plans/59-hagen-library-sync-contract-alignment.md`
- `docs/agent-plans/60-safe-hagen-clip-handle-matching.md`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

In `hagen`:

- `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`
- `src/app/api/letrend/library/route.ts`
- `src/app/api/videos/library/route.ts`

### Goal

Make the Hagen library sync preview path operationally testable and efficient:

- Hagen should support `?handle=username` server-side filtering.
- hagen-ui should pass the customer handle to Hagen.
- hagen-ui must still validate matches itself as defense in depth.
- Preview should return structured JSON and write nothing.
- If a live preview can be run safely, document the exact result.

### Required Behavior

1. Update the Hagen endpoint to support optional handle filtering:

```text
GET /api/studio-v2/customers/:customerId/hagen-clips?handle=username
```

Rules:

- Normalize `handle` by trimming, stripping leading `@`, and lowercasing.
- Resolve each clip username using metadata first, then TikTok URL fallback.
- If `handle` is present, return only clips whose resolved username matches.
- If `handle` is absent, keep current behavior and return all TikTok clips.
- Return JSON even when no clips match.
- Preserve the existing `{ clips: [...] }` shape.
- Optional but useful: include a `diagnostics` object with counts:
  - `totalTikTokClips`
  - `returnedClips`
  - `unresolvedUsernameCount`
  - `handleFilter`

2. Update hagen-ui sync-history POST route:

- Normalize the customer's `tiktok_handle` once.
- Pass `query: new URLSearchParams({ handle }).toString()` to `fetchHagenJson`.
- Keep existing hagen-ui positive-match filtering from Phase 60.
- Preview response may include diagnostics from Hagen if easy, but do not break
  existing UI consumers.

3. Improve preview diagnostics:

- If Hagen returns zero clips for the handle, preview should still respond with:
  - `handle`
  - `totalMatched: 0`
  - `wouldImport: 0`
  - `wouldSkip: 0`
  - `samples: []`
  - `availableUsernames` if available
- Do not treat "zero matched clips" as an error.

4. Live/readiness smoke:

Run whatever is safe in the local environment. At minimum:

- Hagen endpoint direct GET returns JSON, not HTML.
- Hagen endpoint with `?handle=` returns JSON and preserves `{ clips }`.
- hagen-ui no-auth POST to `/sync-history?preview=true` still returns 401.

If authenticated hagen-ui preview is possible:

- Run preview only first.
- Confirm no Supabase rows are inserted.
- Record customer ID, handle, `totalMatched`, `wouldImport`, and `wouldSkip`.
- Do not run import unless preview shows clear `wouldImport > 0` and the target
  customer/handle is known to be safe for a test.

If authenticated preview is not possible:

- Document the blocker precisely.
- Add manual browser test steps in the phase doc.

5. Do not change Supabase schema.

6. Do not touch unrelated `/admin/demos` work.

### Verification

Run in `hagen-ui`:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/letrend run typecheck
```

If `hagen` changes, run its relevant typecheck/build command as well.

Also document any direct HTTP smoke commands used, including status code and
short response shape.

### Output

Create:

```text
hagen-ui/docs/agent-plans/61-hagen-library-sync-live-preview-readiness.md
```

Include:

- what changed in Hagen
- what changed in hagen-ui
- exact endpoint contract after this phase
- whether authenticated preview was run
- row-safety result: whether preview wrote zero rows
- verification results
- remaining risks or blockers

When finished, commit and push coherent changes. If both repos changed, commit
and push each repo separately with clear messages.
