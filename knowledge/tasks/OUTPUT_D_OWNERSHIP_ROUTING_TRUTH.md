# Studio Ownership / Routing Truth

## Scope
This document is limited to current code and local migration evidence in `hagen-ui`. It focuses on:

- current role-based routing behavior
- current Studio ownership behavior
- `admin` vs `content_manager` visibility
- the safest v1 rule set for `/studio`, `/studio/home`, and `/studio/customers`

It does not propose schema changes or a full IA redesign.

## Confirmed Routing Truth

### 1. Central role routing exists, but Studio entry does not currently follow it end-to-end

- `getPrimaryRouteForRole()` currently returns:
  - `admin` -> `/admin`
  - `content_manager` -> `/studio/customers`
  - `customer` -> `/feed` or `/m/feed`
  - fallback -> `/feed`
  Evidence: `app/src/lib/auth/navigation.ts`

- The app root `/` uses `getPrimaryRouteForRole(profile, { fallback: '/feed' })`.
  Evidence: `app/src/app/page.tsx`

- Checkout completion also uses `getPrimaryRouteForRole(...)` to resolve the dashboard destination.
  Evidence: `app/src/app/checkout/complete/page.tsx`

- `/studio` itself does not use the helper. It hard-redirects to `/studio/customers`.
  Evidence: `app/src/app/studio/page.tsx`

- There is no current `/studio/home` route.
  Evidence: `app/src/app/studio/home/page.tsx` does not exist

### 2. Login/callback behavior mostly follows the role helper, except for team-invite completion

- Returning users in `/auth/callback` resolve destination through `resolveRoleDestination()` -> `getPrimaryRouteForRole(...)`.
  Evidence: `app/src/app/auth/callback/page.tsx`, `app/src/lib/auth/navigation.ts`

- Normal non-invite success in `/auth/callback` redirects through `getPrimaryRouteForRole(...)`.
  Evidence: `app/src/app/auth/callback/page.tsx`

- Team-member invite completion does not use the helper. It hardcodes `redirectPath = '/studio/customers'`.
  Evidence: `app/src/app/auth/callback/page.tsx`

- Customer invite completion hardcodes `/welcome`, not the role helper.
  Evidence: `app/src/app/auth/callback/page.tsx`

### 3. Middleware treats Studio as an `admin` + `content_manager` surface

- `/studio/**` is protected by middleware.
  Evidence: `app/src/middleware.ts`

- Middleware allows Studio access for `admin` and `content_manager`.
  Evidence: `app/src/middleware.ts`

- Middleware redirects non-Studio roles away from `/studio`:
  - `customer` -> their primary customer route
  - `user` -> `/login?error=access_denied`
  Evidence: `app/src/middleware.ts`, `app/src/lib/auth/navigation.ts`

- `/admin/**` is admin-only. A `content_manager` hitting `/admin` is redirected to their primary route, which is currently `/studio/customers`.
  Evidence: `app/src/middleware.ts`, `app/src/lib/auth/navigation.ts`

### 4. Studio shell behavior is currently shared between `admin` and `content_manager`

- Studio layout uses the same shell for both roles.
  Evidence: `app/src/app/studio/layout.tsx`

- The only explicit shell difference is that `profile.is_admin` gets an extra `/admin` link.
  Evidence: `app/src/app/studio/layout.tsx`

- Studio shell nav is static:
  - `/studio/customers`
  - `/studio/concepts`
  - `/studio/upload`
  - `/studio/invoices`
  Evidence: `app/src/lib/studio/navigation.ts`, `app/src/app/studio/layout.tsx`

- Studio layout also hardcodes unauthenticated redirect to `/login?redirect=/studio/customers`.
  Evidence: `app/src/app/studio/layout.tsx`

### 5. There is no real `studio-admin` role in code today

- The only app roles in schema/types are:
  - `admin`
  - `content_manager`
  - `customer`
  - `user`
  Evidence: `app/src/lib/auth/roles.ts`, `app/src/types/database.ts`

## Confirmed Ownership Truth

### 1. The repo has two ownership fields for customers

- `customer_profiles.account_manager` is a string display field.
- `customer_profiles.account_manager_profile_id` is a UUID foreign key to `profiles.id`.
  Evidence: `app/src/types/database.ts`

- Migration `017_account_manager_sync.sql` explicitly adds `account_manager_profile_id` and backfills it from `team_members.profile_id` using the legacy `account_manager` name.
  Evidence: `app/supabase/migrations/017_account_manager_sync.sql`

### 2. The current app uses the two ownership fields inconsistently

- `/studio/customers` fetches all customers and only uses the string `account_manager` for filtering.
  Evidence: `app/src/app/studio/customers/page.tsx`

- `/api/studio-v2/dashboard` defines "my customers" using `account_manager_profile_id = user.id`.
  Evidence: `app/src/app/api/studio-v2/dashboard/route.ts`

