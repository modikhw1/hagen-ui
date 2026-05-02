# Studio Current-System Audit

## Scope
This audit is limited to current code in `hagen-ui` and focuses on:
- `/studio` routing and landing behavior
- role differences between `admin` and `content_manager`
- Studio shell navigation and layout behavior
- `/studio/customers`
- `/studio/customers/[id]`
- `/studio/concepts`
- `/studio/upload`
- `/studio/invoices`
- customer workspace sections and current support
- concept data sourcing
- invite, onboarding, demo, and pre-registration/pre-invite flows
- schema evidence where needed

## Confirmed Facts

### Routing, access, and shell
- `/studio` hard-redirects to `/studio/customers`. Evidence: `app/src/app/studio/page.tsx`.
- Middleware treats `/studio/**` as a protected area and allows `admin` and `content_manager`; non-studio users are redirected away. Evidence: `app/src/middleware.ts`, `app/src/lib/auth/navigation.ts`.
- `getPrimaryRouteForRole` sends `content_manager` to `/studio/customers` and `admin` to `/admin`. Evidence: `app/src/lib/auth/navigation.ts`.
- The Studio layout is client-side and uses the same shell for both `admin` and `content_manager`. The only explicit role-shaped UI difference in the shell is that `profile.is_admin` gets an `/admin` link. Evidence: `app/src/app/studio/layout.tsx`.
- Studio shell nav is static and currently exposes:
  - `Kundarbete` -> `/studio/customers`
  - `Konceptbibliotek` -> `/studio/concepts`
  - `Upload` -> `/studio/upload`
  - `Fakturor` -> `/studio/invoices`
  Evidence: `app/src/lib/studio/navigation.ts`, `app/src/app/studio/layout.tsx`.
- The Studio shell also exposes customer-workspace section links when the path matches `/studio/customers/:id`. Sections are `gameplan`, `koncept`, `feed`, `kommunikation`, `demo`. Evidence: `app/src/lib/studio/navigation.ts`, `app/src/app/studio/layout.tsx`.

### `/studio/customers`
- `/studio/customers` is a client component that fetches all rows from `customer_profiles` directly from Supabase and orders by `created_at desc`. There is no role-based scoping in this page. Evidence: `app/src/app/studio/customers/page.tsx`.
- The page filters by `status` and by the string field `account_manager`. Evidence: `app/src/app/studio/customers/page.tsx`.
- The page presents quick links into customer workspaces (`Game Plan`, `Feedplan`, `Kommunikation`) using `buildStudioWorkspaceHref`. Evidence: `app/src/app/studio/customers/page.tsx`, `app/src/lib/studio/navigation.ts`.
- Customer status values used in Studio are `pending`, `active`, `archived`, `invited`, `agreed`. Evidence: `app/src/lib/studio/customer-status.ts`, `app/src/types/studio-v2.ts`, `app/src/types/database.ts`.

