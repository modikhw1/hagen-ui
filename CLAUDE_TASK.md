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

## Current Task: Phase 60 - Safe Hagen Clip Handle Matching

### Context

Phase 59 aligned the hagen-ui to Hagen contract by adding this Hagen route:

```text
GET /api/studio-v2/customers/:customerId/hagen-clips
```

and by improving hagen-ui UI error handling.

However, the current hagen-ui matching logic is still unsafe:

```ts
const matchedClips = allClipsWithUrl.filter(
  (c) =>
    !c.source_username ||
    c.source_username.replace(/^@/, '').toLowerCase() === handle.toLowerCase(),
);
```

That means clips with no `source_username` are treated as matches for every
customer. If Hagen returns library clips without a parsed username, hagen-ui can
preview/import unrelated TikTok history rows for the wrong customer.

The Phase 59 doc already notes this risk. Phase 60 should fix it before any
live import smoke is trusted.

### Read First

In `hagen-ui`:

- `docs/agent-plans/58-hagen-library-sync-history-post-route.md`
- `docs/agent-plans/59-hagen-library-sync-contract-alignment.md`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

In `hagen`:

- `src/app/api/studio-v2/customers/[customerId]/hagen-clips/route.ts`

### Goal

Make Hagen-library import safe by requiring a positive handle match. A clip may
only be previewed/imported for a customer when the system can tie the clip to
the customer's TikTok handle by metadata username or by parsing the TikTok URL.

### Required Behavior

1. Add reusable helpers in hagen-ui server code near the sync-history route:
   - `normalizeTikTokHandle(value: unknown): string`
   - `extractTikTokUsernameFromUrl(url: string): string | null`
   - `resolveClipUsername(clip): string | null`
   - `clipMatchesHandle(clip, handle): boolean`

2. Matching rule:
   - Normalize the customer's `tiktok_handle`.
   - Normalize `clip.source_username` when present.
   - If `clip.source_username` is missing, parse username from TikTok URL.
   - Match only when resolved username equals customer handle.
   - Do not match/import clips where username cannot be resolved.

3. Update `availableUsernames`:
   - Include usernames resolved from `source_username`.
   - Include usernames parsed from TikTok URLs.
   - Deduplicate and sort if practical.

4. Update preview samples if useful:
   - Keep existing fields.
   - Add optional `resolved_username` or `match_source` only if it helps debug
     without cluttering UI.

5. Update the Hagen endpoint:
   - Add URL username fallback when `metadata.author.uniqueId`,
     `metadata.author.username`, and `metadata.username` are missing.
   - Optional but preferred: support `?handle=username` to filter results server
     side. If added, hagen-ui should pass the handle query param.
   - Even if Hagen filters, hagen-ui must still validate matches itself.

6. Do not change Supabase schema.

7. Do not touch unrelated `/admin/demos` work.

### Verification

Run in `hagen-ui`:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/letrend run typecheck
```

If `hagen` changes, run its relevant typecheck/build command as well.

Add focused tests if there is an obvious local test pattern. If not, document
manual/code-level verification in the phase doc, including at least these cases:

- `@customer` matches `source_username: customer`
- `customer` matches `source_username: @customer`
- missing `source_username` matches URL `https://www.tiktok.com/@customer/video/...`
- missing `source_username` with URL for another handle does not match
- missing `source_username` with unparseable URL does not match
- `availableUsernames` includes URL-derived usernames

### Output

Create:

```text
hagen-ui/docs/agent-plans/60-safe-hagen-clip-handle-matching.md
```

Include:

- root cause
- exact matching rule after the fix
- whether Hagen got `?handle=` filtering
- files changed in each repo
- verification results
- remaining risks

When finished, commit and push coherent changes. If one repo changed and the
other did not, say that clearly in the phase doc.
