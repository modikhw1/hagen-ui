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

## Current Task: Phase 59 - Hagen Library Sync Contract Alignment

### Context

Phase 58 in `hagen-ui` implemented the missing Studio customer workspace POST
route:

```text
POST /api/studio-v2/customers/:customerId/sync-history
POST /api/studio-v2/customers/:customerId/sync-history?preview=true
```

That fixed the previous `Cannot POST` failure for the "Synca fran hagen" and
"Forhandsgranska" buttons. However, the new route calls this Hagen upstream path:

```text
/api/studio-v2/customers/:customerId/hagen-clips
```

In latest local `hagen`, that route does not appear to exist. Existing Hagen
library-style routes appear to include:

```text
/api/letrend/library
/api/videos/library?all=true&platform=tiktok
```

The next job is to align the contract so the Studio buttons use a real,
stable Hagen source and can be previewed/imported safely.

### Read First

In `hagen-ui`:

- `docs/agent-plans/57-tiktok-history-sync-control-audit.md`
- `docs/agent-plans/58-hagen-library-sync-history-post-route.md`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/routes/letrend.ts`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

In `hagen`:

- inspect all routes under `src/app/api`
- inspect existing library endpoints, especially:
  - `src/app/api/letrend/library/route.ts`
  - `src/app/api/videos/library/route.ts`

### Goal

Make the Hagen-library history sync path use an actual, stable Hagen contract.
The CM should be able to click "Forhandsgranska" and get a truthful dry-run
result, then click "Synca fran hagen" to import only deduped TikTok history rows.

### Required Behavior

1. Verify the current upstream mismatch:
   - `hagen-ui` currently calls `/api/studio-v2/customers/:id/hagen-clips`.
   - Latest `hagen` does not expose that route unless you find otherwise.

2. Choose the cleanest contract:
   - Preferred: add or use a stable Hagen endpoint that returns TikTok library
     clips in a simple history-sync shape.
   - Acceptable: adapt `hagen-ui` to call an existing Hagen endpoint if it
     already contains enough data.
   - Do not depend on Hagen knowing `hagen-ui` customer IDs unless that is
     actually true. Matching should be by TikTok handle, not by LeTrend customer ID.

3. The clip shape consumed by `hagen-ui` should resolve to:
   - `tiktok_url`
   - `source_username` if derivable from metadata or TikTok URL
   - `description` or title
   - `tiktok_thumbnail_url` if available
   - `tiktok_views`, `tiktok_likes`, `tiktok_comments` if available
   - `published_at` or `created_at` if available

4. Matching rules in `hagen-ui`:
   - Normalize the customer's `customer_profiles.tiktok_handle`.
   - Match `source_username` to handle when present.
   - If `source_username` is missing, derive username from TikTok URL and match
     that to handle.
   - Do not auto-import clips that cannot be tied to the handle.
   - Deduplicate against existing `customer_concepts.tiktok_url`.

5. Preview mode must be read-only and return:
   - `handle`
   - `totalMatched`
   - `wouldImport`
   - `wouldSkip`
   - `samples`
   - `availableUsernames` when useful
   - optional diagnostic fields such as `sourceEndpoint` or `sourceShape`

6. Import mode should insert only new deduped rows into `customer_concepts`:
   - `status: 'history_import'`
   - `row_kind: 'history_import'`
   - `history_source: 'hagen_library'`
   - `concept_id: null`
   - TikTok URL/stats/description/timestamps when available

7. Improve UI error handling in `CustomerWorkspaceContent.tsx`:
   - Prefer `data.message` before `data.error`.
   - Handle non-JSON responses defensively.
   - Show useful Swedish error text when Hagen is unavailable, missing data, or
     the upstream contract is wrong.

8. Do not add Supabase migrations for this phase.

9. Do not touch unrelated `/admin/demos` work.

### Verification

Run at minimum in `hagen-ui`:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/letrend run typecheck
```

If `hagen` changes, run its relevant typecheck/build command as well.

Smoke expectations:

- No-auth POST still returns 401.
- Missing handle still returns 400.
- Preview with Hagen unavailable returns a structured JSON error.
- Preview with Hagen available returns JSON, not HTML.
- Preview does not write to Supabase.
- Import should only be tested live if preview clearly shows `wouldImport > 0`.
  If live import is tested, document customer ID and row counts before/after.

### Output

Create:

```text
hagen-ui/docs/agent-plans/59-hagen-library-sync-contract-alignment.md
```

Include:

- root cause
- selected contract between `hagen-ui` and `hagen`
- exact mapping from Hagen video/library row to `customer_concepts`
- files changed in each repo
- verification results
- live smoke result or explicit blocker
- remaining risks

When finished, commit and push coherent changes. If one repo changed and the
other did not, say that clearly in the phase doc.