### `/studio/customers/[id]`
- The route page itself is now only a thin wrapper around `CustomerWorkspaceContent`. Evidence: `app/src/app/studio/customers/[id]/page.tsx`.
- `CustomerWorkspaceContent` is still the actual workspace implementation and remains very large. Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- The workspace loads:
  - customer profile from `customer_profiles` via Supabase
  - game plan from `/api/studio-v2/customers/[customerId]/game-plan`
  - customer concept assignments from `/api/studio-v2/customers/[customerId]/concepts`
  - customer notes from `/api/studio-v2/customers/[customerId]/notes`
  - email log from `email_log` via Supabase
  - email jobs from `/api/studio-v2/email/jobs`
  - concept library from `conceptLoaderDB()`, with fallback to `conceptLoader()` JSON
  - feed spans from `/api/studio-v2/feed-spans`
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- The workspace has five confirmed sections:
  - `gameplan`
  - `koncept`
  - `feed`
  - `kommunikation`
  - `demo`
  Evidence: `app/src/lib/studio/navigation.ts`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- The workspace sidebar explicitly tells the user that customer details, pricing, and agreements are handled in Admin. Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/components/studio/customer-detail/CustomerDetailHeader.tsx`.

### Customer workspace capabilities already present
- `gameplan` supports:
  - loading/saving a rich-text Game Plan
  - editing with `GamePlanEditor`
  - rendering with `GamePlanDisplay`
  - showing whether data comes from `customer_game_plans` or legacy `customer_profiles.game_plan`
  - add/delete customer notes
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/app/api/studio-v2/customers/[customerId]/game-plan/route.ts`, `app/src/app/api/studio-v2/customers/[customerId]/notes/route.ts`.
- `koncept` supports:
  - listing customer-assigned concepts
  - adding a concept to the customer
  - deleting an assignment
  - status changes
  - opening a concept editor side panel
  - showing resolved script / why-it-works / instructions from overrides plus base concept
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/app/api/studio-v2/customers/[customerId]/concepts/route.ts`, `app/src/app/api/studio-v2/concepts/[conceptId]/route.ts`, `app/src/lib/studio-v2-concept-content.ts`.
- `feed` supports:
  - feed slot planning over `feed_order`
  - drag/drop assignment into slots
  - per-slot CM notes
  - tags
  - TikTok URL and metric fields
  - marking concepts produced
  - feed spans/seasonality overlays
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/components/studio/customer-detail/CustomerFeedSlot.tsx`, `app/src/app/api/studio-v2/feed/mark-produced/route.ts`, `app/src/app/api/studio-v2/feed-spans/route.ts`, `app/src/app/api/studio-v2/feed-spans/[spanId]/route.ts`.
- `kommunikation` supports:
  - templated email drafting
  - concept inclusion in outgoing emails
  - immediate send/log via `email_jobs` and `email_log`
  - viewing latest job status
  - retrying failed/canceled jobs by resetting job status to `queued`
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/components/studio/customer-detail/CustomerCommunicationPanel.tsx`, `app/src/app/api/studio-v2/email/send/route.ts`, `app/src/app/api/studio-v2/email/jobs/route.ts`, `app/src/app/api/studio-v2/email/jobs/[jobId]/route.ts`.
- `demo` supports:
  - public demo link `/demo/[customerId]`
  - feed timeline preview
  - import of TikTok history into negative `feed_order` slots
  Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/components/studio/customer-detail/CustomerDemoPanel.tsx`, `app/src/app/api/demo/import-history/route.ts`, `app/src/app/demo/[customerId]/page.tsx`.

### Partial decomposition of the customer workspace
- Extracted customer-detail components exist under `app/src/components/studio/customer-detail/`, including `CustomerDetailHeader.tsx`, `CustomerGamePlanPanel.tsx`, `CustomerConceptsList.tsx`, `CustomerCommunicationPanel.tsx`, and `CustomerDemoPanel.tsx`. Evidence: `app/src/components/studio/customer-detail/`.
- In the inspected render path, `CustomerWorkspaceContent.tsx` still renders inline section implementations (`GamePlanSection`, `KonceptSection`, `KommunikationSection`, inline demo markup) rather than these extracted panel components. Evidence: imports in `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` and section render code in the same file.

### `/studio/concepts`
- `/studio/concepts` is client-rendered and loads its concept list by dynamic-importing `@/lib/conceptLoader`, which reads `app/src/data/clips-priority.json`. Evidence: `app/src/app/studio/concepts/page.tsx`, `app/src/lib/conceptLoader.ts`.
- The page also fetches customers from `customer_profiles` and can assign a concept to a customer through `POST /api/studio-v2/customers/[customerId]/concepts`. Evidence: `app/src/app/studio/concepts/page.tsx`, `app/src/app/api/studio-v2/customers/[customerId]/concepts/route.ts`.
- The concepts page links to `/studio/concepts/[id]/edit`, not to `/studio/concepts/[id]`. Evidence: `app/src/app/studio/concepts/page.tsx`, `app/src/app/studio/upload/page.tsx`.
- `conceptLoader` is JSON-backed and `clips-priority.json` explicitly says its source is `hagen-main/scripts/export-to-hagen-ui.js`. Evidence: `app/src/lib/conceptLoader.ts`, `app/src/data/clips-priority.json`.