- Admin team reassignment logic also thinks in terms of the string `account_manager` for UI grouping, then calls admin customer PATCH to sync both fields atomically.
  Evidence: `app/src/app/admin/team/page.tsx`, `app/src/app/api/admin/customers/[id]/route.ts`

- The helper `resolveAccountManagerAssignment()` resolves a provided name/email to both a normalized display string and `account_manager_profile_id`.
  Evidence: `app/src/lib/studio/account-manager.ts`

- The helper `assignAccountManager()` also updates both fields together, but it is a utility, not the path used by customer creation.
  Evidence: `app/src/lib/studio/assign-account-manager.ts`

### 3. New customer creation does not currently guarantee UUID ownership assignment

- `POST /api/admin/customers` inserts `account_manager` but does not resolve or persist `account_manager_profile_id`.
  Evidence: `app/src/app/api/admin/customers/route.ts`

- `PATCH /api/admin/customers/[id]` does resolve and store both `account_manager` and `account_manager_profile_id`.
  Evidence: `app/src/app/api/admin/customers/[id]/route.ts`

- Result: customers created through the admin create flow can exist with only the legacy string owner field until a later PATCH/reassignment path runs.
  Evidence: `app/src/app/api/admin/customers/route.ts`, `app/src/app/api/admin/customers/[id]/route.ts`, `app/supabase/migrations/017_account_manager_sync.sql`

### 4. Current Studio visibility for `content_manager` is global, not assignment-scoped

- `/studio/customers` issues an unscoped `select('*')` on `customer_profiles`.
  Evidence: `app/src/app/studio/customers/page.tsx`

- Local RLS migration evidence says CMs can `SELECT` all `customer_profiles`, not just assigned ones.
  Evidence: `app/supabase/migrations/012_cleanup_is_admin_rls.sql`

- Local RLS migration evidence also says CMs can view and manage all `customer_concepts`, not just assigned-customer rows.
  Evidence: `app/supabase/migrations/012_cleanup_is_admin_rls.sql`

- Local RLS migration evidence says CMs can view/manage all `customer_game_plans`.
  Evidence: `app/supabase/migrations/021_customer_game_plans_notes_first.sql`, `app/supabase/migrations/022_reconcile_live_customer_workspace_schema.sql`

- Core Studio workspace APIs do not check customer ownership. They only require role membership (`admin` or `content_manager`) and then use a service-role Supabase client.
  Evidence: `app/src/lib/auth/api-auth.ts`, `app/src/lib/server/supabase-admin.ts`, `app/src/app/api/studio-v2/customers/[customerId]/game-plan/route.ts`, `app/src/app/api/studio-v2/customers/[customerId]/concepts/route.ts`, `app/src/app/api/studio-v2/customers/[customerId]/notes/route.ts`, `app/src/app/api/studio-v2/email/send/route.ts`, `app/src/app/api/studio-v2/email/jobs/route.ts`, `app/src/app/api/studio-v2/feed-spans/route.ts`

- `/studio/customers/[id]` itself is just a thin wrapper around the workspace component and does not add an ownership gate.
  Evidence: `app/src/app/studio/customers/[id]/page.tsx`

### 5. Today's real ownership model is metadata, not enforced routing

- The repo does contain assignment metadata and a "my customers" query path.
- But the Studio routes and workspace APIs are currently built around global CM access.
- In current-system terms, ownership exists mainly as:
  - display/filter metadata for lists
  - a dashboard subset query
  - subscription RLS for CM-assigned customers
  not as the primary access-control boundary for Studio.
  Evidence: `app/src/app/studio/customers/page.tsx`, `app/src/app/api/studio-v2/dashboard/route.ts`, `app/supabase/migrations/020_subscriptions_admin_rls.sql`

## Access / Visibility Matrix

| Role | `/studio` | `/studio/customers` | `/studio/customers/[id]` | `/studio/invoices` | `/admin` | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `admin` | Allowed. Current destination is `/studio/customers` because `app/src/app/studio/page.tsx` hardcodes it. | Allowed. Global customer list. | Allowed. Global workspace access. | Allowed. | Allowed. `/admin` redirects to `/admin/customers`. | `getPrimaryRouteForRole(admin)` still points to `/admin`, not `/studio`. |
| `content_manager` | Allowed. Current destination is `/studio/customers`. | Allowed. Current page requests all customers and local RLS also allows all `customer_profiles`. | Allowed. Current route and APIs do not enforce assignment ownership. | Allowed. Route and sync API both allow CM. | Blocked. Middleware redirects CM from `/admin` to their primary route, currently `/studio/customers`. | Current Studio behaves as globally visible for CM. |
| `customer` | Blocked. Middleware redirects to customer primary route. | Blocked. | Blocked. | Blocked. | Blocked. | `getPrimaryRouteForRole(customer)` -> `/feed` or `/m/feed`. |
| `user` | Blocked. Redirects to `/login?error=access_denied`. | Blocked. | Blocked. | Blocked. | Blocked. `/admin` sends `user` to `/` with `error=admin_required`. | Lowest-permission fallback role. |

