# Output F - Invite / Prep Lifecycle

## Scope

This document traces the current lifecycle in code for:

- customer record creation
- invite issuance
- auth/password setup
- profile linking
- onboarding/agreement/checkout
- activation/payment
- demo/prep exposure before registration

It is optimized for current-system truth, not for ideal redesign.

## 1. Canonical lifecycle map

## Current canonical customer lifecycle in code

### A. Admin creates a customer record before any auth user exists

Current canonical entry point for customer onboarding starts in Admin:

- `POST /api/admin/customers` inserts a `customer_profiles` row with `status: 'pending'`.
- This row can already contain business data, contact email, account manager, contract fields, scope items, legacy `game_plan`, and legacy `concepts`.

Evidence:

- `app/src/app/api/admin/customers/route.ts`
- `app/src/types/database.ts` (`customer_profiles`)

### B. Admin sends invite from the existing customer record

Current canonical customer invite path:

- `PATCH /api/admin/customers/[id]` with `action: 'send_invite'`
- optionally creates Stripe customer + Stripe subscription first
- calls `supabaseAdmin.auth.admin.inviteUserByEmail(...)`
- passes `customer_profile_id`, `stripe_customer_id`, and `stripe_subscription_id` into auth metadata
- updates `customer_profiles.status` to `invited`
- stamps `invited_at`

Evidence:

- `app/src/app/api/admin/customers/[id]/route.ts`

### C. Invite recipient lands in auth callback and sets password

The invite email/callback flow currently works like this:

- `/auth/callback` checks session + invite markers in auth metadata
- if invite markers exist, user is sent to password setup UI
- after password is set, callback stores onboarding continuity in `localStorage`
- callback calls `POST /api/admin/profiles/setup`

For customer invites, callback then redirects to `/welcome`.

Evidence:

- `app/src/app/auth/callback/page.tsx`
- `app/src/app/api/admin/profiles/setup/route.ts`

### D. `profiles.setup` links auth user to customer record and marks customer active immediately

This is the most important lifecycle truth in the repo:

- `POST /api/admin/profiles/setup` resolves `customer_profile_id` from:
  - request body
  - `contact_email`
  - `stripe_customer_id`
- it creates or updates the `profiles` row
- for non-team members it sets profile role to `customer`
- if a matching `customer_profiles` row is found, it updates that row to:
  - `status: 'active'`
  - `agreed_at: now`

This happens during profile setup, before agreement/checkout is completed.

Evidence:

- `app/src/app/api/admin/profiles/setup/route.ts`

### E. Customer then moves through welcome -> onboarding -> agreement -> checkout

After password setup, the customer flow is:

1. `/welcome`
2. `/onboarding`
3. `/agreement`
4. `/checkout`
5. `/checkout/complete`

Continuity is mostly maintained with `localStorage`:

- `pending_agreement_email`
- `onboarding_business_name`
- `onboarding_customer_profile_id`
- pricing/contract preview fields

Onboarding and agreement fetch Stripe/customer contract data from:

- `/api/stripe/pending-agreement`
- `/api/admin/customers/[id]`
- optional `/api/stripe/public-agreement`

Evidence:

- `app/src/app/welcome/page.tsx`
- `app/src/app/onboarding/page.tsx`
- `app/src/app/agreement/page.tsx`
- `app/src/app/checkout/page.tsx`
- `app/src/app/api/stripe/pending-agreement/route.ts`
- `app/src/app/api/stripe/public-agreement/route.ts`

### F. Payment and activation are finalized by checkout/session verification and Stripe webhooks

Payment completion can further update state in multiple places:

- `/api/stripe/verify-checkout-session` updates `customer_profiles` with:
  - `stripe_subscription_id`
  - `stripe_customer_id`
  - `status: 'active'`
  - `activated_at`
- Stripe webhook `invoice.paid` also updates `customer_profiles.status` to `active`
- Stripe webhook `customer.subscription.updated/created` updates `customer_profiles.status` to:
  - `active` when Stripe subscription is active
  - otherwise `pending`
- Stripe webhook `invoice.payment_failed` updates `customer_profiles.status` to `past_due`
- Stripe webhook `customer.subscription.deleted` updates `customer_profiles.status` to `cancelled`

Evidence:

- `app/src/app/api/stripe/verify-checkout-session/route.ts`
- `app/src/app/api/stripe/webhook/route.ts`

### G. Demo/prep exposure can happen before registration and before login

The repo already supports prep/demo work before customer registration:

- Studio demo panel exposes public `/demo/[customerId]`
- `/api/demo/import-history` lets admin/CM import TikTok history into `customer_concepts`
- public demo route renders for any non-archived customer
- demo route loads:
  - customer business info
  - game plan
  - feed/timeline/history rows

So meaningful customer-facing prep exists before customer login.

Evidence:

- `app/src/components/studio/customer-detail/CustomerDemoPanel.tsx`
- `app/src/app/api/demo/import-history/route.ts`
- `app/src/app/demo/[customerId]/page.tsx`

## Practical current-state lifecycle summary

The clearest current lifecycle is:

1. Admin creates `customer_profiles` row -> `pending`
2. Admin sends invite from that row -> `invited`
3. Customer sets password in `/auth/callback`
4. `profiles.setup` links auth user to customer and marks customer `active` immediately
5. Customer continues through welcome/onboarding/agreement/checkout
6. Stripe checkout/session verification and webhooks also reinforce or mutate payment-related status
7. Demo/prep can happen before step 3 and is already exposed publicly by customer ID

## Important interpretation

In current code, `active` does **not** strictly mean "paid and fully activated after checkout".

It is already assigned during `profiles.setup`, which is earlier than payment completion.

## 2. Status and state table

| State / status | Where set | Where used | Current meaning in practice |
| --- | --- | --- | --- |
| `pending` | `POST /api/admin/customers`; Stripe subscription webhook fallback for non-active subscriptions | Admin and Studio customer lists; dashboard pending counts; pending agreement/public agreement surfaces | Pre-invite customer record exists, or Stripe lifecycle pushed record back to generic pending |
| `invited` | `PATCH /api/admin/customers/[id]` with `send_invite`; `POST /api/stripe/create-subscription-from-profile` | Admin and Studio customer lists; resend-invite UI; dashboard pending counts | Invite has been issued from an existing customer record |
| `active` | `POST /api/admin/profiles/setup`; `PATCH /api/admin/customers/[id]` with `activate`; `/api/stripe/verify-checkout-session`; Stripe `invoice.paid`; Stripe subscription webhook | Admin and Studio lists; customer-facing access assumptions; dashboard active counts | Overloaded: can mean linked/registered, manually activated, or paid/active in Stripe |
| `agreed` | No inspected route sets `status: 'agreed'`; only `agreed_at` timestamp is written | Admin and Studio TS unions and labels still treat it as active-like | Legacy/compat state that UI still understands, but current inspected APIs do not create |
| `archived` | Admin UI archives directly via Supabase update | Admin/Studio lists; public demo blocks archived customers | Archived/hidden customer |
| `pending_payment` | `/api/admin/customers/decline-agreement` | Not included in Studio/Admin status unions inspected | Agreement/payment declined or deferred, but only partially modeled in UI/types |
| `past_due` | Stripe webhook `invoice.payment_failed`; agreement/payment surfaces return it | Not included in Studio/Admin customer status unions; used in Stripe-facing agreement logic | Stripe billing failure state leaking into `customer_profiles.status` |
| `cancelled` | Stripe webhook `customer.subscription.deleted`; pending/public agreement APIs return cancelled | Not included in Studio/Admin customer status unions | Stripe cancellation state leaking into `customer_profiles.status` |
| `agreed_at` timestamp | `profiles.setup`; admin manual `activate` | Not a status, but used as lifecycle evidence | Timestamp currently used even when payment may not be complete |
| `invited_at` timestamp | admin `send_invite` | lifecycle/history only | Invite issued time |
| `activated_at` timestamp | `/api/stripe/verify-checkout-session` | checkout completion path | Checkout-confirmed activation marker |
| `declined_at` timestamp | `/api/admin/customers/decline-agreement` | decline path only | Decline marker for pending-payment path |

## Status truth notes

### `agreed` vs `active`

- `agreed` still exists in front-end unions and labels:
  - `app/src/types/studio-v2.ts`
  - `app/src/lib/studio/customer-status.ts`
  - `app/src/app/admin/customers/page.tsx`
  - `app/src/app/studio/customers/page.tsx`
- but inspected backend routes do not set `status: 'agreed'`
- current code writes `agreed_at` while setting `status: 'active'`

Conclusion:

- `agreed` is legacy-compatible UI vocabulary
- `active` is the actual status currently written by modern invite/setup/checkout flows

### Type mismatch

`customer_profiles.status` is `string | null` in generated DB types, but Studio/Admin local TS unions only allow:

- `pending`
- `active`
- `archived`
- `invited`
- `agreed`

Meanwhile runtime code also writes:

- `pending_payment`
- `past_due`
- `cancelled`

