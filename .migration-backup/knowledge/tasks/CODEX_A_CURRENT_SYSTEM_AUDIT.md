# Codex A — Current-System Audit

## Mission
Inspect the current `hagen-ui` repo and produce a strict current-system audit for Studio.

Your primary job is to establish what is true in code now.
Do not start from product ideals except when explicitly comparing them against the current system.

## Focus areas
- `/studio` routing and landing behavior
- role differences between `admin` and `content_manager`
- Studio shell navigation and layout behavior
- `/studio/customers`
- `/studio/customers/[id]`
- `/studio/concepts`
- `/studio/upload`
- `/studio/invoices`
- customer workspace sections and what they already support
- concept data sourcing (`conceptLoader`, DB-backed loaders, APIs, `hagen-main` integration)
- invite, onboarding, demo, and any pre-registration/pre-invite flows
- relevant customer/concept/profile schema evidence where needed

## Important known anchors to verify or refine
- `/studio` currently redirects to `/studio/customers`
- Studio is available to `admin` and `content_manager`
- Studio shell nav currently includes customers, concepts, upload, invoices
- `/studio/concepts` appears to use `conceptLoader` rather than live source
- customer workspace sections include gameplan, koncept, feed, kommunikation, demo
- upload already integrates with `hagen-main` for video upload/analysis

Treat these as hypotheses to verify, not as unquestioned truth.

## Required method
- distinguish **confirmed facts**, **inference**, and **unknowns**
- cite the files/routes/components/APIs that support each claim
- prefer route/component/data-contract tracing over broad summaries
- identify what is reusable as-is versus what is clearly mismatched

## Deliverables

### 1. Confirmed current system
A concise but evidence-backed summary of how Studio works today.

### 2. Route/component/data-source matrix
For each major Studio surface, include:
- route
- key component(s)
- intended role(s) in current code
- primary data source(s)
- notable issues or mismatches

### 3. Reusable primitives already present
Identify current parts that already align with a CM-first future.
Examples may include customer workspace primitives, planning affordances, notes, demo areas, etc.

### 4. Role mismatches
Identify where current Studio behavior appears more admin-shaped than CM-shaped, or vice versa.

### 5. Data-source mismatches
Identify where the current data source contradicts the intended architecture.
Especially note local JSON, Supabase tables, and `hagen-main` interactions.

### 6. Pre-invite / onboarding findings
Document whether pre-invite, invite, unregistered customer, or demo-prep flows already exist in some form.

### 7. Open technical questions
List unresolved questions that block safe implementation decisions.

## Guardrails
- do not propose broad redesign as the main output
- do not rewrite product strategy
- do not implement code unless explicitly asked later
- be conservative about claims
- mark uncertain interpretations as uncertain

## Useful starting points
- `app/src/app/studio/page.tsx`
- `app/src/app/studio/layout.tsx`
- `app/src/app/studio/customers/page.tsx`
- `app/src/app/studio/customers/[id]/page.tsx`
- `app/src/app/studio/concepts/page.tsx`
- `app/src/app/studio/upload/page.tsx`
- `app/src/app/studio/invoices/page.tsx`
- `app/src/lib/studio/navigation.ts`
- customer detail components under `components/studio/customer-detail/`
- concept loaders under `lib/conceptLoader*`
- relevant `api/studio-v2/*` routes
- auth/invite/onboarding flows
- `src/types/database.ts` and relevant migrations

## Output style
Be concise, structured, and evidence-oriented.
Use headings and bullets, not long essays.
