# hagen-ui

`app/` ar source of truth for applikationskoden.
`supabase/migrations` ar source of truth for schema och RBAC-patchar.

## Nuvarande status

Repot innehaller en Next.js-app for LeTrend med:

- rollbaserad access (admin, content manager, customer)
- customer dashboard + concept-flode
- invite/onboarding + betalning (Stripe)
- studio/admin-ytor
- mobilvariant under `/m/*`

## Quick Start

```bash
cd app
npm install
npm run dev
```

Appen kor pa `http://localhost:3000`.

## Sida for sida (hur de hanger ihop)

### 1) Inloggning och roll-routing

- `/login` -> desktop login
- `/m/login` -> mobil login
- lyckad login skickar till:
  - customer: `/feed` (desktop) eller `/m/feed` (mobil)
  - content_manager: `/studio`
  - admin: `/admin`

### 2) Invite till onboarding

- `/auth/callback` tar emot invite/recovery-lank
- anvandaren valjer losenord
- profile setup kor
- customer gar till `/welcome`
- team member gar till `/studio`

### 3) Customer onboarding till betalning

- `/welcome` -> intro-sida for invite-flode
- `/onboarding` -> sammanfattning av avtal/pris
  - laser data fran localStorage + customer profile
  - fallback mot `api/stripe/pending-agreement` om profile-id ar stale
- `/checkout` -> embedded Stripe checkout
- `/checkout/complete` -> verifiering + redirect till korrekt dashboard

### 4) Customer day-to-day

- `/feed` -> huvudvy for kundens plan
- `/` -> legacy dashboard-shell
- `/concept/[id]` -> concept detail
- `/billing` -> fakturor/betalningshistorik
- `/invoice/[id]` -> enskild faktura
- legacy aliaser pekar om:
  - `/customer/feed` -> `/feed`
  - `/customer/concept/[id]` -> `/concept/[id]`

### 5) Studio och Admin

- `/studio` -> content manager workspace
- `/studio/customers` -> kundlista
- `/studio/customers/[id]` -> gameplan + concept + emailjobb for kund
- `/admin` -> admin dashboard
- `/admin/customers`, `/admin/invoices`, `/admin/subscriptions`, `/admin/team`

### 6) Mobil

- `/m` -> mobil root, skickar vidare beroende pa auth/roll
- `/m/feed` -> mobil huvudvy for kundens plan
- `/m/concept/[id]` -> mobil concept detail
- legacy aliaser pekar om:
  - `/m/customer/feed` -> `/m/feed`
  - `/m/customer/concept/[id]` -> `/m/concept/[id]`

## Routing och guardrails

- `app/src/middleware.ts` hanterar:
  - role-based route protection
  - redirect mellan desktop/mobil
  - legacy redirects (`/register`, `/signup`, `/studio-v2` -> `/studio`, gamla customer-feed-paths -> nya feed-paths)

## Viktiga kataloger

- `app/src/app` - pages + API routes
- `app/src/components` - UI-komponenter
- `app/src/contexts` - auth/profile contexts
- `app/src/hooks` - login/dashboard/state-hooks
- `app/src/lib` - domanlogik, Stripe, Supabase helpers
- `supabase/migrations` - kanonisk DB schema/migrations
- `app/supabase/migrations` - legacy/referens, bygg inte vidare har
- `app/tests` - Playwright smoke + auth flows

## Bas-kommandon

```bash
cd app
npm run dev
npm run lint
npm run test
npm run test:smoke
```

## Mer dokumentation

- `app/README.md` - app-specifik setup och struktur
- `docs/SCALABLE_DEVELOPMENT_PLAN.md` - arkitektur/hardening-plan