### Concept detail/edit routes
- `/studio/concepts/[id]/page.tsx` loads a concept from the JSON loader and its save path is stubbed with `// TODO: Save to database`. Evidence: `app/src/app/studio/concepts/[id]/page.tsx`.
- `/studio/concepts/[id]/edit/page.tsx` also loads the concept from the JSON loader, but saving uses `PUT /api/admin/concepts/[id]`. Evidence: `app/src/app/studio/concepts/[id]/edit/page.tsx`.
- `PUT /api/admin/concepts/[id]` requires `admin` only. `GET /api/admin/concepts/[id]` allows `admin` and `content_manager`, but `PUT` and `DELETE` are admin-only. Evidence: `app/src/app/api/admin/concepts/[id]/route.ts`.

### `/studio/upload`
- `/studio/upload` takes a TikTok URL and calls `NEXT_PUBLIC_HAGEN_API_URL`:
  - `POST /api/videos/upload`
  - `POST /api/videos/analyze/main`
  Evidence: `app/src/app/studio/upload/page.tsx`.
- After analysis, the page saves a concept through `POST /api/admin/concepts` and marks the new concept as source `cm_created`. Evidence: `app/src/app/studio/upload/page.tsx`, `app/src/app/api/admin/concepts/route.ts`.

### `/studio/invoices`
- `/studio/invoices` is client-rendered and fetches invoice rows from the `invoices` table plus customer names from `customer_profiles`. Evidence: `app/src/app/studio/invoices/page.tsx`.
- The page exposes a manual sync button that calls `POST /api/studio/stripe/sync-invoices`. Evidence: `app/src/app/studio/invoices/page.tsx`, `app/src/app/api/studio/stripe/sync-invoices/route.ts`.
- `POST /api/studio/stripe/sync-invoices` is allowed for both `admin` and `content_manager`. Evidence: `app/src/app/api/studio/stripe/sync-invoices/route.ts`.

