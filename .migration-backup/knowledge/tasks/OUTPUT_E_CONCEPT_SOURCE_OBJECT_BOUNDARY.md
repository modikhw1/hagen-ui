# Output E - Concept Source / Object Boundary

## Executive answer

The repo has two different truths today:

- The **UI truth for `/studio/concepts`** is still the bundled JSON export in [`app/src/data/clips-priority.json`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\data\clips-priority.json), loaded through [`app/src/lib/conceptLoader.ts`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\lib\conceptLoader.ts).
- The **operational truth for real Studio/customer workflows** is the database, mainly `concepts` plus `customer_concepts`.

So the current Studio concept library page is not showing the same source that upload, customer assignment, feed planning, and customer-facing surfaces actually use.

The safest forward path is:

1. make `/studio/concepts` read DB-first
2. keep JSON only as a short-term fallback for legacy/demo surfaces
3. stop using JSON-backed concept edit routes as if they were authoritative
4. postpone deeper schema/object cleanup until after the read path is corrected

## 1. Current source-of-truth map

| Surface | Current source | Actual behavior | Assessment |
| --- | --- | --- | --- |
| `/studio/concepts` | `conceptLoader()` -> `clips-priority.json` | Client page dynamically imports JSON concepts and reverses the list | JSON-first, not operational truth |
| `/studio/concepts/[id]` | `conceptLoader.loadConceptById()` | Loads JSON concept only; save is stubbed | Legacy/stub route |
| `/studio/concepts/[id]/edit` | Load from JSON, save to DB via `/api/admin/concepts/[id]` | Read path and write path do not match | Internally inconsistent |
| `/studio/upload` | `hagen-main` APIs -> `/api/admin/concepts` -> `concepts` table | Upload/analyze creates real DB concept rows | DB-first |
| `/studio/customers/[id]` concept picker/details | `conceptLoaderDB.loadConcepts()` first, JSON fallback second | Customer workspace prefers DB concepts for base details | Mostly DB-first |
| `/api/studio-v2/customers/[customerId]/concepts` | `customer_concepts` table | Returns assignment rows, not base concepts | Assignment truth |
| `/api/studio-v2/concepts/[conceptId]` | `customer_concepts` table | Updates assignment row and content overrides | Assignment truth |
| `/api/customer/concepts` | `customer_concepts` joined to `concepts` | Customer-facing assigned concept list is DB-based | DB-first |
| `/api/customer/concepts/[conceptId]` | `customer_concepts` joined to `concepts` | Customer-facing concept detail is assignment-first, DB-based | DB-first |
| `/api/customer/feed` | `customer_concepts` joined to `concepts` | Customer feed is derived from assignment rows plus feed fields | DB-first |
| Customer demo mode in `CustomerConceptDetailView` | `conceptLoader()` JSON fallback | `?demo=true` uses JSON concept IDs directly | Demo-only legacy leakage |
| Customer dashboard/demo profile utilities | `conceptLoader()` JSON | Legacy/demo dashboard still expects JSON concept data | Not Studio truth, but still active |

## 2. What the current objects actually mean

### `concepts`
Today `concepts` is the closest thing to a **base concept** table.

What a row contains:

- `id`
- `source`
- `created_by`
- `backend_data`
- `overrides`
- `is_active`
- `version`
- `previous_version`

What it represents in practice:

- a reusable analyzed clip/reference
- raw analysis payload from `hagen-main` in `backend_data`
- translated/curated UI-facing fields in `overrides`
- versioned base library content

Important nuance:

- `source` is only `hagen` or `cm_created`
- upload-created concepts are stored as `cm_created` even though the analysis came from `hagen-main`
- there is no explicit “imported but not yet analyzed” object here

### `customer_concepts`
Today `customer_concepts` is a mixed table that acts as:

- customer assignment table
- customer adaptation table
- feed placement table
- produced/published tracking table
- demo/history slot table

What a row contains today:

- assignment identity: `id`, `customer_profile_id`, `customer_id`, `concept_id`, `cm_id`
- adaptation content: `content_overrides`, `custom_*`, `why_it_fits`, `filming_instructions`
- workflow state: `status`, `added_at`, `sent_at`, `produced_at`, `published_at`
- feed state: `feed_order`, `feed_slot`
- CM metadata: `tags`, `cm_note`, `notes`, `collection_id`
- published/history metadata: `tiktok_url`, `tiktok_thumbnail_url`, `tiktok_views`, `tiktok_likes`, `tiktok_comments`, `tiktok_watch_time_seconds`

What it represents in practice:

- normally: “this customer has this concept assigned, maybe customized, maybe placed in feed”
- sometimes: “this customer has a produced/history clip with no underlying base concept”

### JSON concept export
[`clips-priority.json`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\data\clips-priority.json) is a bundled export snapshot from `hagen-main/scripts/export-to-hagen-ui.js`.

It represents:

- exported analyzed clips
- override/default translation data
- a legacy/static concept library source

It does **not** represent:

- customer assignments
- feed placement
- live edited DB concepts