Conclusion:

- lifecycle data can already exceed the front-end unions
- current UI typing understates real backend states

## 3. Invite-path comparison

| Path | Purpose | What it creates/updates | Linked to `customer_profiles`? | Stripe-aware? | Appears canonical? |
| --- | --- | --- | --- | --- | --- |
| Admin customer invite via `PATCH /api/admin/customers/[id]` with `send_invite` | External customer onboarding from existing customer record | Invites auth user, updates `customer_profiles`, may create Stripe customer/subscription first | Yes | Yes | Yes, for customer onboarding |
| `POST /api/auth/invite` | Simple invite helper returning an invite link | Creates auth user directly via `createUser`, inserts `profiles` row, returns manual invite link | No | No meaningful `customer_profiles` linkage | No, appears legacy/parallel |
| Team invite via `POST /api/admin/team` with `sendInvite` | Internal team member onboarding | Creates `team_members` row, sends Supabase invite | No customer linkage | No | Yes, for team member onboarding |

## Which invite path is actually canonical?

### Canonical for customers

The canonical customer invite path is clearly:

- admin customer record first
- then `PATCH /api/admin/customers/[id]` with `action: 'send_invite'`

Why:

- it starts from `customer_profiles`
- it carries `customer_profile_id` into auth metadata
- it stores invite timestamps and contract data on the customer row
- it integrates with Stripe/subscription setup
- it is the flow used by Admin customer UI

Evidence:

- `app/src/app/admin/customers/page.tsx`
- `app/src/app/api/admin/customers/route.ts`
- `app/src/app/api/admin/customers/[id]/route.ts`

### Canonical for team members

The canonical internal team invite path is:

- `POST /api/admin/team` with `sendInvite`

It creates `team_members` first and then invites the auth user.

Evidence:

- `app/src/app/api/admin/team/route.ts`

### `POST /api/auth/invite`

This route looks legacy or parallel, not canonical:

- no inspected route/UI in `app/src` calls it
- it uses `auth.admin.createUser(...)`, not `inviteUserByEmail(...)`
- it does not create or update `customer_profiles`
- it pre-creates a `profiles` row
- it returns a generated invite link instead of participating in the Admin customer workflow

Evidence:

- `app/src/app/api/auth/invite/route.ts`
- repo search shows no active UI callsite

## 4. Prep/demo capabilities already present

## What can already happen before customer registration?

### Before auth user exists

Already possible:

- create a real `customer_profiles` row in Admin
- assign account manager and contract data
- keep customer in Studio/Admin lists as `pending`
- open Studio workspace for that customer
- prepare game plan / notes / concepts / feed / communication in Studio
- open demo section
- import TikTok history into feed timeline
- generate and share public demo URL

Evidence:

- `app/src/app/api/admin/customers/route.ts`
- `app/src/app/studio/customers/page.tsx`
- `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `app/src/components/studio/customer-detail/CustomerDemoPanel.tsx`
- `app/src/app/api/demo/import-history/route.ts`

### After invite but before registration is complete

Already possible:

- customer row remains operational in Studio/Admin as `invited`
- CM/admin can continue prep work in workspace
- public demo page still works
- agreement/payment data may already exist via Stripe customer/subscription

Evidence:

- `app/src/app/api/admin/customers/[id]/route.ts`
- `app/src/app/demo/[customerId]/page.tsx`
- `app/src/app/api/stripe/pending-agreement/route.ts`

### Public demo exposure today

Public `/demo/[customerId]` currently exposes:

- business name
- logo
- brief
- resolved game plan HTML
- all feed items/history rows with non-null `feed_order`

The only explicit block in the route is:

- `customer.status === 'archived'`

Evidence:

- `app/src/app/demo/[customerId]/page.tsx`

## 5. Risks and inconsistencies

## Highest-risk lifecycle inconsistencies

### 1. `active` is overloaded and currently means too many things

Current code uses `active` for at least three different milestones:

- linked/registered during `profiles.setup`
- manual admin activation
- Stripe-paid/checkout-confirmed activation

This is the biggest lifecycle ambiguity in the repo.

Evidence:

- `app/src/app/api/admin/profiles/setup/route.ts`
- `app/src/app/api/admin/customers/[id]/route.ts`
- `app/src/app/api/stripe/verify-checkout-session/route.ts`
- `app/src/app/api/stripe/webhook/route.ts`

### 2. `agreed` still exists in UI, but modern backend flow does not set it

The UI and filters still expect `agreed`, but inspected APIs set:

- `agreed_at`
- `status: 'active'`

This makes `agreed` a semantic ghost state.

### 3. Backend writes statuses that front-end customer unions do not model

Current routes write:

- `pending_payment`
- `past_due`
- `cancelled`

but Studio/Admin customer unions and status helper do not include them.

Risk:

- unhandled rendering states
- misleading filters/counts
- future prep lifecycle work built on incomplete unions

### 4. Team invite flow appears metadata-misaligned in callback

`/api/admin/team` sends invite metadata with:

- `isTeamMember: true`
- `role`
- `team_member_id`

But `/auth/callback` identifies a team invite via:

- `user_metadata.invited_as === 'team_member'`
- or `?flow=team_invite`

That does not match the actual invite metadata in the team route.

Risk:

- team invite may be treated as customer flow during password setup
- wrong role/profile setup path may run unless other external behavior compensates

Evidence:

- `app/src/app/api/admin/team/route.ts`
- `app/src/app/auth/callback/page.tsx`

### 5. `/api/auth/invite` duplicates invite behavior with a different model

This route:

- creates auth user directly
- inserts `profiles`
- does not use `customer_profiles`
- is not obviously used by current UI

Risk:

- parallel onboarding semantics
- confusing fallback/legacy behavior
- harder lifecycle formalization later

### 6. Public demo route is broadly exposed

`/demo/[customerId]` is public and only blocks archived customers.

Risk:

- pre-registration materials are publicly accessible by customer profile ID
- game plan/feed prep may be viewable before explicit sharing control exists

### 7. Public agreement route exposes Stripe-customer-based billing state without auth

`/api/stripe/public-agreement` is intentionally public and keyed by Stripe customer ID (`cus_...`).

Risk:

- billing/subscription visibility if customer ID leaks

### 8. Welcome/onboarding continuity relies heavily on `localStorage`

The customer invite flow uses:

- `pending_agreement_email`
- `onboarding_customer_profile_id`
- other local state

Risk:

- brittle cross-tab/cross-device behavior
- partial state if callback/setup succeeds but browser storage is cleared

## 6. Safest v1 recommendation

## Principle

Do not rewrite lifecycle states first.

The safest v1 move is to formalize prep/pre-invite by **mapping current semantics onto current states**, then improve UI behavior around them.

## Recommended v1 interpretation of current states

Use current states like this in v1 UI/product behavior:

- `pending` => prep customer exists, no invite sent yet
- `invited` => prep customer with invite issued, registration incomplete
- `active` => linked/registered customer record
- `agreed` => treat as legacy alias of active in list/filter logic
- `archived` => closed/hidden

For v1, do **not** rename database statuses to `prep`, `registered`, `paused`, `closed` yet.

Instead:

- map `pending` to prep semantics in Studio
- map `invited` to invited/pre-registration semantics
- treat `active` as current registered/linked state
- keep Stripe/payment-specific states as backend compatibility concerns until lifecycle cleanup is designed

## Safest v1 product behavior changes

These are safe before backend redesign:

- surface `pending` and `invited` more clearly in `/studio/customers`
- treat `demo` section as the current prep/pre-invite workspace
- keep allowing CM/admin to work on customer prep before registration
- avoid changing underlying onboarding routes in the first prep-focused PR
- keep customer invite flow anchored on existing Admin customer records
- treat `/api/auth/invite` as legacy/parallel and do not build new product flow on top of it

## Safest v1 backend stance

- keep the admin customer invite flow as canonical for customers
- keep team invite flow separate
- do not introduce new lifecycle statuses until:
  - `active` is split conceptually from payment activation
  - `agreed` is either removed or given a real writer
  - front-end unions are aligned with actual runtime statuses

## Recommended v1 cleanup order

1. UI-only prep framing:
   - make `pending` and `invited` visible and actionable in Studio
   - frame `demo` as prep workspace
2. Lifecycle truth cleanup:
   - document `active` as overloaded
   - align front-end status unions with actual backend writes
3. Invite-path cleanup:
   - explicitly deprecate or quarantine `/api/auth/invite` if it is truly unused
   - fix team invite metadata mismatch in callback
4. Later lifecycle redesign:
   - decide whether to split:
     - prep
     - invited
     - registered
     - paid/active

## Bottom line

The safest v1 path is:

- reuse `pending` and `invited` as the operational prep/pre-invite stages
- keep admin customer invite as the canonical customer flow
- preserve onboarding/checkout as-is
- avoid renaming statuses until the repo stops using `active` for both registration and payment activation

That gives Studio a real pre-invite/pre-registration workflow without breaking the existing onboarding model.