### Concept data sources across Studio and customer surfaces
- `conceptLoader.ts` loads concepts from bundled JSON. Evidence: `app/src/lib/conceptLoader.ts`.
- `conceptLoaderDB.ts` loads from the `concepts` table and also provides `loadCustomerConcepts(customerProfileId)`. Evidence: `app/src/lib/conceptLoaderDB.ts`.
- The customer workspace prefers DB-backed concepts (`conceptLoaderDB`) and falls back to JSON only when DB returns zero concepts. Evidence: `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- Customer-facing concept/feed APIs do not use the JSON concept loader. They build responses from `customer_concepts` joined to `concepts`, then merge assignment-level overrides. Evidence: `app/src/app/api/customer/concepts/route.ts`, `app/src/app/api/customer/concepts/[conceptId]/route.ts`, `app/src/app/api/customer/feed/route.ts`, `app/src/lib/customer-feed.ts`, `app/src/lib/customer-concept-detail.ts`.
- `customer_concepts` currently acts as both:
  - the assignment/customization table for real concept assignments
  - the storage for imported demo/history rows with `concept_id = null`
  Evidence: `app/src/types/database.ts`, `app/src/app/api/demo/import-history/route.ts`.

### Schema evidence
- `concepts` has `backend_data`, `overrides`, `source`, `is_active`, version fields. Evidence: `app/src/types/database.ts`.
- `customer_concepts` has both legacy-style columns (`custom_headline`, `custom_script`, `notes`, `why_it_fits`, `filming_instructions`) and normalized `content_overrides`, plus feed/TikTok metadata and lifecycle timestamps. Evidence: `app/src/types/database.ts`.
- `customer_game_plans` exists as a dedicated table keyed one-to-one by `customer_id`. Evidence: `app/src/types/database.ts`.
- `customer_notes`, `email_jobs`, `email_log`, `feed_spans`, `customer_profiles`, and `profiles` all exist as first-class tables with the fields used by the Studio UI/API layer. Evidence: `app/src/types/database.ts`.
- `customer_profiles` still contains legacy-ish JSON columns such as `brief`, `game_plan`, and `concepts`, while normalized tables also exist. Evidence: `app/src/types/database.ts`.
- `profiles` includes `role`, `is_admin`, and also `stepper_inbound_token`. Evidence: `app/src/types/database.ts`.
- An `invites` table exists in schema. Evidence: `app/src/types/database.ts`.

### Invite, onboarding, demo, and pre-registration flows
- Admin customer creation and invite flow:
  - `POST /api/admin/customers` creates a `customer_profiles` row with `status: 'pending'`
  - `PATCH /api/admin/customers/[id]` with `action: 'send_invite'` can create Stripe customer/subscription, call `inviteUserByEmail`, and then mark the `customer_profiles` row as `invited`
  Evidence: `app/src/app/api/admin/customers/route.ts`, `app/src/app/api/admin/customers/[id]/route.ts`.
- The auth callback supports:
  - invited customer flow with password set
  - team-member invite flow
  - post-password profile creation/update via `/api/admin/profiles/setup`
  Evidence: `app/src/app/auth/callback/page.tsx`, `app/src/app/api/admin/profiles/setup/route.ts`, `app/src/app/api/admin/team/route.ts`.
- `POST /api/admin/profiles/setup` activates the linked `customer_profiles` row by setting `status: 'active'` and `agreed_at` when a `customer_profile_id` can be resolved. Evidence: `app/src/app/api/admin/profiles/setup/route.ts`.
- The onboarding/agreement/checkout flow is present and uses:
  - `localStorage` keys such as `pending_agreement_email` and `onboarding_customer_profile_id`
  - `/api/stripe/pending-agreement`
  - `/checkout` embedded Stripe flow
  Evidence: `app/src/app/welcome/page.tsx`, `app/src/app/onboarding/page.tsx`, `app/src/app/agreement/page.tsx`, `app/src/app/checkout/page.tsx`, `app/src/app/checkout/complete/page.tsx`, `app/src/app/api/stripe/pending-agreement/route.ts`.
- A separate simpler invite API also exists at `POST /api/auth/invite`; it creates a Supabase auth user and a `profiles` row, but it does not create or link a `customer_profiles` row. Evidence: `app/src/app/api/auth/invite/route.ts`.
- The public demo route `/demo/[customerId]` is server-rendered, does not require auth in this file, and only blocks archived customers. Evidence: `app/src/app/demo/[customerId]/page.tsx`.

## Route / Component / Data-Source Matrix

| Surface | Key route/component(s) | Current role access in code | Primary data source(s) | Confirmed current behavior | Confirmed note/mismatch |
| --- | --- | --- | --- | --- | --- |
| `/studio` | `app/src/app/studio/page.tsx` | `admin`, `content_manager` | none | Hard redirect to `/studio/customers` | No role-shaped landing |
| Studio shell | `app/src/app/studio/layout.tsx`, `app/src/lib/studio/navigation.ts` | `admin`, `content_manager` | `useAuth` profile | Shared nav for customers/concepts/upload/invoices; workspace section pills on customer pages | Only admin gets `/admin` link; no CM-specific shell |
| `/studio/customers` | `app/src/app/studio/customers/page.tsx` | `admin`, `content_manager` | `customer_profiles` via Supabase client | All customers listed; status and CM-string filtering; links into workspace | No scoping to assigned customers; filter uses `account_manager` string, not `account_manager_profile_id` |
| `/studio/customers/[id]` | `app/src/app/studio/customers/[id]/page.tsx`, `CustomerWorkspaceContent.tsx` | `admin`, `content_manager` | `customer_profiles`, `customer_game_plans`, `customer_notes`, `customer_concepts`, `email_log`, `email_jobs`, `feed_spans`, concept DB/JSON loaders | Full customer workspace with sections for gameplan, concept work, feed, communication, demo | Route page is thin, but main workspace component is still monolithic |
| `gameplan` section | `CustomerWorkspaceContent.tsx`, `GamePlanEditor`, `GamePlanDisplay` | `admin`, `content_manager` | `/api/studio-v2/customers/[id]/game-plan`, `/api/studio-v2/customers/[id]/notes`, `customer_profiles.brief` | Rich-text Game Plan plus notes and brief editing | New table and legacy mirror both active |
| `koncept` section | `CustomerWorkspaceContent.tsx`, `CustomerConceptDetail`, `CustomerConceptStatusEditor` | `admin`, `content_manager` | `/api/studio-v2/customers/[id]/concepts`, `/api/studio-v2/concepts/[conceptId]`, concept library from DB fallback JSON | Assignment list, status changes, add/remove, detail editing | Assignment content is merged from multiple override shapes |
| `feed` section | `CustomerWorkspaceContent.tsx`, `CustomerFeedSlot.tsx` | `admin`, `content_manager` | `customer_concepts`, `/api/studio-v2/feed/mark-produced`, `/api/studio-v2/feed-spans*`, CM tag/grid settings | Feed planning, spans, tags, TikTok metadata, publish markers | Uses same `customer_concepts` table for history/demo rows and real assignments |
| `kommunikation` section | `CustomerWorkspaceContent.tsx`, `CustomerCommunicationPanel.tsx` | `admin`, `content_manager` | `email_log`, `email_jobs`, `/api/studio-v2/email/send`, `/api/studio-v2/email/jobs*` | Draft/send/log/retry email workflows | Queue-shaped schema exists, but send path is immediate in inspected code |
| `demo` section | `CustomerWorkspaceContent.tsx`, `CustomerDemoPanel.tsx` | `admin`, `content_manager` | `/api/demo/import-history`, `/demo/[customerId]`, `customer_concepts` history rows | Public demo link and TikTok history import | Public route is customer-ID based and not gated here |
| `/studio/concepts` | `app/src/app/studio/concepts/page.tsx` | `admin`, `content_manager` | `conceptLoader()` JSON, `customer_profiles` for assignment modal | Library/grid view of base concepts; assign to customer | Library is JSON-backed, not DB-backed |
| `/studio/concepts/[id]` | `app/src/app/studio/concepts/[id]/page.tsx` | `admin`, `content_manager` | `conceptLoader()` JSON | Loads concept and shows editor UI | Save is TODO/stubbed; current Studio links do not target this route |
| `/studio/concepts/[id]/edit` | `app/src/app/studio/concepts/[id]/edit/page.tsx` | `admin`, `content_manager` page access | Load from `conceptLoader()` JSON; save to `/api/admin/concepts/[id]` | More complete edit page for base concept fields/translations | Save API is admin-only, so CM access is inconsistent |
| `/studio/upload` | `app/src/app/studio/upload/page.tsx` | `admin`, `content_manager` | `hagen-main` upload/analyze APIs, then `concepts` via `/api/admin/concepts` | Import TikTok URL, analyze externally, persist DB concept | Live external pipeline here, unlike `/studio/concepts` |
| `/studio/invoices` | `app/src/app/studio/invoices/page.tsx` | `admin`, `content_manager` | `invoices`, `customer_profiles`, `/api/studio/stripe/sync-invoices` | Invoice list and manual Stripe sync | Admin-like surface still exposed in Studio |
| `/demo/[customerId]` | `app/src/app/demo/[customerId]/page.tsx`, `DemoView.tsx` | Public in inspected route file | `customer_profiles`, `customer_game_plans`, `customer_concepts` | Public customer-facing demo with tabs for Game Plan and feed timeline | Only archived customers are blocked here |
| Invite/onboarding flow | `/api/admin/customers*`, `/auth/callback`, `/welcome`, `/onboarding`, `/agreement`, `/checkout` | Admin starts invite; customer completes onboarding; team invite handled separately | `customer_profiles`, `profiles`, Stripe APIs, localStorage | Pre-registration customer flow exists and activates linked customer profile on setup | There is also a separate `POST /api/auth/invite` path with a different model |

## Reusable Primitives Already Present
- `STUDIO_SHELL_NAV_ITEMS` and `STUDIO_WORKSPACE_SECTIONS` already define a stable shell/workspace taxonomy. Evidence: `app/src/lib/studio/navigation.ts`.
- `customer_game_plans` plus `resolveGamePlanDocument()` already give a clear boundary between dedicated Game Plan storage and legacy mirror behavior. Evidence: `app/src/app/api/studio-v2/customers/[customerId]/game-plan/route.ts`.
- `customer_concepts` normalization plus `resolveCustomerConceptContentOverrides()` and `resolveConceptContent()` already support customer-specific concept adaptation on top of base concepts. Evidence: `app/src/lib/studio/customer-concepts.ts`, `app/src/lib/customer-concept-overrides.ts`, `app/src/lib/studio-v2-concept-content.ts`.
- Feed-planner primitives already exist:
  - `CustomerFeedSlot`
  - `buildSlotMap`
  - `feed_spans`
  - `FeedTimeline`
  - `TagManager`
  Evidence: `app/src/components/studio/customer-detail/CustomerFeedSlot.tsx`, `app/src/lib/feed-planner-utils.ts`, `app/src/app/api/studio-v2/feed-spans/route.ts`, `app/src/components/studio/FeedTimeline.tsx`.
- Communication primitives already exist:
  - shared email templates
  - `email_jobs`
  - `email_log`
  - send/retry endpoints
  Evidence: `app/src/components/studio/customer-detail/shared.ts`, `app/src/app/api/studio-v2/email/send/route.ts`, `app/src/app/api/studio-v2/email/jobs/route.ts`, `app/src/app/api/studio-v2/email/jobs/[jobId]/route.ts`.
- Demo/prep primitives already exist:
  - public demo route
  - demo import-history API
  - timeline rendering
  Evidence: `app/src/app/demo/[customerId]/page.tsx`, `app/src/app/api/demo/import-history/route.ts`, `app/src/components/studio/FeedTimeline.tsx`.
- Extracted customer-detail panel components already exist on disk even though the main workspace render path still inlines similar logic. Evidence: `app/src/components/studio/customer-detail/`.

## Confirmed Role Mismatches
- Both `admin` and `content_manager` land on the same `/studio/customers` page even though `getPrimaryRouteForRole()` distinguishes admin vs Studio at the app-root level. Evidence: `app/src/lib/auth/navigation.ts`, `app/src/app/studio/page.tsx`.
- Studio shell nav is the same for `admin` and `content_manager`; there is no CM-specific landing, filtering, or reduced tool surface in the shell itself. Evidence: `app/src/app/studio/layout.tsx`, `app/src/lib/studio/navigation.ts`.
- `/studio/customers` shows all customers to `content_manager`; it does not scope by `account_manager_profile_id` or logged-in user. Evidence: `app/src/app/studio/customers/page.tsx`.
- A role-shaped dashboard API already exists (`/api/studio-v2/dashboard`) with `myCustomersCount` and recent assigned customers, but no current Studio route consumes it. Evidence: `app/src/app/api/studio-v2/dashboard/route.ts`.
- `/studio/invoices` and `/api/studio/stripe/sync-invoices` are available to `content_manager` even though the Studio shell copy says admin is separate for org-level/drift, and an admin invoices area also exists. Evidence: `app/src/app/studio/layout.tsx`, `app/src/app/studio/invoices/page.tsx`, `app/src/app/api/studio/stripe/sync-invoices/route.ts`, `app/src/app/admin/invoices/page.tsx`.
- `/studio/concepts/[id]/edit` is accessible as part of Studio, but its save API is admin-only. A `content_manager` can reach the page but cannot complete the save path in current code. Evidence: `app/src/app/studio/concepts/[id]/edit/page.tsx`, `app/src/app/api/admin/concepts/[id]/route.ts`.

## Confirmed Data-Source Mismatches
- Base concept library sources differ by surface:
  - `/studio/concepts` uses bundled JSON via `conceptLoader`
  - `/studio/customers/[id]` concept picker/details prefer DB via `conceptLoaderDB`, then fall back to JSON
  - `/studio/upload` creates live DB concepts via `hagen-main` + `/api/admin/concepts`
  - customer-facing `/api/customer/*` surfaces read from DB assignments
  Evidence: `app/src/app/studio/concepts/page.tsx`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`, `app/src/app/studio/upload/page.tsx`, `app/src/app/api/customer/concepts/route.ts`, `app/src/app/api/customer/feed/route.ts`.
- Base concept editing is internally inconsistent:
  - `/studio/concepts/[id]` is JSON-backed with stub save
  - `/studio/concepts/[id]/edit` is JSON-backed on load but DB-backed on save
  Evidence: `app/src/app/studio/concepts/[id]/page.tsx`, `app/src/app/studio/concepts/[id]/edit/page.tsx`.
- Customer concept customization spans both normalized and legacy fields:
  - `content_overrides`
  - `custom_*`
  - `why_it_fits`
  - `filming_instructions`
  - `notes` / `cm_note`
  Evidence: `app/src/types/database.ts`, `app/src/lib/customer-concept-overrides.ts`, `app/src/lib/studio/customer-concepts.ts`.
- Game Plan storage also spans both normalized and legacy shapes:
  - `customer_game_plans`
  - `customer_profiles.game_plan`
  Evidence: `app/src/app/api/studio-v2/customers/[customerId]/game-plan/route.ts`, `app/src/types/database.ts`.
- Account-manager data is also dual-shaped:
  - Studio customers page filters on `customer_profiles.account_manager` string
  - dashboard-style APIs use `customer_profiles.account_manager_profile_id`
  Evidence: `app/src/app/studio/customers/page.tsx`, `app/src/app/api/studio-v2/dashboard/route.ts`, `app/src/lib/studio/account-manager.ts`.
- Invite systems are split:
  - admin customer invite flow is `customer_profiles` + Stripe + `inviteUserByEmail`
  - `POST /api/auth/invite` creates auth user + `profiles` row directly
  Evidence: `app/src/app/api/admin/customers/[id]/route.ts`, `app/src/app/api/auth/invite/route.ts`.

## Confirmed Pre-Invite / Onboarding / Demo Findings
- A customer can exist in `customer_profiles` before registration. `POST /api/admin/customers` creates `status: 'pending'` rows before any auth account is linked. Evidence: `app/src/app/api/admin/customers/route.ts`.
- Admin invite flow upgrades that pre-registration customer row to `status: 'invited'` and stores invite/billing fields on `customer_profiles`. Evidence: `app/src/app/api/admin/customers/[id]/route.ts`.
- `profiles.setup` later activates the linked `customer_profiles` row to `status: 'active'` and stamps `agreed_at`. Evidence: `app/src/app/api/admin/profiles/setup/route.ts`.
- The Studio customer list and customer-status helper already understand `pending`, `invited`, `agreed`, `active`, and `archived`, so pre-registration/pre-activation customers are already first-class in Studio list data. Evidence: `app/src/app/studio/customers/page.tsx`, `app/src/lib/studio/customer-status.ts`.
- The Studio demo section explicitly supports pre-seeding a customer demo and importing historical clips before a customer logs in. Evidence: `app/src/components/studio/customer-detail/CustomerDemoPanel.tsx`, `app/src/app/api/demo/import-history/route.ts`.
- Public demo pages can already be served from customer-profile-backed data without customer authentication. Evidence: `app/src/app/demo/[customerId]/page.tsx`.
- Customer onboarding is stateful and relies on client `localStorage` continuity across `/welcome` -> `/onboarding` -> `/agreement` -> `/checkout`. Evidence: `app/src/app/welcome/page.tsx`, `app/src/app/onboarding/page.tsx`, `app/src/app/agreement/page.tsx`, `app/src/app/checkout/page.tsx`.
- Team-member invite flow is separate from customer onboarding and creates/updates `profiles.role` to `content_manager` or `admin`. Evidence: `app/src/app/api/admin/team/route.ts`, `app/src/app/auth/callback/page.tsx`, `app/src/app/api/admin/profiles/setup/route.ts`.

## Inference
- The current Studio implementation is customer-workspace-first, not intake-first. This is based on the hard redirect to `/studio/customers`, the static shell nav, and the amount of functionality concentrated in `/studio/customers/[id]`. Evidence: `app/src/app/studio/page.tsx`, `app/src/app/studio/layout.tsx`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- The codebase already contains many primitives that fit a CM workbench, but they are concentrated inside the per-customer workspace rather than expressed as a CM-shaped front door. Evidence: customer workspace sections plus `/api/studio-v2/dashboard` existing without a current route consumer.
- The customer-workspace refactor is only partial. The route page is thin and extracted panels exist, but the main implementation still lives in a single large `CustomerWorkspaceContent.tsx` file. Evidence: `app/src/app/studio/customers/[id]/page.tsx`, `app/src/components/studio/customer-detail/`, `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`.
- Current base-concept handling mixes at least three modes:
  - bundled/exported concept snapshots
  - live DB concepts
  - customer assignment adaptations
  This appears to be the main concept-architecture inconsistency in the current system. Evidence: `conceptLoader.ts`, `conceptLoaderDB.ts`, `customer_concepts`, `/studio/upload`, `/api/customer/*`.

## Unknowns
- Which invite path is canonical for real customer onboarding: admin customer invite (`/api/admin/customers/[id]`) or the simpler `/api/auth/invite` path?
- Whether public `/demo/[customerId]` exposure is intentionally open for all non-archived customers or is only a temporary convenience.
- Whether `content_manager` should see all customers or only customers linked through `account_manager_profile_id`.
- Whether `conceptLoader` JSON is meant to remain a production source, a cache/export format, or only a migration bridge.
- Whether `/studio/concepts/[id]` is intentionally retained as an orphan/stub route or should be removed/redirected.
- Whether `email_jobs` is processed by infrastructure outside this repo. In the inspected codebase, jobs are created, read, and reset to `queued`, but no worker/consumer was found in `app/src`.
- Whether the schema-only `invites` table is still part of the active product flow. No inspected Studio/customer/onboarding route used it directly.
- Whether `profiles.stepper_inbound_token` is active. It appears in schema only and was not referenced in inspected app code.
- Whether history rows with `customer_concepts.concept_id = null` are the intended long-term storage model for imported demo/history clips.

## Open Technical Questions
- Should `/studio` remain a single redirect target for both `admin` and `content_manager`, or should the existing role-routing infrastructure be used here?
- Should `/studio/customers` read all `customer_profiles`, or should the current page move to `account_manager_profile_id`-based scoping for `content_manager`?
- Should base-concept edit rights for `content_manager` be aligned with the current Studio UI, or should the edit UI be restricted?
- Should the concept library be switched to DB-first everywhere before more Studio IA changes are made?
- What is the intended deprecation path for:
  - `customer_profiles.game_plan`
  - `customer_profiles.concepts`
  - `customer_concepts.custom_*`
  - `customer_concepts.notes`
  - `customer_concepts.feed_slot`
- Should imported TikTok history/demo rows remain in `customer_concepts`, or should they become a separate object/table?
- Is the unused `/api/studio-v2/dashboard` route intended to back a future Studio landing, or is it stale?
