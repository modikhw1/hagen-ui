# App (Source of Truth)

Detta ar huvudapplikationen for hagen-ui.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase (auth + data)
- Stripe (billing)
- Mantine

## Kora lokalt

```bash
npm install
npm run dev
```

## Viktiga scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:smoke
npm run migrate:concepts
```

## Huvudstruktur

- `src/app` - pages och API-routes
- `src/components` - UI-komponenter
- `src/lib` - integrations och helpers
- `src/contexts` - auth/profile-context
- `src/hooks` - route/login/dashboard-hooks
- `supabase/migrations` - SQL-migrationer
- `tests` - Playwright smoke + auth flows

## Nuvarande routingmodell

- `/` ar customer huvuddashboard (desktop)
- `/login` och `/m/login` ar inloggningssidor
- `/m` ar mobil root som routar vidare beroende pa auth/roll
- `/auth/callback` hanterar invite/recovery + password setup
- onboarding/betalning: `/welcome` -> `/onboarding` -> `/checkout` -> `/checkout/complete`
- customer feed finns i separat flode:
  - `/customer/feed`
  - `/customer/concept/[id]`
  - mobil: `/m/customer/feed`, `/m/customer/concept/[id]`
- content manager: `/studio/*`
- admin: `/admin/*`

## Hur routes binds ihop

- `src/proxy.ts` gor role-based route protection och mobil/desktop redirects.
- `src/hooks/useLoginForm.ts` avgor post-login destination per roll.
- `src/app/auth/callback/page.tsx` avgor destination efter invite/password setup.
- `src/app/api/admin/profiles/setup/route.ts` kopplar profile <-> customer_profile.

## Kvalitetsmal

- Hall `src/app/api` tunn; flytta affarslogik till `src/lib/services`.
- Hall types och validering nara API-granser.
- Undvik att vaxa fler mega-pages; bryt ut feature-komponenter tidigt.
