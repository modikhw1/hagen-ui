# Phase 39 — Existing Concept Re-ingest & Review Workflow

## What Phase 39 Built

Phase 39 added `POST /api/studio/concepts/:id/reanalyze` — an Express route that lets CMs trigger a fresh AI analysis pass on a concept that already exists in the database. The result is surfaced on the existing concept review page (`/studio/concepts/:id/review`) as a suggestion panel. No data is written to the database by the route itself.

### Route: `POST /api/studio/concepts/:id/reanalyze`

- Requires `requireAuth` + `requireRole(['admin', 'content_manager'])`.
- Fetches the concept's `backend_data` and `overrides` from Supabase (read-only).
- Chooses one of two strategies:
  - **`full_reanalyze`** — when a source URL is found in `backend_data`. Calls Hagen `/analyze` then `/enrich`.
  - **`enrich_only`** — when no source URL is found but `backend_data` has content. Calls Hagen `/enrich` only.
- Returns `{ strategy, backend_data, suggested_overrides }` — a pure data payload. **No `.update`, `.insert`, or `.upsert` calls are made.**

### No-Write Contract

The route is provably read-only with respect to Supabase. The single Supabase call is:

```typescript
supabase.from('concepts').select('id, backend_data, overrides, source').eq('id', conceptId).single()
```

The response data travels only to the Express response, never back into any Supabase write method.

### Review Page (Frontend)

`/studio/concepts/:id/review/page.tsx` stores the reanalyze result in two React state variables:

| State | Purpose |
|---|---|
| `pendingReanalyzeBackendData` | Fresh `backend_data` from Hagen — held until CM saves |
| `reanalyzeSuggestions` | Suggested override values displayed in the suggestion panel |

AI suggestions are **display-only** until the CM explicitly clicks "Tillämpa" (apply individual) or "Tillämpa alla" (apply all). Clicking applies the value to the form state only — it is not persisted until the CM clicks the main "Spara" button.

When the CM clicks "Spara" with pending reanalyze data, the PATCH payload includes `backend_data: pendingReanalyzeBackendData` alongside the standard `overrides`. This is the only moment data reaches Supabase.

### Fields That Were Safe Suggestions (Phase 39)

Fields surfaced as individual suggestions in Phase 39:

| Field | Description |
|---|---|
| `script_mode` | Scripted / text overlay / visual only |
| `setup_complexity` | Point-and-shoot → elaborate staging |
| `skill_required` | Anyone → professional actor |
| `setting` | Any venue → specific setting |

### Fields That Were Never Auto-Overwritten

The following fields are always CM-controlled and were never touched by the reanalyze route:

- `headline_sv`, `description_sv`, `whyItWorks_sv` — subjective editorial copy
- `script_sv` / `manus` — script content
- `productionNotes_sv`, `whyItFits_sv` — curated lists
- `market` — market targeting decision

### Known Gaps After Phase 39

1. Source URL extraction only checked `backend_data.url` and `backend_data.source_url` — other common keys (`sourceUrl`, `video_url`, `tiktok_url`) were missed.
2. GCS URI extraction only checked `backend_data.gcs_uri` — other variants missed.
3. `peopleNeeded`, `difficulty`, `filmTime`, `businessTypes` were not exposed as suggestions despite being safe objective fields.
4. Hagen error normalization was inline in the route handler — not unit-testable in isolation.
5. No unit tests covered the URL extraction or suggestion-building logic.
6. `buildSuggestedOverrides` did not filter out keys already in `confirmed overrides` — could technically propose overwriting a CM's earlier choice.