### History/demo rows with `concept_id = null`
These are real `customer_concepts` rows introduced by [`app/supabase/migrations/019_demo_features.sql`](C:\Users\praiseworthy\Desktop\hagen-ui\app\supabase\migrations\019_demo_features.sql).

They represent:

- imported TikTok history for demo/feed timeline
- negative `feed_order` history slots
- produced/published result content without a base concept row

This is explicit overloading of `customer_concepts`, not a separate demo/history object.

### Overrides/content fields
Current override semantics are dual-shaped.

There is a normalized direction:

- `content_overrides`

But the app still also reads/writes legacy columns:

- `custom_headline`
- `custom_description`
- `custom_script`
- `custom_why_it_works`
- `custom_instructions`
- `custom_target_audience`
- `why_it_fits`
- `filming_instructions`
- `notes`

[`app/src/lib/customer-concept-overrides.ts`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\lib\customer-concept-overrides.ts) resolves and projects between these shapes, and [`app/src/app/api/studio-v2/concepts/[conceptId]/route.ts`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\app\api\studio-v2\concepts\[conceptId]\route.ts) dual-writes them.

## 3. Current rows/fields by intended layer

| Intended layer | Current representation | Evidence | Assessment |
| --- | --- | --- | --- |
| Imported clip | No first-class object | Upload goes straight from TikTok URL -> `hagen-main` analysis -> `concepts` insert | Missing |
| Base concept | `concepts` row | `backend_data` + `overrides` + `version` | Clearly represented |
| Customer-adapted concept | `customer_concepts` row with `concept_id != null` plus overrides/custom fields | `content_overrides`, `custom_*`, `why_it_fits`, `filming_instructions` | Clearly represented, but messy |
| Feed placement | Embedded in `customer_concepts` | `feed_order`, legacy `feed_slot`, status timestamps | Partially represented / collapsed |
| Demo/history content | `customer_concepts` row with `concept_id = null` and negative `feed_order` | `/api/demo/import-history` + migration 019 | Clearly represented, but overloaded |
| Customer-visible artifact | Derived response, not first-class stored object | `/api/customer/concepts`, `/api/customer/feed`, `/lib/customer-feed.ts`, `/lib/customer-concept-detail.ts` | Partially represented / derived |

## 4. Object-boundary assessment

### Imported clip
Status: **missing**

Current code has no persistent pre-analysis intake object.

Implication:

- Studio cannot support lightweight intake/triage cleanly yet
- upload currently promotes directly into a base concept row

### Base concept
Status: **clearly represented**

`concepts` is the actual base concept layer today.

### Customer-adapted concept
Status: **clearly represented, but collapsed with other concerns**

`customer_concepts` does hold customer-specific adaptation, but the same row also carries feed and result/history data.

### Feed placement
Status: **partially represented / collapsed**

There is no dedicated placement object. Placement is embedded in:

- `customer_concepts.feed_order`
- `customer_concepts.feed_slot`
- status/timestamp fields

This is workable for v1, but it means assignment, adaptation, and placement are tightly coupled.

### Customer-visible artifact
Status: **partially represented / derived**

Customer-visible concept/feed payloads are built at API read time from:

- `customer_concepts`
- joined `concepts`
- override resolution helpers

That means there is no separate “published concept card” or “shared artifact” object yet.

## 5. Main inconsistencies and risks

### 1. `/studio/concepts` is detached from operational truth
The list page still uses JSON while:

- upload writes DB concepts
- customer workspace prefers DB concepts
- customer-facing APIs are DB-first

Risk:

- newly uploaded concepts may not appear in the Studio library page unless separately exported into JSON
- the Studio library can drift from real assignment/customer data

### 2. Concept edit routes are not coherent
[`/studio/concepts/[id]/page.tsx`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\app\studio\concepts\[id]\page.tsx):

- loads JSON
- does not really save

[`/studio/concepts/[id]/edit/page.tsx`](C:\Users\praiseworthy\Desktop\hagen-ui\app\src\app\studio\concepts\[id]\edit\page.tsx):

- loads JSON
- saves to DB
- exposes many fields that are not round-tripped safely

Risk:

- the user thinks they are editing the live concept, but they are editing a translated snapshot
- the form allows editing raw-analysis-like fields that are not actually persisted

### 3. The edit form is a false full-editor
The edit page exposes fields like:

- English headline/description
- `humor_analysis`
- `replicability_signals`
- `scene_breakdown`
- `origin_country`

But save only sends an `overrides` payload, not a full `backend_data` replacement.

Risk:

- many visible changes do not persist at all
- even if reads move to DB, the form remains misleading unless narrowed or rewritten

### 4. `customer_concepts` is carrying too many object meanings
Today the same table stores:

- assignment
- adaptation
- feed position
- lifecycle/result timestamps
- imported demo/history clips with no base concept

Risk:

- every new feature touches the same row shape
- boundary decisions become harder later
- history/demo behavior can leak into assignment logic

### 5. Override storage is dual-written and easy to drift
The app still maintains both:

- `content_overrides`
- legacy `custom_*` / `why_it_fits` / `filming_instructions` columns

Risk:

- inconsistent reads/writes if a future route only updates one shape
- more normalization logic in every concept surface

