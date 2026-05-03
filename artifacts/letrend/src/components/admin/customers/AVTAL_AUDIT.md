# Customer status & avtal billing — audit notes (Task #32)

Source-of-truth map for the customer header / avtal billing area, with the
fixes shipped under task #32. Read this before changing pricing-status,
billing gating, or pill rendering.

## Status / pricing fields and where they come from

| Field shown in UI | Server source | Notes |
|---|---|---|
| `customer.derived_status` (header pill, header banner) | `deriveCustomerStatus(...)` in `lib/admin/customer-status.ts`, computed in `loadAdminCustomerHeader` and in `buildCustomerPayload` | Inputs: `status`, `archived_at`, `paused_until`, `invited_at`, `concepts_per_week`, `expected_concepts_per_week`, `latest_planned_publish_date`, `escalation_flag`. |
| `customer.status` (raw lifecycle column) | `customer_profiles.status` | One of `draft \| pending \| invited \| active \| paused \| cancelled \| archived`. Used by the layout pill via `customerStatusConfig(...)`. |
| `customer.onboarding_state` (Onboarding pill) | `customer_profiles.onboarding_state` | Now suppressed by `[id]/layout.tsx` once status is `active/paused/cancelled/archived` to avoid the duplicate "Aktiv" + "Onboarding: Inbjuden" pair. |
| `customer.pricing_status` ("Pris saknas" banner) | `customer_profiles.pricing_status`; in `routes/admin/customers.ts` the GET endpoint *normalises* to `'fixed' \| 'unknown'` (`'fixed'` only when DB literal is `'fixed'`, else `'unknown'`) | Treat `'unknown'` as a *hint*, never as ground truth. The banner now also requires the absence of `stripe_subscription_id` AND `monthly_price_ore <= 0`. |
| `subscription_status` in billing payload | `routes/admin/customers.ts` GET — derived from raw `customer_profiles.status`, `paused_until`, and a live Stripe `subscriptions.retrieve` when `stripe_subscription_id` is set. | Used by `CustomerBillingRoute` to fall back to a "subscription is linked" decision when the local `stripe_subscription_id` mirror is stale. |
| `stripe_customer_id`, `stripe_subscription_id` | `customer_profiles.*` columns, mirrored by Stripe webhooks. | Now also returned by `loadAdminCustomerHeader` so the header banner can detect "real Stripe sub exists". |

## Endpoint conventions for subscription price changes

- **Preview** (read-only Stripe call):
  - `POST /api/admin/customers/:id/subscription-price/preview`
  - Body: `{ monthly_price_sek: number, mode: 'now' | 'next_period' }`
  - Returns `{ preview: { ..., line_items, invoice_total_ore, ... } }`.
- **Apply**: **known broken / out of scope for task #32.** The picture today:
  - `apiClient.change_subscription_price` does
    `POST /api/admin/customers/:id/subscription-price` with body
    `{ monthly_price, mode }` (note: `monthly_price`, not `monthly_price_sek`).
  - `routes/admin/customers.ts` exposes only `GET` and `PUT` on that path,
    not `POST` — so the call as wired today 404s on the api-server.
  - The *canonical* server-side handler is
    `handleChangeSubscriptionPrice` in
    `letrend/src/lib/admin/customer-actions/change-subscription-price.ts`,
    which calls `applySubscriptionPriceChange` (real Stripe + proration +
    schedule + DB persist + audit log). It is part of the Next-style
    customer-actions dispatcher and may not yet be wired to Express in
    this monorepo migration.
  - The PUT handler that *does* exist in Express is a naive
    `customer_profiles.update({ monthly_price })` with no Stripe call,
    so silently rerouting POST → PUT would *appear* to work while
    skipping the Stripe sync entirely. **Do not** redirect the client
    until the Express side is wired to the real action dispatcher.
  - Recommended follow-up (separate task): port
    `handleChangeSubscriptionPrice` (and the rest of the customer-action
    dispatcher) into the api-server as
    `POST /api/admin/customers/:id/actions/change_subscription_price`,
    matching the `change_account_manager` precedent already in apiClient.
- **Legacy / removed paths** (do NOT call):
  - `POST /api/admin/customers/:id/subscription-preview` — does not exist (a
    GET sibling does, but it is not the preview endpoint).
  - Body field `monthly_price` (no `_sek` suffix) — server validates with the
    `monthly_price_sek` shape and will 400 otherwise.

`hooks/admin/useSubscriptionPricePreview.ts` and
`components/admin/billing/SubscriptionPriceChangeModal.tsx` both target the
canonical endpoint above as of task #32.

## Billing action gating in `CustomerBillingRoute`

Action enablement is computed from three primitives:

```
hasStripeCustomer                = Boolean(data.stripe_customer_id)
hasSubscriptionLink              = Boolean(data.stripe_subscription_id) ||
                                   (hasStripeCustomer &&
                                    ['active','trialing'].includes(data.subscription_status ?? ''))
hasManageableBillingEnvironment  = !data.environment_warning
```

The fall-back inside `hasSubscriptionLink` exists because the local
`stripe_subscription_id` column can lag behind Stripe (e.g. immediately after
a subscription is created in test mode and webhooks haven't finished). When
the live subscription status indicates an existing subscription we should
still allow price changes, pause/resume, and pricing dialogs.

The fall-back is **deliberately restricted** to `'active'` and `'trialing'`
(the two statuses that, in `routes/admin/customers.ts`, are only set after a
successful `stripe.subscriptions.retrieve`). Statuses such as `'paused'` and
`'past_due'` are excluded because the same field can be produced by purely
local derivation (lifecycle status / `paused_until`) and would otherwise let
us enable destructive Stripe actions on customers with no real Stripe link.
We additionally require `stripe_customer_id` to be present, so a customer
with no Stripe relationship at all can never trigger the fall-back.

| Action | Requires |
|---|---|
| Skapa engångsfaktura | `hasStripeCustomer` + `hasManageableBillingEnvironment` |
| Ändra pris | `hasSubscriptionLink` + `hasManageableBillingEnvironment` |
| Pausa / återuppta | `hasSubscriptionLink` + `hasManageableBillingEnvironment` + not cancelled |
| Sätt inledande pris | onboarding contract state (no Stripe gate) |
| Rabatt | always available when `canManageBilling` |

## "Pris saknas" header-banner rule (current)

```
hasStripeSub        = Boolean(customer.stripe_subscription_id)
hasRealMonthlyPrice = (customer.monthly_price_ore ?? 0) > 0
pricingMissing      = !hasStripeSub
                    && !hasRealMonthlyPrice
                    && (customer.pricing_status === 'unknown'
                        || status === 'draft'
                        || customer.agreed_at)
```

Rationale: a real Stripe subscription always carries a price; if we have
either of those signals the banner is a false positive. Keep the legacy
`pricing_status === 'unknown'` clause as a soft hint for genuinely empty
profiles (no sub, no monthly_price).

## Out of scope for task #32

- Live Stripe end-to-end with the production secret key was not exercised in
  this sandbox; only the static endpoint paths and request shapes were
  reconciled.
- Per-endpoint regression tests for the full admin/customers route surface
  (covered by smaller follow-ups when they break).
- The `pricing_status` column itself is still write-once in
  `customer_profiles` and is not synchronised when a Stripe sub is created
  later. A proper migration would either drop the column or update it from
  Stripe webhooks; until then, treat it as advisory only.