## Risks For The First PR

### Confirmed implementation risks

- Changing `getPrimaryRouteForRole('content_manager')` alone is not enough.
  `app/src/app/studio/page.tsx`, `app/src/app/studio/layout.tsx`, and the team-invite path in `app/src/app/auth/callback/page.tsx` all hardcode `/studio/customers`.

- A CM home that relies only on `/api/studio-v2/dashboard` can undercount "my customers".
  That endpoint uses `account_manager_profile_id`, but `POST /api/admin/customers` does not populate that field.

- Hiding global customer routes in nav would not change access behavior.
  Middleware and Studio APIs still allow CM access broadly.

- Restricting `/studio/customers` to assigned customers in v1 would be a behavioral change larger than a routing PR.
  Current pages, local RLS, and service-role APIs all assume CM can access broader customer data.

- The API auth helper comments mention middleware-injected `x-user-*` headers, but middleware currently does not set them.
  Current API auth works by cookie/session lookup instead.
  Evidence: `app/src/lib/auth/api-auth.ts`, `app/src/middleware.ts`

### Inference

- The least risky first PR is still a routing/nav PR, but only if it treats ownership as a display/default concern, not a new hard authorization boundary.

## Recommended V1 Rule Set

### Recommendation

- `admin`
  - keep app primary route as `/admin`
  - keep `/studio` -> `/studio/customers`
  - keep `/studio/customers` as the broad operational index

- `content_manager`
  - change primary route to `/studio/home`
  - change `/studio` to redirect to `/studio/home`
  - keep `/studio/customers` accessible as a secondary index

- `/studio/home`
  - make this the CM default
  - use assigned-customer-first data from `/api/studio-v2/dashboard`
  - present it as "my customers / my work" rather than as the only customer visibility surface

- `/studio/customers`
  - keep global in v1
  - for CM, make "my customers" a default filter/view, not a hard access restriction

### Why this is the safest v1

- It matches current permissions more closely than an assignment-only lockout.
- It does not require schema changes.
- It uses the ownership signal that already exists (`account_manager_profile_id`) without pretending it is complete enough to be the sole gate.
- It preserves current admin and CM workflows that depend on broad cross-customer access.

### Direct answer to the primary questions

#### 1. How does role-based routing actually work now?

- Central helper truth:
  - `admin` -> `/admin`
  - `content_manager` -> `/studio/customers`
  - `customer` -> `/feed`
- Real Studio entry today:
  - `/studio` always goes to `/studio/customers`
  - Studio shell is shared for admin and CM
  - team-member invite completion also hardcodes `/studio/customers`

#### 2. What is the real current ownership model for customers in Studio?

- There are two ownership fields:
  - legacy string owner: `account_manager`
  - newer UUID owner: `account_manager_profile_id`
- Current Studio access is not enforced by either field.
- In practice, CM ownership today is metadata plus optional "my customers" querying, not the main access-control boundary.

#### 3. Should `content_manager` see all customers, assigned customers, or both with different defaults?

- Confirmed current-system truth: CM currently sees all customers.
- Safest v1 recommendation: both, with different defaults.
  - `/studio/home` should be assigned-customer-first.
  - `/studio/customers` should remain globally accessible in v1.

#### 4. What is the safest v1 ownership/routing rule for `/studio`, `/studio/home`, and `/studio/customers`?

- `/studio`
  - `admin` -> `/studio/customers`
  - `content_manager` -> `/studio/home`

- `/studio/home`
  - CM-only default landing
  - powered by assigned-customer-first dashboard data
  - not treated as the sole source of truth for all customer access

- `/studio/customers`
  - keep visible to admin and CM
  - keep global access in v1
  - CM view can default to "my customers" filter, but route should still support broader browsing

## Inference

- `account_manager_profile_id` is the more trustworthy ownership key for future routing/defaults because it is an actual profile foreign key and is already used by `/api/studio-v2/dashboard` and subscription RLS.

- `account_manager` still matters operationally because major admin UIs and filters still depend on it, and some creation flows write only that field.

- A fully assignment-scoped Studio would require more than the first PR:
  - customer creation path fixes
  - backfill verification
  - likely API ownership checks
  - likely route-level policy changes

## Blocked Questions / Unknowns

- Is live production fully migrated so that `account_manager_profile_id` is populated for all relevant customers?
  Local migrations show intent, but repo code cannot confirm live data completeness.

- Are all customer-creation and customer-edit flows outside the inspected admin pages keeping both ownership fields in sync?
  The repo shows mixed paths.

- Should CM global visibility remain a product feature, or is it only a legacy side effect?
  The current code supports it, but intent cannot be settled from code alone.

- Should `/studio/customers` eventually become assignment-scoped for CM, or only default-filtered?
  Current code supports either future, but only the default-filtered version is low-risk today.

- Are there live RLS drifts outside the checked migration files?
  Local migration files provide strong evidence, but deployed policy state is not directly inspectable from repo code alone.