### 6. Permissions are inconsistent for CM
Current truth:

- `content_manager` can create concepts via `POST /api/admin/concepts`
- `content_manager` can open Studio edit page
- `content_manager` cannot save via `PUT /api/admin/concepts/[id]` because that route is admin-only

Risk:

- Studio suggests CM base-concept editing is supported, but the save path fails

### 7. `conceptLoaderDB.loadCustomerConcepts()` is stale
It is unused and still assumes older semantics such as:

- status `active`
- older custom field behavior

Risk:

- it looks like an available abstraction, but it is not a reliable contract for future work

## 6. Safest v1 correction path for `/studio/concepts`

## Principle
Fix the **read path first**, not the whole concept model.

The safe goal for v1 is:

- `/studio/concepts` should reflect real DB concepts
- assignment/customer APIs should keep working unchanged
- no schema migration should be required for the first correction

## Recommended path

### Slice 1. Make `/studio/concepts` DB-first
Change the library page to read from the `concepts` table, not `clips-priority.json`.

Safest implementation shape:

- use `GET /api/admin/concepts` as the Studio list source
- translate returned rows into the existing `TranslatedConcept` display shape with `translateClipToConcept`
- preserve current card UI and assignment modal

Why this is safer than continuing with `conceptLoader()`:

- it uses the same persistence layer as upload and customer-facing flows
- it keeps auth/permissions server-mediated
- it avoids building more Studio behavior on top of exported JSON

### Slice 2. Keep JSON as a temporary fallback, but only as fallback
Do not delete `conceptLoader` immediately.

Use JSON only for:

- explicit fallback when DB returns empty/unavailable
- legacy demo/dashboard surfaces that still depend on it

Do not keep JSON as the primary Studio library source.

### Slice 3. Stop treating `/studio/concepts/[id]` as a real editor
Safest short-term move:

- redirect `/studio/concepts/[id]` to `/studio/concepts/[id]/edit`, or
- make `/studio/concepts/[id]` a read-only detail page

Do not preserve a stub save route pretending to edit live data.

### Slice 4. Make the edit route DB-first on read
The edit page should load the real concept row from `GET /api/admin/concepts/[id]`, not a translated JSON concept.

That allows:

- real DB-backed detail
- correct `backend_data` / `overrides` separation
- fewer silent mismatches between visible fields and persisted fields

### Slice 5. Narrow the edit surface before expanding it
Do **not** keep the current “full analysis editor” unless backend_data editing is genuinely implemented.

Safest v1 choice:

- only expose fields that are actually stored in `overrides`
- remove or disable editing for raw analysis/scene fields unless the save path sends `backend_data`

This avoids false affordances.

### Slice 6. Align CM vs admin permissions explicitly
Before expanding base-concept editing, choose one of these and make the UI match it:

- admin-only base concept editing
- CM can edit base concepts too

Safest immediate path:

- keep DB concept edits admin-only
- hide or disable save/edit affordances for non-admin CM on base concept pages

Why:

- it avoids changing permission policy at the same time as data-source migration
- assignment editing for CM already exists safely in `customer_concepts`

### Slice 7. Leave `customer_concepts` schema alone for the first correction
Do not split feed placement/history into new tables as part of the `/studio/concepts` migration.

Why:

- `/studio/concepts` only needs the base concept source fixed first
- assignment/feed/history cleanup is a separate object-boundary exercise

## 7. What can be fixed now without schema changes

- `/studio/concepts` DB-first list loading
- `/studio/concepts/[id]` DB-first detail loading or redirect
- `/studio/concepts/[id]/edit` DB-first load path
- explicit JSON fallback behavior
- hiding/disabling base-concept edit save for non-admin if permissions remain unchanged
- trimming the edit form to actual persisted override fields

## 8. What should wait for deeper object-model work

- imported clip / intake table
- splitting feed placement from `customer_concepts`
- splitting demo/history rows from `customer_concepts`
- removing legacy override columns
- introducing a first-class customer-visible artifact object
- changing source semantics beyond `hagen` / `cm_created`

## 9. Recommended follow-up sequence

### 1. DB-first read correction

- `/studio/concepts` -> DB-first
- `/studio/concepts/[id]` -> DB-first or redirect
- `/studio/concepts/[id]/edit` -> DB-first load

### 2. Edit-route honesty pass

- remove unsaved fields from the editor, or
- implement true `backend_data` editing
- align CM/admin permissions with the visible UI

### 3. Legacy fallback isolation

- keep `conceptLoader` only for demo/dashboard legacy cases
- stop using it in Studio routes

### 4. Object-boundary cleanup later

- imported clip layer
- assignment vs feed vs history split
- override column deprecation

## Final conclusion

The current base concept truth in the product is **not** the JSON export, even though `/studio/concepts` still uses it. The real operational truth is:

- `concepts` for base concepts
- `customer_concepts` for customer assignment/adaptation/feed/history

That means the safest next move is not a schema rewrite. It is to make Studio concept routes read from the same DB objects the rest of the product already depends on, while keeping JSON only as a temporary legacy/demo fallback and tightening the misleading edit surface before more Studio work is built on it.
